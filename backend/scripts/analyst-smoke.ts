/** One explicitly opted-in real analyst request; scripted local activity, NOT an AI collector test. */
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { createApplication } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import type { Config } from '../src/config.ts';
import type { AnalysisResponse } from '../src/contracts.ts';

export async function runAnalystSmoke(config: Config, modelFetch: typeof fetch = fetch) {
  if (!config.openaiKey || !config.explanationModel || !config.adminKey)
    throw new Error('Configure OPENAI_API_KEY, OPENAI_EXPLANATION_MODEL, and DEMO_ADMIN_KEY in .env');
  const deadline = AbortSignal.timeout(15_000);
  let modelRequests = 0; let providerStatus: number | null = null; let now = Date.now() - 60_000;
  // Separate in-memory local demo: no Nessie traffic or changes to the running application's state.
  const app = createApplication({ ...config, databasePath: ':memory:', bankingProvider: 'local' }, {
    now: () => now,
    analystFetch: async (url, options) => {
      if (++modelRequests > 1) throw new Error('Analyst smoke model request budget exhausted');
      const response = await modelFetch(url, { ...options, signal: AbortSignal.any([deadline, options?.signal ?? deadline]) });
      providerStatus = response.status;
      return response;
    },
    nessieFetch: async () => { throw new Error('No Nessie calls permitted in analyst smoke'); },
  });
  try {
    app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
    const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
    let localRequests = 0;
    async function request(path: string, cookie = '', data?: object, status = 200) {
      if (++localRequests > 10) throw new Error('Analyst smoke local request budget exhausted');
      const response = await fetch(base + path, { method: data ? 'POST' : 'GET', redirect: 'error', signal: deadline,
        headers: { Cookie: cookie, ...(data ? { 'Content-Type': 'application/json' } : {}) }, body: data ? JSON.stringify(data) : undefined });
      if (response.status !== status) { await response.body?.cancel(); throw new Error(`Analyst smoke local route returned HTTP ${response.status}`); }
      return response;
    }
    const customer = await request('/api/demo/session', '', { handle: 'alice' }, 201);
    const cookie = customer.headers.get('set-cookie')!.split(';')[0]!;
    const login = await customer.json() as { sessionId: string };
    const admin = await request('/api/demo/session', '', { handle: 'admin', adminKey: config.adminKey }, 201);
    const adminCookie = admin.headers.get('set-cookie')!.split(';')[0]!; await admin.arrayBuffer();
    for (let i = 0; i < 4; i++) {
      await (await request('/api/bank/accounts/acc-bob-checking', cookie, undefined, 403)).arrayBuffer();
      now += 15_000; // Virtual time exercises accumulation without repeatedly hitting a real provider.
    }
    await (await request('/api/bank/accounts/acc-alice-checking', cookie, undefined, 403)).arrayBuffer();
    const response = await request(`/api/security/sessions/${login.sessionId}/analysis`, adminCookie, {});
    const result = await response.json() as AnalysisResponse;
    if (result.enforcement.currentDecision !== 'block') throw new Error('Expected rule block was not preserved');
    return { result, modelRequests, providerStatus, localRequests };
  } finally {
    app.server.closeAllConnections();
    await new Promise<void>(resolve => app.server.close(() => resolve())); app.store.close();
  }
}
async function main() {
  if (process.argv.slice(2).join(' ') !== '--live') throw new Error('Explicit model-call opt-in required: npm run analyst:smoke -- --live');
  console.log('Analyst smoke: scripted local activity, no Nessie calls, at most one real OpenAI request / 15 seconds. This uses API credits.');
  const { result, modelRequests, providerStatus } = await runAnalystSmoke(loadConfig());
  console.log(JSON.stringify({ source: result.analysis.source, assessment: result.analysis.assessment,
    explanation: result.analysis.explanation, supportingEventCount: result.analysis.supportingRequestIds.length,
    actualRuleDecision: result.enforcement.currentDecision, actualRuleScore: result.enforcement.currentRiskScore,
    fallbackReason: result.analysis.fallbackReason ?? null, modelRequests, providerStatus }, null, 2));
  if (result.analysis.source !== 'model') {
    const hint = providerStatus === 401 ? 'OpenAI rejected the key; check OPENAI_API_KEY.'
      : providerStatus === 403 || providerStatus === 404 ? 'Check model availability and API project permissions.'
        : providerStatus === 429 ? 'Check API billing/quota or rate limits.'
          : providerStatus === 400 ? 'The provider rejected the request parameters; inspect model compatibility without logging provider bodies.'
            : 'The model call failed, timed out, or returned an invalid result; the deterministic fallback remained active.';
    console.error(hint); process.exitCode = 1;
  } else console.log('Live AI analyst response validated; rule enforcement stayed independent.');
}
if (import.meta.main) main().catch(() => {
  console.error('Analyst smoke failed. Check configuration and local connectivity; no credentials or raw provider errors were printed. Use npm run analyst:smoke -- --live to opt in.');
  process.exitCode = 1;
});
