import { test } from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { loadConfig } from '../src/config.ts';
import { NessieBankingRepository, NessieError, cents } from '../src/nessie.ts';
import { createApplication } from '../src/app.ts';
import type { DemoSessionResponse } from '../src/contracts.ts';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/nessie-sandbox.json', import.meta.url), 'utf8'));
const alias = 'acc-alice-checking';
const accountPath = '/api/bank/accounts/' + alias;
const key = 'fake-nessie-test-key-never-a-real-credential';
const adminKey = 'test-only-admin-key-with-24-characters';
const env = {
  DEMO_MODE: 'true', DATABASE_PATH: ':memory:', DEMO_ADMIN_KEY: adminKey, BANKING_PROVIDER: 'nessie',
  NESSIE_API_KEY: key, NESSIE_API_BASE_URL: 'https://sandbox.example.test/v1',
  NESSIE_ACCOUNT_MAP: JSON.stringify({ 'user-alice': { [alias]: fixture.account._id }, 'user-bob': { 'acc-bob-checking': 'bbbbbbbbbbbbbbbbbbbbbbbb' } }),
};
function mock() {
  const calls: string[] = [];
  const send: typeof fetch = async (input, options) => {
    const url = new URL(String(input));
    calls.push(url.pathname);
    assert.equal(url.searchParams.get('key'), key);
    assert.equal(url.origin, 'https://sandbox.example.test');
    assert.equal(options?.method, 'GET');
    assert.equal(options?.redirect, 'error');
    assert.ok(options?.signal);
    if (url.pathname === '/v1/accounts/' + fixture.account._id) return Response.json(fixture.account);
    if (url.pathname.endsWith('/deposits')) return Response.json(fixture.deposits);
    if (url.pathname.endsWith('/withdrawals')) return Response.json(fixture.withdrawals);
    return new Response('upstream body must not leak ' + key, { status: 404 });
  };
  return { calls, send };
}
async function setup(t: TestContext, send?: typeof fetch) {
  let now = Date.parse('2026-11-08T12:00:00.000Z');
  const upstream = mock();
  const app = createApplication(loadConfig(env), { nessieFetch: send ?? upstream.send, now: () => now });
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  t.after(async () => { app.server.closeAllConnections(); await new Promise<void>(resolve => app.server.close(() => resolve())); app.store.close(); });
  const request = (path: string, cookie = '', data?: object) => fetch(base + path, {
    method: data ? 'POST' : 'GET', headers: { Cookie: cookie, ...(data ? { 'Content-Type': 'application/json' } : {}) },
    body: data ? JSON.stringify(data) : undefined, signal: AbortSignal.timeout(3000),
  });
  async function login(handle = 'alice') {
    const response = await request('/api/demo/session', '', { handle, ...(handle === 'admin' ? { adminKey } : {}) });
    assert.equal(response.status, 201);
    return { cookie: response.headers.get('set-cookie')!.split(';')[0]!, data: await response.json() as DemoSessionResponse };
  }
  return { ...app, ...upstream, request, login, advance: (ms: number) => { now += ms; } };
}

test('Nessie ownership and account discovery use trusted mappings with no upstream requests', () => {
  const upstream = mock();
  const repo = new NessieBankingRepository(loadConfig(env), upstream.send);
  assert.equal(repo.ownsAccount('user-alice', alias), true);
  assert.equal(repo.ownsAccount('user-bob', alias), false);
  assert.equal(repo.ownsAccount('user-alice', fixture.account._id), false);
  assert.equal(repo.ownsAccount('user-alice', 'toString'), false);
  assert.equal(repo.ownsAccount('__proto__', alias), false);
  assert.deepEqual(repo.accountIds('user-alice'), [alias]);
  assert.deepEqual(repo.accountIds('user-admin'), []);
  assert.equal(upstream.calls.length, 0);
});

test('Nessie adapter normalizes account and transaction formats, exact cents, signs, dates, and statuses', async () => {
  const upstream = mock();
  const repo = new NessieBankingRepository(loadConfig(env), upstream.send);
  assert.deepEqual(await repo.account(alias), { id: alias, name: 'Our sandbox checking', currency: 'USD', balanceCents: 500000 });
  const transactions = await repo.transactions(alias);
  assert.deepEqual(transactions.map(tx => tx.amountCents), [50000, 29, -2015]);
  assert.ok(transactions.every(tx => tx.accountId === alias && tx.postedAt.endsWith('T00:00:00.000Z')));
  assert.match(transactions[1]!.description, /pending/);
  assert.equal(upstream.calls.length, 3);
  for (const value of [NaN, Infinity, -1, 0.001, Number.MAX_SAFE_INTEGER, '5']) assert.throws(() => cents(value), NessieError);
  assert.equal(cents(1.01), 101);
});

test('mapped Nessie routes and backend CSV preserve the contract and clearly identify their source', async t => {
  const app = await setup(t);
  const alice = await app.login();
  assert.equal(alice.data.bankingSource, 'nessie');
  assert.deepEqual(alice.data.accountIds, [alias]);
  assert.equal(app.calls.length, 0);
  assert.equal((await (await app.request('/api/health')).json()).bankingSource, 'nessie');
  const response = await app.request(accountPath, alice.cookie);
  assert.equal(response.headers.get('x-banking-source'), 'nessie');
  assert.equal((await response.json()).account.balanceCents, 500000);
  app.advance(3000);
  const txs = await (await app.request(accountPath + '/transactions', alice.cookie)).json();
  assert.equal(txs.transactions[2].amountCents, -2015);
  app.advance(3000);
  const exported = await app.request(accountPath + '/export', alice.cookie);
  assert.equal(exported.status, 200);
  assert.match(exported.headers.get('content-type')!, /text\/csv/);
  assert.match(await exported.text(), /"-2015"/);
  const audit = JSON.stringify(app.store.events(100, Number.MAX_SAFE_INTEGER));
  for (const text of [key, fixture.account._id, 'Fictional payroll', 'sandbox.example.test']) assert.ok(!audit.includes(text));
});

test('unauthenticated, cross-account, raw Nessie IDs, and protection-off denials never call Nessie', async t => {
  const app = await setup(t);
  const alice = await app.login();
  const admin = await app.login('admin');
  await app.request('/api/security/demo/protection', admin.cookie, { enabled: false });
  for (const suffix of ['', '/transactions', '/export']) {
    assert.equal((await app.request(accountPath + suffix)).status, 401);
    for (const id of ['acc-bob-checking', fixture.account._id, 'acc-unmapped'])
      assert.equal((await app.request(`/api/bank/accounts/${id}${suffix}?userId=user-bob`, alice.cookie)).status, 403);
  }
  assert.equal(app.calls.length, 0);
});

test('throttled account/transaction/export requests never retrieve Nessie payloads', async t => {
  const app = await setup(t);
  const alice = await app.login();
  for (let i = 0; i < 8; i++) assert.equal((await app.request(accountPath, alice.cookie)).status, 200);
  assert.equal(app.calls.length, 8);
  for (const suffix of ['', '/transactions', '/export']) {
    const response = await app.request(accountPath + suffix, alice.cookie);
    assert.equal(response.status, 429);
    assert.ok(response.headers.get('retry-after'));
  }
  assert.equal(app.calls.length, 8);
});

test('slower suspicious activity blocks every Nessie data route without an upstream fetch', async t => {
  const app = await setup(t);
  const alice = await app.login();
  for (let i = 0; i < 4; i++) {
    assert.equal((await app.request('/api/bank/accounts/acc-bob-checking', alice.cookie)).status, 403);
    app.advance(15_000);
  }
  for (const suffix of ['', '/transactions', '/export']) assert.equal((await app.request(accountPath + suffix, alice.cookie)).status, 403);
  assert.equal(app.calls.length, 0);
  const blocked = app.store.events(10, Number.MAX_SAFE_INTEGER)[0]!.event;
  assert.deepEqual(blocked.enforcement, { cause: 'score_threshold', threshold: 90, contributingRuleIds: ['unauthorized_resources'] });
});

test('Nessie failures have clear sanitized errors, retain source, and never substitute fixtures', async t => {
  for (const [status, expected, code] of [[401, 502, 'nessie_auth_failed'], [403, 502, 'nessie_auth_failed'], [404, 502, 'nessie_account_not_found'], [429, 503, 'nessie_rate_limited'], [500, 502, 'nessie_upstream_error']] as const) {
    await t.test(String(status), async st => {
      const app = await setup(st, async () => new Response('credential=' + key, { status }));
      const alice = await app.login();
      const response = await app.request(accountPath, alice.cookie);
      assert.equal(response.status, expected);
      assert.equal(response.headers.get('x-banking-source'), 'nessie');
      const text = await response.text();
      assert.equal(JSON.parse(text).error.code, code);
      assert.ok(!text.includes(key)); assert.ok(!text.includes('https:')); assert.ok(!text.includes('balanceCents'));
    });
  }
  const app = await setup(t, async () => { throw new Error('https://secret.example?key=' + key); });
  const alice = await app.login();
  const response = await app.request(accountPath, alice.cookie);
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error.code, 'nessie_unavailable');
});

test('Nessie rejects mismatched IDs, malformed feeds, invalid dates, excess precision, and oversized responses', async () => {
  for (const data of [null, { ...fixture.account, _id: 'wrong' }, { ...fixture.account, balance: 1.001 }]) {
    const repo = new NessieBankingRepository(loadConfig(env), async () => Response.json(data));
    await assert.rejects(repo.account(alias), NessieError);
  }
  for (const data of [{ results: [] }, [{ ...fixture.deposits[0], transaction_date: '2026-02-30' }], [{ ...fixture.deposits[0], account_id: 'other' }], Array(1001).fill(fixture.deposits[0]), [fixture.deposits[0], fixture.deposits[0]]]) {
    const repo = new NessieBankingRepository(loadConfig(env), async () => Response.json(data));
    await assert.rejects(repo.transactions(alias), NessieError);
  }
  const repo = new NessieBankingRepository(loadConfig(env), async () => new Response('x'.repeat(2 * 1024 * 1024 + 1)));
  await assert.rejects(repo.account(alias), NessieError);
});

test('Nessie configuration fails closed without credentials/mapping, on duplicate ownership, or unsafe URL', () => {
  for (const values of [
    { NESSIE_API_KEY: '' }, { NESSIE_ACCOUNT_MAP: '{}' }, { NESSIE_ACCOUNT_MAP: 'invalid-secret-input' },
    { NESSIE_ACCOUNT_MAP: JSON.stringify({ 'user-admin': { [alias]: fixture.account._id } }) },
    { NESSIE_ACCOUNT_MAP: JSON.stringify({ 'user-alice': { [alias]: fixture.account._id }, 'user-bob': { 'acc-bob': fixture.account._id } }) },
    { NESSIE_ACCOUNT_MAP: JSON.stringify({ 'user-alice': { [alias]: fixture.account._id }, 'user-bob': { [alias]: 'different' } }) },
    { NESSIE_API_BASE_URL: 'http://example.test' }, { NESSIE_API_BASE_URL: 'https://example.test?key=secret' },
    { NESSIE_API_BASE_URL: 'https://user:secret@example.test' }, { BANKING_PROVIDER: 'unknown' },
  ]) assert.throws(() => loadConfig({ ...env, ...values }));
  assert.equal(loadConfig({}).bankingProvider, 'local');
});
