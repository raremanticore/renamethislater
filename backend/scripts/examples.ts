/** Generate reviewable v1 examples from the real local application. No credentials/payload logs. */
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { writeFileSync } from 'node:fs';
import { createApplication } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import type { DemoSessionResponse } from '../src/contracts.ts';

let now = Date.parse('2026-11-07T12:00:00.000Z');
const secret = 'examples-only-admin-key-not-a-real-secret';
const app = createApplication(loadConfig({ DEMO_MODE: 'true', DATABASE_PATH: ':memory:', DEMO_ADMIN_KEY: secret }), { now: () => now });
app.server.listen(0, '127.0.0.1');
await once(app.server, 'listening');
const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
async function request(path: string, cookie = '', data?: object) {
  return fetch(base + path, { method: data ? 'POST' : 'GET', redirect: 'error',
    headers: { Cookie: cookie, ...(data ? { 'Content-Type': 'application/json' } : {}) },
    body: data ? JSON.stringify(data) : undefined, signal: AbortSignal.timeout(3000) });
}
try {
  const login = await request('/api/demo/session', '', { handle: 'alice' });
  const alice = login.headers.get('set-cookie')!.split(';')[0]!;
  const demoSession = await login.json() as DemoSessionResponse;
  const adminLogin = await request('/api/demo/session', '', { handle: 'admin', adminKey: secret });
  const admin = adminLogin.headers.get('set-cookie')!.split(';')[0]!;
  await adminLogin.arrayBuffer();
  const bankAccount = await (await request('/api/bank/accounts/acc-alice-checking', alice)).json();
  now += 15_000;
  const bankTransactions = await (await request('/api/bank/accounts/acc-alice-checking/transactions', alice)).json();
  now += 15_000;
  const bankExportCsv = await (await request('/api/bank/accounts/acc-alice-checking/export', alice)).text();
  for (let i = 0; i < 4; i++) {
    now += 15_000;
    await (await request('/api/bank/accounts/acc-bob-checking', alice)).arrayBuffer();
  }
  now += 15_000;
  const blockedError = await (await request('/api/bank/accounts/acc-alice-checking', alice)).json();
  const securityOverview = await (await request('/api/security/overview', admin)).json();
  const securityEvents = await (await request('/api/security/events?limit=2', admin)).json();
  const securitySession = await (await request(`/api/security/sessions/${demoSession.sessionId}?limit=2`, admin)).json();
  const protectionOff = await (await request('/api/security/demo/protection', admin, { enabled: false })).json();
  const reset = await (await request('/api/security/demo/reset', admin, {})).json();
  // Stable illustrative UUIDs make example regeneration reviewable; actual IDs remain opaque.
  const ids = new Map<string, string>();
  const serialized = JSON.stringify({ demoSession, bankAccount, bankTransactions, bankExportCsv, blockedError, securityOverview, securityEvents, securitySession, protectionOff, reset }, null, 2)
    .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/g, value => {
      if (!ids.has(value)) ids.set(value, `${String(ids.size + 1).padStart(8, '0')}-0000-4000-8000-000000000000`);
      return ids.get(value)!;
    });
  writeFileSync(new URL('../../docs/backend-api.examples.json', import.meta.url), serialized + '\n');
  console.log('Wrote docs/backend-api.examples.json from bounded local fixture requests. No model calls.');
} finally {
  app.server.closeAllConnections();
  await new Promise<void>(resolve => app.server.close(() => resolve()));
  app.store.close();
}
