import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e', fullyParallel: false, workers: 1, timeout: 60_000,
  expect: { timeout: 15_000 },
  use: { baseURL: 'http://localhost:3018', channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL ?? 'chrome', trace: 'retain-on-failure' },
  webServer: {
    command: 'node scripts/dev.mjs', url: 'http://localhost:3018/api/health', timeout: 120_000, reuseExistingServer: false,
    env: {
      FRONTEND_PORT: '3018', BACKEND_PORT: '3019', BACKEND_ENV_FILE: '.env.e2e-does-not-exist',
      DEMO_MODE: 'true', BANKING_PROVIDER: 'local', DATABASE_PATH: ':memory:',
      DATABASE_URL: '', HOSTED_DEMO_MODE: 'false',
      DEMO_ADMIN_KEY: 'e2e-only-fictional-admin-key-24-characters', OPENAI_API_KEY: '', OPENAI_EXPLANATION_MODEL: '',
      NESSIE_API_KEY: '', NESSIE_ACCOUNT_MAP: '{}',
    },
  },
});
