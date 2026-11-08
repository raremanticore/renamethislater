import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import type { Config } from './config.ts';
import { Store } from './database.ts';
import { createSession, readSession, secretMatches } from './auth.ts';
import { LocalBankingRepository, csv } from './banking.ts';
import type { BankingRepository } from './banking.ts';
import type { Action, Authorization, DemoSessionResponse, ErrorResponse, ProtectionResponse, ResetResponse } from './contracts.ts';
import { SecurityEngine } from './security.ts';
import { eventPage, overview, sessionDetail } from './dashboard.ts';
import { explain } from './explanations.ts';
import { NessieBankingRepository, NessieError } from './nessie.ts';
import { ANALYST_MAX_EVENTS, SecurityAnalyst } from './analyst.ts';
import type { AnalysisResponse } from './contracts.ts';

class HttpError extends Error {
  status: number; code: string;
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; }
}
function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}
async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (req.headers['content-type']?.split(';')[0]?.trim() !== 'application/json') throw new HttpError(415, 'json_required', 'Use application/json');
  const parts: Buffer[] = [];
  let length = 0;
  for await (const part of req) {
    length += part.length;
    if (length > 4096) throw new HttpError(413, 'body_too_large', 'Request body exceeds 4096 bytes');
    parts.push(part);
  }
  try {
    const data: unknown = JSON.parse(Buffer.concat(parts).toString('utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
    return data as Record<string, unknown>;
  } catch { throw new HttpError(400, 'invalid_json', 'Expected a JSON object'); }
}
function pagination(url: URL) {
  const rawLimit = url.searchParams.get('limit') ?? '50';
  const cursor = url.searchParams.get('cursor');
  if (!/^\d+$/.test(rawLimit) || Number(rawLimit) < 1 || Number(rawLimit) > 100)
    throw new HttpError(400, 'invalid_pagination', 'limit must be an integer from 1 to 100');
  if (cursor !== null && (!/^[1-9]\d*$/.test(cursor) || !Number.isSafeInteger(Number(cursor))))
    throw new HttpError(400, 'invalid_cursor', 'Invalid event cursor');
  return { limit: Number(rawLimit), before: cursor ? Number(cursor) : Number.MAX_SAFE_INTEGER };
}
export function createApplication(config: Config, dependencies: { store?: Store; bank?: BankingRepository; now?: () => number; analystFetch?: typeof fetch; nessieFetch?: typeof fetch } = {}) {
  if (!config.demoMode) throw new Error('Set DEMO_MODE=true to explicitly enable development-only sessions');
  const store = dependencies.store ?? new Store(config.databasePath);
  store.seed();
  const bank = dependencies.bank ?? (config.bankingProvider === 'nessie'
    ? new NessieBankingRepository(config, dependencies.nessieFetch) : new LocalBankingRepository(store));
  const bankingSource = bank.source ?? config.bankingProvider;
  const analyst = new SecurityAnalyst(config, dependencies.analystFetch);
  const engine = new SecurityEngine(store, config);
  const clock = dependencies.now ?? Date.now;
  const server = createServer(async (req, res) => {
    const requestId = randomUUID(); // Ignore untrusted incoming request IDs.
    res.setHeader('X-Request-ID', requestId);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const fail = (status: number, code: string, message: string) => {
      const error: ErrorResponse = { error: { code, message, requestId } };
      json(res, status, error);
    };
    try {
      const now = clock();
      store.prune(now, config.windowMs, config.eventRetentionMs);
      const url = new URL(req.url ?? '/', config.origin);
      const path = url.pathname;
      const session = readSession(store, req.headers.cookie, now);
      if (req.method === 'POST' && (path === '/api/demo/session' || path.startsWith('/api/security/'))) {
        if ((req.headers.origin && req.headers.origin !== config.origin) || req.headers['sec-fetch-site'] === 'cross-site')
          throw new HttpError(403, 'origin_denied', 'Use the configured application origin');
      }
      if (path === '/api/health' && req.method === 'GET') return json(res, 200, { status: 'ok', developmentOnly: true, bankingSource });
      if (path === '/api/demo/session' && req.method === 'POST') {
        const data = await body(req);
        if (data.handle !== 'alice' && data.handle !== 'bob' && data.handle !== 'admin')
          throw new HttpError(400, 'invalid_demo_user', 'Use demo handle alice, bob, or admin');
        if (data.handle === 'admin' && (typeof data.adminKey !== 'string' || !secretMatches(data.adminKey, config.adminKey)))
          throw new HttpError(403, 'admin_denied', 'Demo administrator credentials required');
        const result = createSession(store, data.handle, now, config)!;
        res.setHeader('Set-Cookie', result.cookie);
        const response: DemoSessionResponse = { developmentOnly: true, sessionId: result.session.id,
          expiresAt: new Date(result.session.expiresAt).toISOString(),
          user: { handle: result.session.handle, role: result.session.role },
          accountIds: bank.accountIds ? await bank.accountIds(result.session.userId)
            : store.db.prepare('SELECT id FROM accounts WHERE user_id=? ORDER BY id').all(result.session.userId).map(row => String(row.id)),
          bankingSource,
        };
        return json(res, 201, response);
      }
      if (path.startsWith('/api/security/')) {
        if (!session) return fail(401, 'authentication_required', 'A valid server session is required');
        if (session.role !== 'admin') return fail(403, 'admin_required', 'Demo administrator access required');
        const analysisRoute = /^\/api\/security\/sessions\/([a-f0-9-]{36})\/analysis$/.exec(path);
        if (analysisRoute && req.method === 'POST') {
          await body(req); // No client events/prompts are accepted; enforce the normal JSON/body cap.
          const id = analysisRoute[1]!;
          const detail = sessionDetail(store, engine, id, now, 1, Number.MAX_SAFE_INTEGER);
          if (!detail) return fail(404, 'session_not_found', 'Session not found');
          const events = store.events(ANALYST_MAX_EVENTS, Number.MAX_SAFE_INTEGER, id).map(row => row.event)
            .filter(event => Date.parse(event.timestamp) > now - config.windowMs && Date.parse(event.timestamp) <= now);
          // Snapshot enforcement before awaiting advice; model output never enters the engine.
          const response: AnalysisResponse = { apiVersion: '1', sessionId: id, generatedAt: new Date(now).toISOString(),
            sample: { eventCount: events.length, maxEvents: ANALYST_MAX_EVENTS, windowMs: config.windowMs,
              firstEventAt: events.at(-1)?.timestamp ?? null, lastEventAt: events[0]?.timestamp ?? null },
            enforcement: { currentDecision: detail.session.decision, currentRiskScore: detail.session.riskScore, protection: engine.status(),
              blockedRequests: events.filter(event => event.decision === 'block').map(event => ({ requestId: event.requestId,
                triggeredRules: event.triggeredRules, reasons: event.reasons, riskScore: event.riskScore, basis: event.enforcement ?? null })) },
            analysis: await analyst.review(events),
          };
          return json(res, 200, response);
        }
        if (req.method === 'GET' && path === '/api/security/overview') return json(res, 200, overview(store, engine, now));
        if (req.method === 'GET' && path === '/api/security/events') {
          const { limit, before } = pagination(url);
          return json(res, 200, eventPage(store, limit, before));
        }
        const detail = /^\/api\/security\/sessions\/([a-f0-9-]{36})(\/explanation)?$/.exec(path);
        if (detail && req.method === (detail[2] ? 'POST' : 'GET')) {
          const { limit, before } = pagination(url);
          const result = sessionDetail(store, engine, detail[1]!, now, limit, before);
          if (!result) return fail(404, 'session_not_found', 'Session not found');
          if (detail[2]) return json(res, 200, await explain(result.timeline, config));
          return json(res, 200, result);
        }
        if (req.method === 'POST' && path === '/api/security/demo/reset') {
          await body(req);
          store.resetSecurity();
          const response: ResetResponse = { apiVersion: '1', resetAt: new Date(clock()).toISOString(), protection: engine.status() };
          return json(res, 200, response);
        }
        if (req.method === 'POST' && path === '/api/security/demo/protection') {
          const data = await body(req);
          if (typeof data.enabled !== 'boolean') return fail(400, 'invalid_protection', 'enabled must be a boolean');
          store.protectionEnabled = data.enabled;
          const response: ProtectionResponse = { apiVersion: '1', protection: engine.status() };
          return json(res, 200, response);
        }
        return fail(404, 'route_not_found', 'Route not found');
      }
      const accountRoute = /^\/api\/bank\/accounts\/([^/]+)(?:\/(transactions|export))?$/.exec(path);
      const decoy = path === '/api/bank/decoy/export';
      if (accountRoute || decoy) {
        res.setHeader('X-Banking-Source', bankingSource);
        const id = accountRoute?.[1] ?? '';
        const suffix = accountRoute?.[2];
        const action: Action = decoy ? 'decoy.export' : suffix === 'export' ? 'account.export' : suffix === 'transactions' ? 'transactions.read' : 'account.read';
        const targetResource = decoy ? '/api/bank/decoy/export' : `/api/bank/accounts/:id${suffix ? `/${suffix}` : ''}#sha256:${createHash('sha256').update(id).digest('hex')}`;
        // Ownership lookup returns only a boolean; protected payload methods run after all gates.
        const owned = session && (decoy || await bank.ownsAccount(session.userId, id));
        const evaluatedAt = clock();
        const authorization: Authorization = !session || session.expiresAt <= evaluatedAt ? 'unauthenticated' : owned ? 'allowed' : 'denied';
        const result = engine.inspect({ requestId, sessionId: authorization === 'unauthenticated' ? null : session!.id, action, targetResource, authorization }, evaluatedAt);
        if (authorization === 'unauthenticated') return fail(401, 'authentication_required', 'A valid server session is required');
        if (authorization === 'denied') return fail(403, 'account_access_denied', 'Account access denied');
        if (result.decision === 'block') return fail(403, 'security_blocked', 'Request blocked by behavioral rules');
        if (result.decision === 'throttle') {
          res.setHeader('Retry-After', String(result.retryAfter));
          return fail(429, 'security_throttled', 'Request throttled; wait before retrying');
        }
        if (req.method !== 'GET') {
          res.setHeader('Allow', 'GET');
          return fail(405, 'method_not_allowed', 'Use GET');
        }
        if (decoy) return json(res, 200, { decoy: true, message: 'Demo decoy: no banking data exists here' });
        if (action === 'account.export') {
          const output = csv(await bank.transactions(id));
          res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="demo-transactions.csv"' });
          return res.end(output);
        }
        if (action === 'transactions.read') return json(res, 200, { transactions: await bank.transactions(id) });
        return json(res, 200, { account: await bank.account(id) });
      }
      return fail(404, 'route_not_found', 'Route not found');
    } catch (error) {
      if (error instanceof NessieError && !res.headersSent) {
        if (error.retryAfter) res.setHeader('Retry-After', String(error.retryAfter));
        return fail(error.status, error.code, error.message);
      }
      if (error instanceof HttpError) return fail(error.status, error.code, error.message);
      // Do not serialize exception messages: upstream adapters could include secrets/payloads.
      if (!res.headersSent) return fail(500, 'internal_error', 'Request failed');
      res.destroy();
    }
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  server.maxHeadersCount = 50;
  return { server, store, bank, engine };
}
