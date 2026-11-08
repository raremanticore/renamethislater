import { test } from 'node:test';
import assert from 'node:assert/strict';
import { X509Certificate } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import type { Pool } from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { PostgresStore, databasePoolConfig } from '../src/postgres.ts';
import { createRequestHandler } from '../src/handler.ts';
import { loadConfig } from '../src/config.ts';

const adminKey = 'offline-postgres-test-admin-at-least-24';
const account = '/api/bank/accounts/acc-alice-checking';

/** Real embedded Postgres SQL engine, fake network pool. No Supabase/Nessie/OpenAI traffic. */
async function embeddedPool() {
  const db = new PGlite();
  const trace: string[] = [];
  let pending = Promise.resolve();
  let failAudit = false;
  const connect = async () => {
    const previous = pending;
    let unlock!: () => void;
    pending = new Promise<void>(resolve => { unlock = resolve; });
    await previous;
    return {
      query: async (sql: string, values?: unknown[]) => {
        trace.push(sql);
        if (failAudit && sql.startsWith('INSERT INTO veyl.events')) throw new Error('fake secret database credential must not leak');
        // PGlite has one connection; pool mutex models checked-out clients. Lock SQL is asserted below.
        if (sql.includes('pg_advisory_xact_lock')) return { rows: [] };
        return db.query(sql, values);
      },
      release: () => unlock(),
    };
  };
  const pool = {
    connect,
    query: async (sql: string, values?: unknown[]) => {
      const client = await connect();
      try { return await client.query(sql, values); } finally { client.release(); }
    },
    end: () => db.close(),
  } as unknown as Pool;
  const sql = await readFile(new URL('../migrations/001_initial.sql', import.meta.url), 'utf8');
  await db.exec(sql);
  await db.exec(sql); // migration is idempotent
  return { pool, trace, failAudit: (enabled: boolean) => { failAudit = enabled; } };
}

test('Postgres migration and shared API contract run offline with embedded PostgreSQL', async t => {
  const embedded = await embeddedPool();
  t.after(() => embedded.pool.end());
  const store = new PostgresStore(embedded.pool);
  await store.seed(); await store.seed(); await store.assertReady();
  assert.equal((await store.transactions('acc-alice-checking')).length, 3);
  assert.equal((await store.account('acc-alice-checking')).balanceCents, 245000);
  assert.equal(await store.ownsAccount('user-bob', 'acc-alice-checking'), false);
  let now = Date.parse('2026-11-08T12:00:00Z');
  let fetches = 0;
  const fixture = JSON.parse(await readFile(new URL('./fixtures/nessie-sandbox.json', import.meta.url), 'utf8'));
  const config = loadConfig({ DEMO_MODE: 'true', DEMO_ADMIN_KEY: adminKey, BANKING_PROVIDER: 'nessie',
    NESSIE_API_KEY: 'offline-fake-key', NESSIE_API_BASE_URL: 'https://offline.test',
    NESSIE_ACCOUNT_MAP: JSON.stringify({ 'user-alice': { 'acc-alice-checking': fixture.account._id } }) });
  const upstream: typeof fetch = async input => {
    fetches++;
    const path = new URL(String(input)).pathname;
    if (path.endsWith('/deposits')) return Response.json(fixture.deposits);
    if (path.endsWith('/withdrawals')) return Response.json(fixture.withdrawals);
    return Response.json(fixture.account);
  };
  const servers = [0, 1].map(() => createServer(createRequestHandler(config, {
    store: new PostgresStore(embedded.pool), now: () => now, nessieFetch: upstream,
  }).handler));
  for (const server of servers) { server.listen(0, '127.0.0.1'); await once(server, 'listening'); }
  t.after(async () => { for (const server of servers) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); } });
  const request = (path: string, cookie = '', data?: object, instance = 0) => {
    const port = (servers[instance]!.address() as AddressInfo).port;
    return fetch('http://127.0.0.1:'+port+path, { method: data ? 'POST' : 'GET',
      headers: { Cookie: cookie, ...(data ? { 'Content-Type': 'application/json' } : {}) },
      body: data ? JSON.stringify(data) : undefined, signal: AbortSignal.timeout(10000) });
  };
  const login = async (handle: string) => {
    const response = await request('/api/demo/session', '', { handle, ...(handle === 'admin' ? { adminKey } : {}) });
    assert.equal(response.status, 201);
    return { cookie: response.headers.get('set-cookie')!.split(';')[0]!, data: await response.json() };
  };
  const alice = await login('alice'); const admin = await login('admin');
  await t.test('sessions survive across instances; normal reads, cents and one CSV export work', async () => {
    assert.equal((await request('/api/demo/session', alice.cookie, undefined, 1)).status, 200);
    const result = await (await request(account, alice.cookie)).json();
    assert.equal(result.account.balanceCents, 500000);
    const csv = await request(account+'/export', alice.cookie, undefined, 1);
    assert.equal(csv.status, 200); assert.match(await csv.text(), /Fictional payroll/);
    const overview = await (await request('/api/security/overview', admin.cookie)).json();
    assert.equal(overview.buckets.length, 15); assert.equal(overview.totals.allow, 2);
    const page = await (await request('/api/security/events?limit=1', admin.cookie)).json();
    assert.equal(page.pagination.hasMore, true);
    const detail = await (await request('/api/security/sessions/'+alice.data.sessionId, admin.cookie)).json();
    assert.equal(detail.timeline.length, 2);
    const analysis = await (await request('/api/security/sessions/'+alice.data.sessionId+'/analysis', admin.cookie, {})).json();
    assert.equal(analysis.analysis.source, 'deterministic');
  });
  await t.test('ownership and admin checks remain enforced with protection off; no denied Nessie fetches', async () => {
    await request('/api/security/demo/protection', admin.cookie, { enabled: false });
    const before = fetches;
    for (const suffix of ['', '/transactions', '/export']) {
      assert.equal((await request('/api/bank/accounts/not-owned'+suffix, alice.cookie, undefined, 1)).status, 403);
      assert.equal((await request(account+suffix)).status, 401);
    }
    assert.equal((await request('/api/security/events', alice.cookie)).status, 403);
    assert.equal((await request('/api/security/demo/reset', alice.cookie, {})).status, 403);
    assert.equal(fetches, before);
    await request('/api/security/demo/reset', admin.cookie, {});
  });
  await t.test('concurrent requests across instances share a burst limit and do not fetch throttled payloads', async () => {
    now += 5000;
    const before = fetches;
    const responses = await Promise.all(Array.from({ length: 12 }, (_, index) => request(account, alice.cookie, undefined, index % 2)));
    assert.equal(responses.filter(response => response.status === 200).length, 8);
    assert.equal(responses.filter(response => response.status === 429).length, 4);
    assert.equal(responses.find(response => response.status === 429)!.headers.get('retry-after'), '2');
    assert.equal(fetches - before, 8);
    await request('/api/security/demo/reset', admin.cookie, {});
  });
  await t.test('slow risk accumulates across instances; blocked requests do not fetch; expiry and reset work', async () => {
    for (let index=0; index<4; index++) {
      now += 15000;
      assert.equal((await request('/api/bank/accounts/not-owned', alice.cookie, undefined, index%2)).status, 403);
    }
    const before = fetches;
    for (const suffix of ['', '/transactions', '/export']) assert.equal((await request(account+suffix, alice.cookie)).status, 403);
    assert.equal(fetches, before);
    now += 300001;
    assert.equal((await request(account, alice.cookie, undefined, 1)).status, 200);
    await request('/api/security/demo/reset', admin.cookie, {});
    assert.equal((await store.events(10, Number.MAX_SAFE_INTEGER)).length, 0);
    assert.equal(await store.protection(), true);
  });
  await t.test('audit failure rolls back signals and returns no provider data or driver details', async () => {
    const before = fetches; const signals = await store.signals(alice.data.sessionId, 0);
    embedded.failAudit(true);
    const response = await request(account, alice.cookie);
    assert.equal(response.status, 500);
    assert.ok(!(await response.text()).includes('credential'));
    assert.equal(fetches, before);
    embedded.failAudit(false);
    assert.deepEqual(await store.signals(alice.data.sessionId, 0), signals);
    assert.ok(embedded.trace.includes('ROLLBACK'));
    assert.ok(embedded.trace.includes('SELECT pg_advisory_xact_lock(1835363685,1)'));
  });
  await t.test('logout revokes the shared session', async () => {
    assert.equal((await request('/api/demo/logout', alice.cookie, { scope: 'customer' })).status, 200);
    assert.equal((await request(account, alice.cookie, undefined, 1)).status, 401);
  });
});

test('hosted config requires explicit demo opt-in, Postgres, exact HTTPS origin and admin secret', () => {
  const valid = { NODE_ENV: 'production', HOSTED_DEMO_MODE: 'true', DEMO_MODE: 'true',
    DATABASE_URL: 'postgresql://fake:fake@db.example.test/postgres', APP_ORIGIN: 'https://frontend.example.test', DEMO_ADMIN_KEY: adminKey };
  assert.equal(loadConfig(valid).hostedDemo, true);
  for (const override of [{ HOSTED_DEMO_MODE: 'false' }, { DATABASE_URL: '' }, { APP_ORIGIN: '' }, { APP_ORIGIN: 'http://localhost:3000' }, { DEMO_ADMIN_KEY: '' }, { DEMO_MODE: 'false' }])
    assert.throws(() => loadConfig({ ...valid, ...override }));
  const pool = databasePoolConfig({ ...valid, DATABASE_URL: valid.DATABASE_URL+'?sslmode=disable' });
  assert.equal(pool.max, 1);
  assert.deepEqual(pool.ssl, { rejectUnauthorized: true });
  assert.ok(!pool.connectionString!.includes('sslmode'));
});

test('Supabase connections trust the downloaded public CA and retain hostname/certificate verification', () => {
  const config = databasePoolConfig({ DATABASE_URL: 'postgresql://fake:fake@aws-0-example.pooler.supabase.com:6543/postgres?sslmode=disable' });
  assert.ok(config.ssl && typeof config.ssl === 'object');
  assert.equal(config.ssl.rejectUnauthorized, true);
  assert.equal(typeof config.ssl.ca, 'string');
  const cert = new X509Certificate(config.ssl.ca as string);
  assert.equal(cert.ca, true);
  assert.match(cert.subject, /Supabase/);
  assert.ok(Date.parse(cert.validTo) > Date.now());
  const override = databasePoolConfig({ DATABASE_URL: 'postgresql://fake:fake@aws-0-example.pooler.supabase.com:6543/postgres', DATABASE_CA_CERT: 'custom\\nroot' });
  assert.ok(override.ssl && typeof override.ssl === 'object');
  assert.equal(override.ssl.ca, 'custom\nroot');
  assert.equal(override.ssl.rejectUnauthorized, true);
});
