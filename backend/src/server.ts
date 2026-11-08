import { createApplication } from './app.ts';
import { loadConfig } from './config.ts';

const config = loadConfig();
const app = createApplication(config);
app.server.listen(config.port, config.host, () => {
  console.log(`Development-only banking demo: http://${config.host}:${config.port}`);
  console.log('Synthetic data only. Demo administrator login requires DEMO_ADMIN_KEY.');
  console.log(`Banking source: ${config.bankingProvider === 'nessie' ? 'Nessie sandbox (no fixture fallback)' : 'local fictional fixtures'}`);
});
let closing = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => {
  if (closing) return;
  closing = true;
  app.server.close(() => { app.store.close(); process.exit(0); });
  app.server.closeIdleConnections();
});
