import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import handler from '../api/index.ts';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

test('emitted Vercel JavaScript loads rewritten imports and the bundled certificate', async t => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const directory = await mkdtemp(join(root, '.emit-test-'));
  t.after(async () => {
    // Delete only this test's generated directory inside the backend workspace.
    if (dirname(directory) !== root.replace(/[\\/]$/, '') || !basename(directory).startsWith('.emit-test-')) throw new Error('Unsafe test cleanup path');
    await rm(directory, { recursive: true, force: true });
  });
  await promisify(execFile)(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'),
    '-p', join(root, 'tsconfig.build.json'), '--outDir', directory], { timeout: 30000, windowsHide: true });
  await copyFile(join(root, 'prod-ca-2021.crt'), join(directory, 'prod-ca-2021.crt'));
  const entry = await readFile(join(directory, 'api/index.js'), 'utf8');
  assert.match(entry, /from ['"]\.\.\/src\/hosted\.js['"]/);
  assert.ok(!entry.includes("../src/hosted.ts"));
  const { databasePoolConfig } = await import(pathToFileURL(join(directory, 'src/postgres.js')).href);
  const pool = databasePoolConfig({ DATABASE_URL: 'postgresql://fake:fake@aws-0-example.pooler.supabase.com:6543/postgres' });
  assert.equal(pool.ssl.rejectUnauthorized, true);
  assert.match(pool.ssl.ca, /BEGIN CERTIFICATE/);
  const compiled = await import(pathToFileURL(join(directory, 'api/index.js')).href);
  const original = process.env.HOSTED_DEMO_MODE;
  process.env.HOSTED_DEMO_MODE = 'false';
  t.after(() => { if (original === undefined) delete process.env.HOSTED_DEMO_MODE; else process.env.HOSTED_DEMO_MODE = original; });
  const server = createServer(compiled.default);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const response = await fetch('http://127.0.0.1:'+(server.address() as AddressInfo).port+'/api/health');
  assert.equal(response.status, 503); // Expected configuration response, rather than an import-time crash.
  assert.equal((await response.json()).error.code, 'backend_unavailable');
});
