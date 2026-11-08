/** Bounded scripted HTTP automation against our own loopback demo, NOT an AI-agent test. */
import { setTimeout as pause } from 'node:timers/promises';
import assert from 'node:assert/strict';

const base = new URL(process.env.DEMO_BASE_URL ?? 'http://127.0.0.1:3001');
if (base.protocol !== 'http:' || base.hostname !== '127.0.0.1' || base.username || base.password || base.pathname !== '/' || base.search || base.hash)
  throw new Error('Demo automation is restricted to http://127.0.0.1:<port> with no path or credentials');
const start = performance.now();
let count = 0;
const maxRequests = 30;
const maxDurationMs = 20_000;
const deadline = AbortSignal.timeout(maxDurationMs);
async function request(path: string, cookie = '', data?: object) {
  if (++count > maxRequests || performance.now() - start >= maxDurationMs) throw new Error('Demo request/duration budget exhausted');
  return fetch(new URL(path, base), {
    method: data ? 'POST' : 'GET', redirect: 'error',
    headers: { Cookie: cookie, ...(data ? { 'Content-Type': 'application/json' } : {}) },
    body: data ? JSON.stringify(data) : undefined,
    signal: AbortSignal.any([deadline, AbortSignal.timeout(3000)]),
  });
}
async function login(handle: string) {
  const response = await request('/api/demo/session', '', { handle });
  assert.equal(response.status, 201);
  await response.arrayBuffer();
  return response.headers.get('set-cookie')!.split(';')[0]!;
}
async function expect(path: string, cookie: string, status: number) {
  const response = await request(path, cookie);
  assert.equal(response.status, status, `Unexpected status for ${path}; run with default security configuration and protection enabled`);
  await response.arrayBuffer(); // Consume, never print banking payloads or cookies.
  console.log(`${status} ${path}`);
}
console.log('SCRIPTED AUTOMATION ONLY; own local demo; at most 30 requests / 20 seconds; no real AI-agent testing.');
const health = await request('/api/health');
assert.equal(health.status, 200);
const status = await health.json() as { developmentOnly?: boolean; bankingSource?: string };
assert.equal(status.developmentOnly, true);
assert.equal(status.bankingSource, 'local', 'Repeated automation is restricted to local fixtures; use nessie:smoke for one bounded sandbox check');
const account = '/api/bank/accounts/acc-alice-checking';
const normal = await login('alice');
await expect(account, normal, 200);
await expect(account + '/transactions', normal, 200);
await expect(account + '/export', normal, 200);
const fast = await login('bob');
for (let i = 0; i < 8; i++) await expect('/api/bank/accounts/acc-bob-checking', fast, 200);
await expect('/api/bank/accounts/acc-bob-checking', fast, 429);
const slow = await login('alice');
for (let i = 0; i < 4; i++) {
  await expect('/api/bank/accounts/acc-bob-checking', slow, 403);
  await pause(2100, undefined, { signal: deadline });
}
await expect(account, slow, 403);
console.log(`Completed ${count} bounded local requests in ${Math.ceil(performance.now() - start)}ms. Inspect the admin dashboard API for recorded events.`);
