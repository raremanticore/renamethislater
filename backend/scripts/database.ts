import { Store } from '../src/database.ts';
import { loadConfig } from '../src/config.ts';

const command = process.argv[2];
if (command !== 'seed' && command !== 'reset') throw new Error('Use seed or reset');
const config = loadConfig();
if (!config.demoMode) throw new Error('Set DEMO_MODE=true');
const store = new Store(config.databasePath);
try {
  if (command === 'reset') store.resetAll();
  else store.seed();
  console.log(command === 'reset' ? 'Cleared demo sessions, risk signals, and events; protection enabled; fictional fixtures seeded.' : 'Fictional fixtures seeded idempotently.');
} finally { store.close(); }
