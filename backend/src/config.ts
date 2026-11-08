export interface Config {
  demoMode: boolean; host: string; port: number; origin: string; databasePath: string;
  adminKey: string; sessionTtlMs: number; windowMs: number; burstWindowMs: number;
  burstLimit: number; throttleScore: number; blockScore: number;
  unauthorizedWeight: number; exportWeight: number; decoyWeight: number;
  eventRetentionMs: number; openaiKey: string; explanationModel: string;
}
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const number = (key: string, fallback: number) => {
    const value = Number(env[key] ?? fallback);
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`Invalid ${key}`);
    return value;
  };
  if (env.NODE_ENV === 'production') throw new Error('This demo backend is development-only.');
  const port = number('PORT', 3001);
  const origin = env.APP_ORIGIN ?? `http://127.0.0.1:${port}`;
  if (new URL(origin).origin !== origin) throw new Error('APP_ORIGIN must be an exact origin');
  const config: Config = {
    demoMode: env.DEMO_MODE === 'true', host: env.HOST ?? '127.0.0.1', port, origin,
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
  };
  if (config.burstWindowMs > config.windowMs || config.throttleScore >= config.blockScore)
    throw new Error('Invalid security window or score thresholds');
  if (config.adminKey && config.adminKey.length < 24) throw new Error('DEMO_ADMIN_KEY must have at least 24 characters');
  return config;
}
