/** Explicit operator-only fixture provisioning. Never imported by the banking HTTP routes. */
import { setTimeout as pause } from 'node:timers/promises';
import type { Config } from './config.ts';
import { boundedJson } from './http-json.ts';

export interface SeedItem {
  kind: 'deposits' | 'withdrawals';
  body: { medium: 'balance'; transaction_date: string; status: 'completed'; amount: number; description: string };
}
export function nessieSeedPlan(now = new Date()): SeedItem[] {
  const day = new Date(now.toISOString().slice(0, 10) + 'T00:00:00.000Z');
  const date = (daysAgo: number) => new Date(day.getTime() - daysAgo * 86_400_000).toISOString().slice(0, 10);
  const make = (kind: SeedItem['kind'], index: number, amount: number, label: string, daysAgo: number): SeedItem => ({ kind, body: {
    medium: 'balance', transaction_date: date(daysAgo), status: 'completed', amount,
    description: `bank-detect-demo-v1:${kind === 'deposits' ? 'd' : 'w'}${String(index + 1).padStart(2, '0')} Fictional ${label}`,
  } });
  const deposits = [1000, 1200, 750, 300, 600, 150].map((amount, i) => make('deposits', i, amount, i % 2 ? 'payroll deposit' : 'savings deposit', 28 - i * 5));
  const spending: [string, number][] = [['cafe', 6], ['groceries', 64], ['rent', 500], ['utilities', 95], ['streaming', 15], ['fuel', 42], ['bookshop', 28], ['transit', 20]];
  const withdrawals = Array.from({ length: 24 }, (_, i) => { const [label, amount] = spending[i % spending.length]!; return make('withdrawals', i, amount, label, 27 - i); });
  return [...deposits, ...withdrawals]; // Credits first so a newly created zero-balance account can be seeded.
}
export function seedAccountId(config: Config, handle: string, alias: string): string {
  if (!config.demoMode || config.bankingProvider !== 'nessie') throw new Error('Seed requires DEMO_MODE=true and BANKING_PROVIDER=nessie');
  if (!['https://prod-api.nessieisreal.com', 'https://qa-api.nessieisreal.com'].includes(config.nessieBaseUrl))
    throw new Error('Seed permits only official Nessie sandbox origins');
  if (handle !== 'alice' && handle !== 'bob') throw new Error('Select demo user alice or bob');
  const accounts = config.nessieAccounts[`user-${handle}`];
  if (!accounts || !Object.hasOwn(accounts, alias)) throw new Error('Seed alias must belong to the selected demo user in the trusted server mapping');
  return accounts[alias]!;
}
export interface SeedResult { created: number; skipped: number; providerRequests: number }
export class SeedFailure extends Error {
  created: number; skipped: number;
  constructor(message: string, created: number, skipped: number) { super(message); this.created = created; this.skipped = skipped; }
}
export async function seedNessie(config: Config, handle: string, alias: string, options: {
  live: boolean; send?: typeof fetch; now?: Date; delay?: () => Promise<void>;
}): Promise<SeedResult> {
  const id = seedAccountId(config, handle, alias);
  const plan = nessieSeedPlan(options.now);
  const result: SeedResult = { created: 0, skipped: 0, providerRequests: 0 };
  if (!options.live) return result; // Preview never makes even a read request.
  const deadline = AbortSignal.timeout(60_000);
  const send = options.send ?? fetch;
  const wait = options.delay ?? (() => pause(500, undefined, { signal: deadline }));
  const fail = (message: string): never => { throw new SeedFailure(message, result.created, result.skipped); };
  async function request(kind: SeedItem['kind'], body?: SeedItem['body']): Promise<Response> {
    if (deadline.aborted || ++result.providerRequests > 32) return fail('Seed request/time budget exhausted');
    const url = new URL(`/accounts/${encodeURIComponent(id)}/${kind}`, config.nessieBaseUrl);
    url.searchParams.set('key', config.nessieApiKey);
    let response: Response;
    try {
      response = await send(url, { method: body ? 'POST' : 'GET', redirect: 'error',
        signal: AbortSignal.any([deadline, AbortSignal.timeout(5000)]),
        headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined });
    } catch { return fail('Nessie seed connection failed or timed out; the last write may have succeeded. Rerun to check existing markers'); }
    if (!response.ok || (body && response.status !== 201)) {
      await response.body?.cancel().catch(() => {});
      const hint = response.status === 401 || response.status === 403 ? 'check the API key/permissions'
        : response.status === 404 ? 'check the mapped bank account ID/environment'
          : response.status === 429 ? 'wait before retrying; no automatic retry was made' : 'check the supported deposit/withdrawal schema and provider availability';
      return fail(`Nessie seed received HTTP ${response.status}; ${hint}`);
    }
    return response;
  }
  // Read both feeds before any writes. Existing persistent descriptions are the rerun markers.
  const existing = new Map<string, Record<string, unknown>>();
  for (const kind of ['deposits', 'withdrawals'] as const) {
    const response = await request(kind);
    let rows: unknown;
    try { rows = await boundedJson(response, 2 * 1024 * 1024); } catch { return fail('Nessie seed could not read a bounded existing feed; no writes started'); }
    if (!Array.isArray(rows) || rows.length > 1000) return fail('Nessie seed found an unsupported existing feed; no writes started');
    for (const row of rows) if (row && typeof row === 'object' && typeof row.description === 'string') {
      const key = `${kind}:${row.description}`;
      if (row.description.startsWith('bank-detect-demo-v1:') && existing.has(key)) return fail('Duplicate seed markers already exist; review the sandbox before adding more');
      existing.set(key, row);
    }
  }
  // Validate every existing marker first so a conflicting fixture cannot cause partial writes.
  for (const item of plan) {
    const prior = existing.get(`${item.kind}:${item.body.description}`);
    if (prior && (prior.amount !== item.body.amount || prior.medium !== 'balance' || prior.status === 'cancelled'))
      return fail('A prior seed marker has conflicting data; review the sandbox before adding more');
  }
  for (const item of plan) {
    if (existing.has(`${item.kind}:${item.body.description}`)) { result.skipped++; continue; }
    try { await wait(); } catch { return fail('Seed duration limit reached; rerun to check existing markers'); }
    const response = await request(item.kind, item.body);
    await response.body?.cancel().catch(() => {});
    result.created++;
  }
  return result;
}
