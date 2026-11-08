import { createRequestHandler } from './handler.ts';
import { loadConfig } from './config.ts';
import { createPool, PostgresStore } from './postgres.ts';
import { HostedStartupError, startupReason } from './startup-diagnostics.ts';

let pending: Promise<ReturnType<typeof createRequestHandler>> | undefined;
/** One pool per warm instance; failed initialization can recover on the next request. */
export function hostedApplication() {
  if (!pending) pending = (async () => {
    let config;
    try {
      config = loadConfig();
      if (!config.hostedDemo) throw new Error('Explicit HOSTED_DEMO_MODE=true required');
    } catch (error) { throw new HostedStartupError(startupReason(error, 'configuration', process.env), 'configuration'); }
    let store;
    try { store = new PostgresStore(createPool()); }
    catch (error) { throw new HostedStartupError(startupReason(error, 'database_configuration', process.env), 'database_configuration'); }
    try { await store.assertReady(); return createRequestHandler(config, { store }); }
    catch (error) {
      await store.close().catch(() => {});
      throw new HostedStartupError(startupReason(error, 'database_readiness', process.env), 'database_readiness');
    }
  })().catch(error => { pending = undefined; throw error; });
  return pending;
}
