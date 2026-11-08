import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.ts';
import { nessieSeedPlan, seedNessie, SeedFailure } from '../src/nessie-seed.ts';

const config = () => loadConfig({ DEMO_MODE: 'true', BANKING_PROVIDER: 'nessie', NESSIE_API_KEY: 'offline-test-key',
  NESSIE_ACCOUNT_MAP: '{"user-alice":{"acc-alice-checking":"owned-sandbox-id"}}' });
const alias = 'acc-alice-checking';
function sandbox() {
  const feeds: Record<string, Record<string, unknown>[]> = { deposits: [], withdrawals: [] };
  const calls: { method: string; kind: string }[] = [];
  const send: typeof fetch = async (url, options) => {
    const parsed = new URL(String(url)); const kind = parsed.pathname.split('/').at(-1)!;
    assert.equal(parsed.origin, 'https://prod-api.nessieisreal.com');
    assert.equal(parsed.searchParams.get('key'), 'offline-test-key');
    assert.equal(options?.redirect, 'error'); assert.ok(options?.signal);
    calls.push({ method: options?.method ?? 'GET', kind });
    if (options?.method === 'POST') { feeds[kind]!.push(JSON.parse(String(options.body))); return Response.json({ code: 201 }, { status: 201 }); }
    return Response.json(feeds[kind]);
  };
  return { feeds, calls, send };
}
test('preview and wrong ownership make zero provider calls', async () => {
  const upstream = sandbox();
  await seedNessie(config(), 'alice', alias, { live: false, send: upstream.send });
  await assert.rejects(seedNessie(config(), 'bob', alias, { live: true, send: upstream.send }));
  assert.equal(upstream.calls.length, 0);
});
test('bounded fictional seed uses documented fields, writes credits first, and reruns skip all 30 records', async () => {
  const upstream = sandbox();
  const options = { live: true, send: upstream.send, now: new Date('2026-11-08T12:00:00Z'), delay: async () => {} };
  assert.deepEqual(await seedNessie(config(), 'alice', alias, options), { created: 30, skipped: 0, providerRequests: 32 });
  assert.equal(upstream.feeds.deposits!.length, 6); assert.equal(upstream.feeds.withdrawals!.length, 24);
  assert.equal(upstream.calls[2]!.kind, 'deposits');
  assert.ok(upstream.calls.slice(2, 8).every(call => call.method === 'POST' && call.kind === 'deposits'));
  for (const item of nessieSeedPlan(options.now)) {
    assert.equal(item.body.medium, 'balance'); assert.equal(item.body.status, 'completed');
    assert.ok(Number.isSafeInteger(item.body.amount) && item.body.amount > 0);
    assert.ok(Date.parse(item.body.transaction_date) <= options.now.getTime());
  }
  assert.deepEqual(await seedNessie(config(), 'alice', alias, options), { created: 0, skipped: 30, providerRequests: 2 });
});
test('partial failure stops without retries or credential leakage, and rerun resumes missing records', async () => {
  const upstream = sandbox(); let writes = 0;
  const send: typeof fetch = (url, options) => {
    if (options?.method === 'POST' && ++writes === 3) return Promise.resolve(new Response('secret provider details', { status: 429 }));
    return upstream.send(url, options);
  };
  await assert.rejects(seedNessie(config(), 'alice', alias, { live: true, send, delay: async () => {} }), error => {
    assert.ok(error instanceof SeedFailure); assert.equal(error.created, 2);
    assert.match(error.message, /HTTP 429/); assert.ok(!error.message.includes('secret')); return true;
  });
  const result = await seedNessie(config(), 'alice', alias, { live: true, send: upstream.send, delay: async () => {} });
  assert.equal(result.created, 28); assert.equal(result.skipped, 2);
});
test('conflicting markers and unreadable feeds fail before any writes', async () => {
  const upstream = sandbox(); const first = nessieSeedPlan()[0]!;
  upstream.feeds.deposits!.push({ ...first.body, amount: 999 });
  await assert.rejects(seedNessie(config(), 'alice', alias, { live: true, send: upstream.send, delay: async () => {} }), /conflicting/);
  assert.equal(upstream.calls.filter(call => call.method === 'POST').length, 0);
  let writes = 0;
  await assert.rejects(seedNessie(config(), 'alice', alias, { live: true, send: async (_, options) => {
    if (options?.method === 'POST') writes++;
    return Response.json({ unexpected: 'secret' });
  } }), /unsupported/);
  assert.equal(writes, 0);
});
