import { createRequestHandler } from './handler.ts';
import { loadConfig } from './config.ts';
import { createPool, PostgresStore } from './postgres.ts';

let pending: Promise<ReturnType<typeof createRequestHandler>> | undefined;
/** One pool per warm instance; failed initialization can recover on the next request. */
export function hostedApplication() {
  if (!pending) pending = (async () => {
    const config = loadConfig();
    if (!config.hostedDemo) throw new Error('Explicit HOSTED_DEMO_MODE=true required');
    const store = new PostgresStore(createPool());
    try { await store.assertReady(); return createRequestHandler(config, { store }); }
    catch (error) { await store.close().catch(() => {}); throw error; }
  })().catch(error => { pending = undefined; throw error; });
  return pending;
}
