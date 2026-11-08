// Process-only overrides: preserve the user's provider credentials/settings on disk.
Object.assign(process.env, { DEMO_MODE: 'true', HOSTED_DEMO_MODE: 'false', DATABASE_URL: '', BANKING_PROVIDER: 'local' });
await import('./dev.mjs');
