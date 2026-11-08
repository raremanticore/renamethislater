import { Store } from '../src/database.ts';
import { loadConfig } from '../src/config.ts';
import { createPool, PostgresStore } from '../src/postgres.ts';

const command = process.argv[2];
if (command !== 'seed' && command !== 'reset') throw new Error('Use seed or reset');
let store: Store | PostgresStore | undefined;
try {
  const config = loadConfig();
  if (!config.demoMode) throw new Error('Set DEMO_MODE=true');
  store = process.env.DATABASE_URL?.trim() ? new PostgresStore(createPool()) : new Store(config.databasePath);
  if (command === 'reset') await store.resetAll();
  else await store.seed();
  console.log(command === 'reset'
    ? 'Cleared demo sessions, risk signals, and events; protection enabled; fixtures seeded. No Nessie changes.'
    : 'Fictional fixtures seeded idempotently. No Nessie changes.');
} catch {
  console.error('Database command failed. Check demo configuration and database connection; run db:setup first for Postgres.');
  process.exitCode = 1;
} finally { await store?.close(); }
