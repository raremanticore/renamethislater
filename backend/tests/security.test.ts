import { test } from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApplication } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { Store } from '../src/database.ts';
import { LocalBankingRepository } from '../src/banking.ts';
import { SecurityEngine } from '../src/security.ts';
import { createSession, readSession } from '../src/auth.ts';
import type { DemoSessionResponse, EventsResponse, OverviewResponse, SessionResponse } from '../src/contracts.ts';

const adminKey = 'test-only-admin-key-at-least-24-characters';
const account = '/api/bank/accounts/acc-alice-checking';
const config = () => loadConfig({ DEMO_MODE: 'true', DEMO_ADMIN_KEY: adminKey, DATABASE_PATH: ':memory:' });
async function setup(t: TestContext) {
  let now = Date.parse('2026-11-07T12:00:00.000Z');
  const store = new Store(':memory:');
  const local = new LocalBankingRepository(store);
  const calls = { account: 0, transactions: 0 };
  const app = createApplication(config(), { store, now: () => now, bank: {
    ownsAccount: async (userId, id) => local.ownsAccount(userId, id),
    account: async id => { calls.account++; return local.account(id); },
    transactions: async id => { calls.transactions++; return local.transactions(id); },
  } });
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  t.after(async () => {
    app.server.closeAllConnections();
    await new Promise<void>((resolve, reject) => app.server.close(error => error ? reject(error) : resolve()));
    store.close();
  });
  const request = (path: string, cookie = '', data?: unknown, headers: Record<string, string> = {}) => fetch(base + path, {
    method: data === undefined ? 'GET' : 'POST', redirect: 'error',
    headers: { Cookie: cookie, ...(data === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  async function login(handle: string) {
    const res = await request('/api/demo/session', '', { handle, ...(handle === 'admin' ? { adminKey } : {}) });
    assert.equal(res.status, 201);
    return { cookie: res.headers.get('set-cookie')!.split(';')[0]!, body: await res.json() as DemoSessionResponse };
  }
  return { ...app, calls, request, login, advance: (ms: number) => { now += ms; }, time: () => now };
}

test('normal account browsing, transactions, and one CSV export remain allowed', async t => {
  const app = await setup(t);
  const alice = await app.login('alice');
  for (const path of [account, account + '/transactions', account + '/export']) {
    const response = await app.request(path, alice.cookie);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    if (path.endsWith('/export')) {
      assert.match(response.headers.get('content-type')!, /text\/csv/);
      assert.match(await response.text(), /Fictional grocery store/);
    } else await response.json();
    app.advance(10_000);
  }
  assert.equal((await app.engine.assess(alice.body.sessionId, app.time())).riskScore, 0);
  assert.deepEqual(app.calls, { account: 1, transactions: 2 });
});

test('authentication and ownership apply on every route even when protection is off', async t => {
  const app = await setup(t);
  const admin = await app.login('admin');
  const alice = await app.login('alice');
  assert.equal((await app.request('/api/security/demo/protection', admin.cookie, { enabled: false })).status, 200);
  for (const suffix of ['', '/transactions', '/export']) {
    assert.equal((await app.request('/api/bank/accounts/acc-bob-checking' + suffix + '?userId=user-bob', alice.cookie)).status, 403);
    assert.equal((await app.request(account + suffix)).status, 401);
  }
  assert.equal((await app.request('/api/bank/decoy/export')).status, 401);
  assert.deepEqual(app.calls, { account: 0, transactions: 0 });
  assert.equal((await app.request(account + '?userId=user-bob', alice.cookie)).status, 200);
  const decoy = await app.request('/api/bank/decoy/export', alice.cookie);
  assert.deepEqual(await decoy.json(), { decoy: true, message: 'Demo decoy: no banking data exists here' });
});

test('fast requests receive 429 and Retry-After without fetching data', async t => {
  const app = await setup(t);
  const alice = await app.login('alice');
  for (let i = 0; i < 8; i++) assert.equal((await app.request(account, alice.cookie)).status, 200);
  const res = await app.request(account, alice.cookie);
  assert.equal(res.status, 429);
  assert.equal(res.headers.get('retry-after'), '2');
  assert.equal(app.calls.account, 8);
  app.advance(2001);
  assert.equal((await app.request(account, alice.cookie)).status, 200);
});

test('slower unauthorized requests accumulate risk, then block authorized payloads', async t => {
  const app = await setup(t);
  const alice = await app.login('alice');
  for (let i = 0; i < 4; i++) {
    assert.equal((await app.request('/api/bank/accounts/not-owned-' + i, alice.cookie)).status, 403);
    app.advance(15_000);
  }
  const score = await app.engine.assess(alice.body.sessionId, app.time());
  assert.equal(score.riskScore, 100);
  assert.equal(score.decision, 'block');
  assert.ok(!score.triggeredRules.some(rule => rule.id === 'request_frequency'));
  for (const suffix of ['', '/transactions', '/export']) {
    const res = await app.request(account + suffix, alice.cookie);
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error.code, 'security_blocked');
  }
  assert.deepEqual(app.calls, { account: 0, transactions: 0 });
});

test('repeated slow exports throttle and block; a decoy produces risk without fetching data', async t => {
  const app = await setup(t);
  const alice = await app.login('alice');
  for (const status of [200, 200, 200, 429, 429, 403]) {
    assert.equal((await app.request(account + '/export', alice.cookie)).status, status);
    app.advance(10_000);
  }
  assert.equal(app.calls.transactions, 3);
  const bob = await app.login('bob');
  assert.equal((await app.request('/api/bank/decoy/export', bob.cookie)).status, 429);
  app.advance(10_000);
  assert.equal((await app.request('/api/bank/decoy/export', bob.cookie)).status, 403);
  assert.equal((await app.engine.assess(bob.body.sessionId, app.time())).riskScore, 140);
  assert.equal(app.calls.transactions, 3);
});

test('risk expires, expired signals are deleted, and administrator reset restores protection', async t => {
  const app = await setup(t);
  const alice = await app.login('alice');
  const admin = await app.login('admin');
  await app.request('/api/bank/decoy/export', alice.cookie);
  app.advance(300_000);
  assert.equal((await app.engine.assess(alice.body.sessionId, app.time())).riskScore, 0);
  assert.equal((await app.request(account, alice.cookie)).status, 200);
  assert.equal(app.store.db.prepare('SELECT COUNT(*) AS n FROM signals').get()!.n, 1);
  await app.request('/api/bank/decoy/export', alice.cookie);
  await app.request('/api/security/demo/protection', admin.cookie, { enabled: false });
  const reset = await app.request('/api/security/demo/reset', admin.cookie, {});
  assert.equal(reset.status, 200);
  assert.equal((await reset.json()).protection.enabled, true);
  assert.equal(app.store.db.prepare('SELECT COUNT(*) AS n FROM signals').get()!.n, 0);
  assert.equal(app.store.db.prepare('SELECT COUNT(*) AS n FROM events').get()!.n, 0);
  assert.equal((await app.request(account, alice.cookie)).status, 200); // session survives API reset
});

test('all security endpoints require an administrator and admin login requires the server secret', async t => {
  const app = await setup(t);
  const alice = await app.login('alice');
  for (const [path, data] of [
    ['/api/security/overview', undefined], ['/api/security/events', undefined],
    [`/api/security/sessions/${alice.body.sessionId}`, undefined],
    [`/api/security/sessions/${alice.body.sessionId}/explanation`, {}],
    ['/api/security/demo/reset', {}], ['/api/security/demo/protection', { enabled: false }],
  ] as const) {
    assert.equal((await app.request(path, '', data)).status, 401);
    assert.equal((await app.request(path, alice.cookie, data)).status, 403);
  }
  assert.equal((await app.request('/api/demo/session', '', { handle: 'admin' })).status, 403);
  assert.equal((await app.request('/api/demo/session', '', { handle: 'admin', adminKey: 'wrong' })).status, 403);
  assert.equal((await app.request(account, `demo_session=${alice.body.sessionId}`)).status, 401);
});

test('dashboard returns stable chart buckets, safe events, cursor pages, and session timelines', async t => {
  const app = await setup(t);
  const alice = await app.login('alice');
  const admin = await app.login('admin');
  for (const path of [account + '?api_key=do-not-log-this', account + '/export', '/api/bank/accounts/unowned-secret-value']) {
    await app.request(path, alice.cookie);
    app.advance(5000);
  }
  const page = await (await app.request('/api/security/events?limit=2', admin.cookie)).json() as EventsResponse;
  assert.equal(page.items.length, 2);
  assert.equal(page.pagination.hasMore, true);
  const second = await (await app.request('/api/security/events?limit=2&cursor=' + page.pagination.nextCursor, admin.cookie)).json() as EventsResponse;
  assert.equal(second.items.length, 1);
  assert.equal(second.pagination.nextCursor, null);
  assert.equal(new Set([...page.items, ...second.items].map(event => event.requestId)).size, 3);
  assert.deepEqual(page.items[0]!.authorization, 'denied');
  assert.equal(page.items[0]!.riskScore, 25);
  assert.match(page.items[0]!.targetResource, /^\/api\/bank\/accounts\/:id#sha256:[a-f0-9]{64}$/);
  const serialized = JSON.stringify([...page.items, ...second.items]);
  for (const value of [adminKey, alice.cookie, 'do-not-log-this', 'unowned-secret-value', 'Fictional employer', 'balanceCents']) assert.ok(!serialized.includes(value));
  const summary = await (await app.request('/api/security/overview', admin.cookie)).json() as OverviewResponse;
  assert.equal(summary.apiVersion, '1');
  assert.equal(summary.buckets.length, 15);
  assert.equal(summary.totals.total, 3);
  assert.equal(summary.buckets.reduce((sum, bucket) => sum + bucket.total, 0), 3);
  assert.ok(summary.buckets.some(bucket => bucket.total === 0));
  const detail = await (await app.request(`/api/security/sessions/${alice.body.sessionId}?limit=2`, admin.cookie)).json() as SessionResponse;
  assert.equal(detail.timeline.length, 2);
  assert.equal(detail.timelinePagination.hasMore, true);
  assert.equal(detail.session.eventCount, 3);
  assert.equal(detail.explanation.source, 'deterministic');
  assert.equal(detail.session.riskScore, 25);
  assert.equal((await app.request('/api/security/events?limit=101', admin.cookie)).status, 400);
  assert.equal((await app.request('/api/security/events?cursor=NaN', admin.cookie)).status, 400);
});

test('session risk is isolated, session expiry denies access, and mutations reject cross-origin requests', async t => {
  const app = await setup(t);
  const alice = await app.login('alice');
  const bob = await app.login('bob');
  await app.request('/api/bank/decoy/export', alice.cookie);
  assert.equal((await app.request('/api/bank/accounts/acc-bob-checking', bob.cookie)).status, 200);
  assert.equal((await app.request('/api/demo/session', '', { handle: 'alice' }, { Origin: 'https://evil.example' })).status, 403);
  const admin = await app.login('admin');
  assert.equal((await app.request('/api/security/demo/reset', admin.cookie, {}, { Origin: 'https://evil.example' })).status, 403);
  app.advance(8 * 60 * 60 * 1000);
  assert.equal((await app.request(account, alice.cookie)).status, 401);
});

test('SQLite persists protection, sessions, audit records, and signals across restarts; seed is idempotent', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bank-detect-test-'));
  const path = join(dir, 'test.sqlite');
  let store = new Store(path);
  try {
    store.seed(); store.seed();
    assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM transactions').get()!.n, 9);
    const now = Date.now();
    const login = (await createSession(store, 'alice', now, config()))!;
    const engine = new SecurityEngine(store, config());
    await engine.inspect({ requestId: 'test-request', sessionId: 'session', action: 'decoy.export', targetResource: '/api/bank/decoy/export', authorization: 'allowed' }, now);
    store.protectionEnabled = false;
    store.close(); store = new Store(path);
    assert.equal((await readSession(store, login.cookie, now))?.id, login.session.id);
    assert.equal(store.protectionEnabled, false);
    store.protectionEnabled = true;
    assert.equal((await new SecurityEngine(store, config()).assess('session', now)).riskScore, 70);
    assert.equal(store.events(10, Number.MAX_SAFE_INTEGER).length, 1);
    store.resetAll();
    assert.equal(await readSession(store, login.cookie, now), undefined);
    assert.equal(store.protectionEnabled, true);
    assert.equal(store.signals('session', 0).length, 0);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('audit write failure fails closed before a protected payload fetch', async t => {
  const app = await setup(t);
  const alice = await app.login('alice');
  const original = app.store.record;
  app.store.record = () => { throw new Error('simulated audit storage failure'); };
  try {
    assert.equal((await app.request(account, alice.cookie)).status, 500);
    assert.deepEqual(app.calls, { account: 0, transactions: 0 });
    assert.equal(app.store.signals(alice.body.sessionId, 0).length, 0); // atomic rollback
  } finally { app.store.record = original; }
});

test('protection-off skips behavioral state but preserves audit and existing unexpired risk', async t => {
  const app = await setup(t);
  const alice = await app.login('alice');
  const admin = await app.login('admin');
  await app.request('/api/bank/decoy/export', alice.cookie);
  await app.request('/api/security/demo/protection', admin.cookie, { enabled: false });
  for (let i = 0; i < 10; i++) assert.equal((await app.request(account + '/export', alice.cookie)).status, 200);
  assert.equal((await app.engine.assess(alice.body.sessionId, app.time())).riskScore, 0);
  assert.equal(app.store.signals(alice.body.sessionId, 0).length, 1);
  assert.equal(app.store.events(100, Number.MAX_SAFE_INTEGER).filter(row => !row.event.protectionEnabled).length, 10);
  await app.request('/api/security/demo/protection', admin.cookie, { enabled: true });
  assert.equal((await app.engine.assess(alice.body.sessionId, app.time())).riskScore, 70);
});

test('demo startup and configuration fail closed outside explicit development mode', () => {
  assert.throws(() => loadConfig({ NODE_ENV: 'production', DEMO_MODE: 'true' }), /development-only/);
  assert.throws(() => createApplication(loadConfig({})), /DEMO_MODE/);
  assert.throws(() => loadConfig({ SECURITY_WINDOW_MS: '-1' }), /Invalid/);
  assert.throws(() => loadConfig({ SECURITY_THROTTLE_SCORE: '100' }), /thresholds/);
  assert.throws(() => loadConfig({ DEMO_ADMIN_KEY: 'short' }), /24/);
});

test('customer and administrator cookies restore independently; logout revokes only the selected scope', async t => {
  const app = await setup(t);
  const alice = await app.login('alice'); const admin = await app.login('admin');
  assert.match(alice.cookie, /^demo_session=/); assert.match(admin.cookie, /^demo_admin_session=/);
  const cookies = `${alice.cookie}; ${admin.cookie}`;
  assert.equal((await (await app.request('/api/demo/session', cookies)).json()).sessionId, alice.body.sessionId);
  assert.equal((await (await app.request('/api/demo/admin-session', cookies)).json()).sessionId, admin.body.sessionId);
  assert.equal((await app.request('/api/security/overview', cookies)).status, 200);
  assert.equal((await app.request('/api/demo/logout', cookies, { scope: 'admin' }, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await app.request('/api/demo/logout', cookies, { scope: 'admin' })).status, 200);
  assert.equal((await app.request('/api/security/overview', cookies)).status, 403);
  assert.equal((await app.request('/api/demo/admin-session', cookies)).status, 401);
  assert.equal((await app.request(account, cookies)).status, 200);
  const newAdmin = await app.login('admin');
  const nextCookies = `${alice.cookie}; ${newAdmin.cookie}`;
  assert.equal((await app.request('/api/demo/logout', nextCookies, { scope: 'customer' })).status, 200);
  assert.equal((await app.request(account, nextCookies)).status, 401);
  assert.equal((await app.request('/api/security/overview', nextCookies)).status, 200);
});

test('a customer token in an admin cookie grants no administrator access; legacy admin cookies remain accepted', async t => {
  const app = await setup(t);
  const alice = await app.login('alice'); const admin = await app.login('admin');
  const forged = alice.cookie.replace('demo_session=', 'demo_admin_session=');
  assert.equal((await app.request('/api/security/events', forged)).status, 403);
  assert.equal((await app.request('/api/demo/admin-session', forged)).status, 403);
  assert.equal((await app.request('/api/security/events', admin.cookie.replace('demo_admin_session=', 'demo_session='))).status, 200);
  assert.equal((await app.request('/api/demo/logout', alice.cookie, { scope: 'anything' })).status, 400);
});
