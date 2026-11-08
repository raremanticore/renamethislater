import { createApplication } from './app.ts';
import { loadConfig } from './config.ts';
import { createServer } from 'node:http';
import { createRequestHandler } from './handler.ts';
import { createPool, PostgresStore } from './postgres.ts';

const config = loadConfig();
const app = await (async () => {
  if (!process.env.DATABASE_URL?.trim()) return createApplication(config);
  const store = new PostgresStore(createPool());
  try {
    await store.assertReady();
    const api = createRequestHandler(config, { store });
    return { ...api, server: createServer(api.handler), store };
  } catch { await store.close(); throw new Error('Database unavailable. Run npm run db:setup and check DATABASE_URL/TLS.'); }
})();
app.server.listen(config.port, config.host, () => {
  console.log(`Development-only banking demo: http://${config.host}:${config.port}`);
  console.log('Synthetic data only. Demo administrator login requires DEMO_ADMIN_KEY.');
  console.log(`Security storage: ${process.env.DATABASE_URL ? 'Postgres' : 'local SQLite'}`);
  console.log(`Banking source: ${config.bankingProvider === 'nessie' ? 'Nessie sandbox (no fixture fallback)' : 'local fictional fixtures'}`);
});
let closing = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => {
  if (closing) return;
  closing = true;
  app.server.close(() => { Promise.resolve(app.store.close()).finally(() => process.exit(0)); });
  app.server.closeIdleConnections();
});
