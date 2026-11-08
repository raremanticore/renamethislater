/** Safe startup diagnostics: never return/log exception text, URLs, keys, or driver details. */
export type StartupReason = 'hosted_demo_disabled' | 'demo_mode_disabled' | 'database_url_missing'
  | 'app_origin_invalid' | 'admin_key_missing_or_short' | 'nessie_account_map_invalid'
  | 'nessie_configuration_invalid' | 'configuration_invalid' | 'database_url_invalid'
  | 'database_certificate_missing' | 'database_tls_failed' | 'database_authentication_failed'
  | 'database_schema_missing' | 'database_seed_missing' | 'database_permission_denied'
  | 'database_connection_failed' | 'database_unavailable' | 'startup_failed';
export type StartupStage = 'configuration' | 'database_configuration' | 'database_readiness';
export class HostedStartupError extends Error {
  readonly reason: StartupReason;
  readonly stage: StartupStage;
  constructor(reason: StartupReason, stage: StartupStage) {
    super('Hosted backend initialization failed'); this.reason = reason; this.stage = stage;
  }
}
export function startupReason(error: unknown, stage: StartupStage, env: NodeJS.ProcessEnv): StartupReason {
  if (stage === 'configuration') {
    if (env.HOSTED_DEMO_MODE !== 'true') return 'hosted_demo_disabled';
    if (env.DEMO_MODE !== 'true') return 'demo_mode_disabled';
    if (!env.DATABASE_URL?.trim()) return 'database_url_missing';
    try { const url = new URL(env.APP_ORIGIN ?? ''); if (url.protocol !== 'https:' || url.origin !== env.APP_ORIGIN) return 'app_origin_invalid'; }
    catch { return 'app_origin_invalid'; }
    if ((env.DEMO_ADMIN_KEY?.length ?? 0) < 24) return 'admin_key_missing_or_short';
    const message = error instanceof Error ? error.message : '';
    if (message === 'Invalid NESSIE_ACCOUNT_MAP: use unique aliases and sandbox accounts mapped to user-alice/user-bob') return 'nessie_account_map_invalid';
    if (['Nessie mode requires NESSIE_API_KEY and a nonempty trusted NESSIE_ACCOUNT_MAP',
      'Invalid NESSIE_API_BASE_URL', 'NESSIE_API_BASE_URL must use HTTPS without credentials, query, or fragment',
      'BANKING_PROVIDER must be local or nessie'].includes(message)) return 'nessie_configuration_invalid';
    return 'configuration_invalid';
  }
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  if (code === 'ENOENT' && stage === 'database_configuration') return 'database_certificate_missing';
  if (['SELF_SIGNED_CERT_IN_CHAIN', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    'CERT_HAS_EXPIRED', 'ERR_TLS_CERT_ALTNAME_INVALID'].includes(String(code))) return 'database_tls_failed';
  if (code === '28P01' || code === '28000') return 'database_authentication_failed';
  if (code === '42P01' || code === '3F000') return 'database_schema_missing';
  if (code === '42501') return 'database_permission_denied';
  if (['ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET'].includes(String(code))) return 'database_connection_failed';
  const message = error instanceof Error ? error.message : '';
  if (message === 'Run database setup') return 'database_schema_missing';
  if (message === 'Run database seed') return 'database_seed_missing';
  if (stage === 'database_configuration') return 'database_url_invalid';
  return 'database_unavailable';
}
