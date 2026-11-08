import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { accounts, transactions, users } from './fixtures.ts';
import type { Action, Authorization, SecurityEvent } from './contracts.ts';

export interface Session {
  id: string; userId: string; handle: string; role: 'customer' | 'admin';
  expiresAt: number; createdAt: number;
}
export interface Signal { at: number; action: Action; authorization: Authorization }
export interface StoredEvent { sequence: number; event: SecurityEvent }
export class Store {
  db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA foreign_keys=ON;
      PRAGMA journal_mode=WAL;
      PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, handle TEXT UNIQUE NOT NULL, role TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL, currency TEXT NOT NULL, balance_cents INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS transactions(id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), posted_at TEXT NOT NULL, description TEXT NOT NULL, amount_cents INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS transactions_account ON transactions(account_id, posted_at);
      CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, user_id TEXT NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS signals(id INTEGER PRIMARY KEY, session_id TEXT NOT NULL, at INTEGER NOT NULL, action TEXT NOT NULL, authorization TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS signals_session_time ON signals(session_id, at);
      CREATE INDEX IF NOT EXISTS signals_time ON signals(at);
      CREATE TABLE IF NOT EXISTS events(sequence INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT, at INTEGER NOT NULL, payload TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS events_time ON events(at);
      CREATE INDEX IF NOT EXISTS events_session ON events(session_id, sequence);
      CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT OR IGNORE INTO settings VALUES('protection', 'true');
      PRAGMA user_version=1;
    `);
  }
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  seed() {
    this.transaction(() => {
      for (const u of users) this.db.prepare('INSERT OR IGNORE INTO users VALUES(?,?,?)').run(u.id, u.handle, u.role);
      for (const a of accounts) this.db.prepare('INSERT OR IGNORE INTO accounts VALUES(?,?,?,?,?)').run(a.id, a.userId, a.name, 'USD', a.balanceCents);
      for (const t of transactions) this.db.prepare('INSERT OR IGNORE INTO transactions VALUES(?,?,?,?,?)').run(t.id, t.accountId, t.postedAt, t.description, t.amountCents);
    });
  }
  get protectionEnabled(): boolean {
    return this.db.prepare("SELECT value FROM settings WHERE key='protection'").get()?.value === 'true';
  }
  set protectionEnabled(enabled: boolean) {
    this.db.prepare("UPDATE settings SET value=? WHERE key='protection'").run(String(enabled));
  }
  resetSecurity() {
    this.transaction(() => {
      this.db.exec('DELETE FROM events; DELETE FROM signals;');
      this.protectionEnabled = true;
    });
  }
  resetAll() {
    this.resetSecurity();
    this.db.exec('DELETE FROM sessions');
    this.seed();
  }
  prune(now: number, windowMs: number, retentionMs: number) {
    this.db.prepare('DELETE FROM signals WHERE at<=?').run(now - windowMs);
    this.db.prepare('DELETE FROM events WHERE at<=?').run(now - retentionMs);
    this.db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(now);
  }
  signals(id: string, since: number): Signal[] {
    return this.db.prepare('SELECT at, action, authorization FROM signals WHERE session_id=? AND at>? ORDER BY at,id').all(id, since) as unknown as Signal[];
  }
  addSignal(id: string, signal: Signal) {
    this.db.prepare('INSERT INTO signals(session_id,at,action,authorization) VALUES(?,?,?,?)').run(id, signal.at, signal.action, signal.authorization);
  }
  record(event: SecurityEvent) {
    this.db.prepare('INSERT INTO events(session_id,at,payload) VALUES(?,?,?)').run(event.sessionId, Date.parse(event.timestamp), JSON.stringify(event));
  }
  events(limit: number, before: number, sessionId?: string): StoredEvent[] {
    const rows = sessionId === undefined
      ? this.db.prepare('SELECT sequence,payload FROM events WHERE sequence<? ORDER BY sequence DESC LIMIT ?').all(before, limit)
      : this.db.prepare('SELECT sequence,payload FROM events WHERE sequence<? AND session_id=? ORDER BY sequence DESC LIMIT ?').all(before, sessionId, limit);
    return rows.map(row => ({ sequence: Number(row.sequence), event: JSON.parse(String(row.payload)) as SecurityEvent }));
  }
  periodEvents(start: number, end: number): SecurityEvent[] {
    return this.db.prepare('SELECT payload FROM events WHERE at>=? AND at<=? ORDER BY sequence').all(start, end).map(row => JSON.parse(String(row.payload)) as SecurityEvent);
  }
  sessionById(id: string): Session | undefined {
    return this.db.prepare(`SELECT s.id,s.user_id AS userId,u.handle,u.role,s.created_at AS createdAt,s.expires_at AS expiresAt FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=?`).get(id) as unknown as Session | undefined;
  }
  close() { this.db.close(); }
}
