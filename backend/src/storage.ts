import type { Account, SecurityEvent, Transaction } from './contracts.ts';
import type { Session, Signal, StoredEvent } from './database.ts';

export type Awaitable<T> = T | Promise<T>;
export interface User { id: string; handle: string; role: 'customer' | 'admin' }
/** Implementations own transaction boundaries. Protected payloads never enter audit storage. */
export interface StateStore {
  atomic<T>(fn: (store: StateStore) => Promise<T>): Promise<T>;
  protection(): Awaitable<boolean>;
  setProtection(enabled: boolean): Awaitable<void>;
  resetSecurity(): Awaitable<void>;
  prune(now: number, windowMs: number, retentionMs: number): Awaitable<void>;
  signals(id: string, since: number): Awaitable<Signal[]>;
  addSignal(id: string, signal: Signal): Awaitable<void>;
  record(event: SecurityEvent): Awaitable<void>;
  events(limit: number, before: number, id?: string): Awaitable<StoredEvent[]>;
  periodEvents(start: number, end: number): Awaitable<SecurityEvent[]>;
  sessionById(id: string): Awaitable<Session | undefined>;
  sessionByToken(hash: string, now: number): Awaitable<Session | undefined>;
  userByHandle(handle: string): Awaitable<User | undefined>;
  saveSession(id: string, hash: string, userId: string, createdAt: number, expiresAt: number): Awaitable<void>;
  revokeSession(id: string): Awaitable<void>;
  accountIds(userId: string): Awaitable<string[]>;
  ownsAccount(userId: string, id: string): Awaitable<boolean>;
  account(id: string): Awaitable<Account>;
  transactions(id: string): Awaitable<Transaction[]>;
  eventStats(id: string): Awaitable<{ count: number; first: number | null; last: number | null }>;
  recentSessionIds(since: number): Awaitable<string[]>;
}
