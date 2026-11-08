import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import handler from '../api/index.ts';

test('Vercel function fails closed with sanitized 503 when hosted configuration is missing', async t => {
  // The runner isolates this file. Do not load a local .env or make any database/provider calls.
  const original = process.env.HOSTED_DEMO_MODE;
  process.env.HOSTED_DEMO_MODE = 'false';
  t.after(() => { if (original === undefined) delete process.env.HOSTED_DEMO_MODE; else process.env.HOSTED_DEMO_MODE = original; });
  const server = createServer(handler);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const base = 'http://127.0.0.1:'+(server.address() as AddressInfo).port;
  for (const path of ['/api/health', '/api/bank/accounts/anything']) {
    const response = await fetch(base+path);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('retry-after'), '5');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = await response.json();
    assert.equal(body.error.code, 'backend_unavailable');
    assert.equal(body.error.requestId, response.headers.get('x-request-id'));
    assert.ok(!JSON.stringify(body).includes('postgresql://'));
  }
});
