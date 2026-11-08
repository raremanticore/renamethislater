import { createServer } from 'node:http';
import { Store } from './database.ts';
import { createRequestHandler } from './handler.ts';
import type { Config } from './config.ts';
import type { BankingRepository } from './banking.ts';
import type { StateStore } from './storage.ts';

export interface Dependencies { bank?: BankingRepository; now?: () => number; analystFetch?: typeof fetch; nessieFetch?: typeof fetch }
export function createStoredApplication(config: Config, store: StateStore, dependencies: Dependencies = {}) {
  const api = createRequestHandler(config, { ...dependencies, store });
  const server = createServer(api.handler);
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  server.maxHeadersCount = 50;
  return { ...api, server };
}
/** Offline test/local entry point; hosted functions import handler.ts without importing SQLite. */
export function createApplication(config: Config, dependencies: Dependencies & { store?: Store } = {}) {
  if (!config.demoMode) throw new Error('Set DEMO_MODE=true to explicitly enable development-only sessions');
  const store = dependencies.store ?? new Store(config.databasePath);
  store.seed();
  return { ...createStoredApplication(config, store, dependencies), store };
}
