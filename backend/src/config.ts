export interface Config {
  demoMode: boolean; hostedDemo: boolean; host: string; port: number; origin: string; databasePath: string;
  adminKey: string; sessionTtlMs: number; windowMs: number; burstWindowMs: number;
  burstLimit: number; throttleScore: number; blockScore: number;
  unauthorizedWeight: number; exportWeight: number; decoyWeight: number;
  eventRetentionMs: number; openaiKey: string; explanationModel: string;
  bankingProvider: 'local' | 'nessie'; nessieApiKey: string; nessieBaseUrl: string;
  nessieAccounts: NessieAccountMap;
}
/** Server user ID -> public application account alias -> owned Nessie sandbox account ID. */
export type NessieAccountMap = Record<string, Record<string, string>>;
export function parseNessieAccounts(raw: string): NessieAccountMap {
  const fail = () => { throw new Error('Invalid NESSIE_ACCOUNT_MAP: use unique aliases and sandbox accounts mapped to user-alice/user-bob'); };
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return fail(); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  const result: NessieAccountMap = Object.create(null);
  const aliases = new Set<string>();
  const upstreamIds = new Set<string>();
  for (const [userId, accounts] of Object.entries(value)) {
    if (!['user-alice', 'user-bob'].includes(userId) || !accounts || typeof accounts !== 'object' || Array.isArray(accounts)) return fail();
    const mapped: Record<string, string> = Object.create(null);
    for (const [alias, id] of Object.entries(accounts)) {
      if (!/^acc-[a-zA-Z0-9_-]{1,96}$/.test(alias) || typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(id)
        || aliases.has(alias) || upstreamIds.has(id)) return fail();
      aliases.add(alias); upstreamIds.add(id); mapped[alias] = id;
    }
    result[userId] = mapped;
  }
  return result;
}
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const number = (key: string, fallback: number) => {
    const value = Number(env[key] ?? fallback);
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`Invalid ${key}`);
    return value;
  };
  const hostedDemo = env.HOSTED_DEMO_MODE === 'true';
  if (env.NODE_ENV === 'production' && !hostedDemo) throw new Error('This demo backend is development-only unless HOSTED_DEMO_MODE=true.');
  if ((env.NODE_ENV === 'production' || env.VERCEL === '1' || hostedDemo) && !env.DATABASE_URL?.trim())
    throw new Error('Hosted demo requires server-only DATABASE_URL; SQLite is local-only');
  const port = number('PORT', 3001);
  const origin = env.APP_ORIGIN ?? `http://127.0.0.1:${port}`;
  if (new URL(origin).origin !== origin) throw new Error('APP_ORIGIN must be an exact origin');
  if (hostedDemo && (!env.APP_ORIGIN || !origin.startsWith('https://') || env.DEMO_MODE !== 'true' || (env.DEMO_ADMIN_KEY?.length ?? 0) < 24))
    throw new Error('Hosted demo requires DEMO_MODE=true, HTTPS APP_ORIGIN, and DEMO_ADMIN_KEY (24+ characters)');
  const provider = env.BANKING_PROVIDER ?? 'local';
  if (provider !== 'local' && provider !== 'nessie') throw new Error('BANKING_PROVIDER must be local or nessie');
  let nessieBase: URL;
  try { nessieBase = new URL(env.NESSIE_API_BASE_URL ?? 'https://prod-api.nessieisreal.com'); }
  catch { throw new Error('Invalid NESSIE_API_BASE_URL'); }
  if (nessieBase.protocol !== 'https:' || nessieBase.username || nessieBase.password || nessieBase.search || nessieBase.hash)
    throw new Error('NESSIE_API_BASE_URL must use HTTPS without credentials, query, or fragment');
  const nessieAccounts = parseNessieAccounts(env.NESSIE_ACCOUNT_MAP ?? '{}');
  if (provider === 'nessie' && (!env.NESSIE_API_KEY?.trim() || !Object.values(nessieAccounts).some(accounts => Object.keys(accounts).length)))
    throw new Error('Nessie mode requires NESSIE_API_KEY and a nonempty trusted NESSIE_ACCOUNT_MAP');
  const config: Config = {
    demoMode: env.DEMO_MODE === 'true', hostedDemo, host: env.HOST ?? '127.0.0.1', port, origin,
    databasePath: env.DATABASE_PATH ?? './data/demo.sqlite', adminKey: env.DEMO_ADMIN_KEY ?? '',
    sessionTtlMs: 8 * 60 * 60 * 1000,
    windowMs: number('SECURITY_WINDOW_MS', 300_000),
    burstWindowMs: number('SECURITY_BURST_WINDOW_MS', 2_000),
    burstLimit: number('SECURITY_BURST_LIMIT', 8),
    throttleScore: number('SECURITY_THROTTLE_SCORE', 55),
    blockScore: number('SECURITY_BLOCK_SCORE', 90),
    unauthorizedWeight: 25, exportWeight: 20, decoyWeight: 70,
    eventRetentionMs: 24 * 60 * 60 * 1000,
    openaiKey: env.OPENAI_API_KEY ?? '', explanationModel: env.OPENAI_EXPLANATION_MODEL ?? '',
    bankingProvider: provider, nessieApiKey: env.NESSIE_API_KEY ?? '',
    nessieBaseUrl: nessieBase.href.replace(/\/$/, ''), nessieAccounts,
  };
  if (config.burstWindowMs > config.windowMs || config.throttleScore >= config.blockScore)
    throw new Error('Invalid security window or score thresholds');
  if (config.adminKey && config.adminKey.length < 24) throw new Error('DEMO_ADMIN_KEY must have at least 24 characters');
  return config;
}
