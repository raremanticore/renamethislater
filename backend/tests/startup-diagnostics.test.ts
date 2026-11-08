import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startupReason } from '../src/startup-diagnostics.ts';

const valid = { HOSTED_DEMO_MODE: 'true', DEMO_MODE: 'true', DATABASE_URL: 'postgresql://fake:fake@db.test/postgres',
  APP_ORIGIN: 'https://frontend.example.test', DEMO_ADMIN_KEY: 'offline-fake-secret-with-at-least-24' };

test('startup configuration diagnostics name the failed requirement without returning values', () => {
  const cases = [
    [{ HOSTED_DEMO_MODE: 'false' }, 'hosted_demo_disabled'],
    [{ DEMO_MODE: '"true"' }, 'demo_mode_disabled'],
    [{ DATABASE_URL: '' }, 'database_url_missing'],
    [{ APP_ORIGIN: 'https://frontend.example.test/' }, 'app_origin_invalid'],
    [{ APP_ORIGIN: 'not-a-url' }, 'app_origin_invalid'],
    [{ DEMO_ADMIN_KEY: 'short' }, 'admin_key_missing_or_short'],
  ] as const;
  for (const [override, expected] of cases) assert.equal(startupReason(new Error('private content'), 'configuration', { ...valid, ...override }), expected);
  assert.equal(startupReason(new Error('Invalid NESSIE_ACCOUNT_MAP: use unique aliases and sandbox accounts mapped to user-alice/user-bob'), 'configuration', valid), 'nessie_account_map_invalid');
  assert.equal(startupReason(new Error('private content'), 'configuration', valid), 'configuration_invalid');
});

test('startup database diagnostics allowlist error codes and never echo provider messages', () => {
  for (const [code, expected] of [
    ['28P01', 'database_authentication_failed'], ['42P01', 'database_schema_missing'],
    ['42501', 'database_permission_denied'], ['SELF_SIGNED_CERT_IN_CHAIN', 'database_tls_failed'],
    ['ENOTFOUND', 'database_connection_failed'], ['unknown-secret', 'database_unavailable'],
  ]) assert.equal(startupReason({ code, message: valid.DATABASE_URL }, 'database_readiness', valid), expected);
  assert.equal(startupReason({ code: 'ENOENT', path: 'private path' }, 'database_configuration', valid), 'database_certificate_missing');
  assert.equal(startupReason(new Error('Run database seed'), 'database_readiness', valid), 'database_seed_missing');
});
