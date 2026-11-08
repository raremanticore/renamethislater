import { test } from 'node:test';
import assert from 'node:assert/strict';
import { smokeFailure } from '../src/smoke-errors.ts';

test('live smoke diagnostics distinguish credentials, account mapping, network, and invalid data without echoing bodies', async () => {
  for (const code of ['nessie_auth_failed', 'nessie_account_not_found', 'nessie_unavailable', 'nessie_invalid_response']) {
    const error = await smokeFailure(Response.json({ error: { code, message: 'secret-key and banking contents must not be printed' } }, { status: 502 }), 'account');
    assert.match(error.message, /account failed: HTTP 502/);
    assert.ok(error.message.includes(`[${code}]`));
    assert.ok(!error.message.includes('secret-key'));
    assert.ok(!error.message.includes('banking contents'));
  }
});

test('unknown, malicious, non-JSON, and oversized diagnostic bodies never reach CLI output', async () => {
  for (const response of [
    Response.json({ error: { code: 'https://example.test?key=secret', message: 'secret' } }, { status: 502 }),
    Response.json({ error: { code: '__proto__' } }, { status: 502 }),
    Response.json(null, { status: 502 }),
    new Response('secret response body', { status: 502 }),
    new Response('secret'.repeat(1000), { status: 502 }),
  ]) {
    const error = await smokeFailure(response, 'transactions');
    assert.match(error.message, /transactions failed: HTTP 502 \[unrecognized_error\]/);
    assert.ok(!error.message.includes('secret'));
    assert.ok(!error.message.includes('https:'));
  }
});
