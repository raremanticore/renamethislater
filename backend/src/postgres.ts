import pg from 'pg';
import { readFileSync } from 'node:fs';
import type { Pool, PoolClient, PoolConfig, QueryResultRow } from 'pg';
import type { StateStore, User } from './storage.ts';
import type { Session, Signal, StoredEvent } from './database.ts';
import type { Account, SecurityEvent, Transaction } from './contracts.ts';
import { accounts, transactions, users } from './fixtures.ts';

export function databasePoolConfig(env: NodeJS.ProcessEnv): PoolConfig {
  let url: URL;
  try { url = new URL(env.DATABASE_URL ?? ''); } catch { throw new Error('Set a valid server-only DATABASE_URL'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('DATABASE_URL must use Postgres');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && env.NODE_ENV !== 'production';
  // Supabase's database CA is not in Node's public trust store. This is a public
  // certificate downloaded by the operator, never a private key or TLS bypass.
  const supabase = url.hostname.endsWith('.pooler.supabase.com') || url.hostname.endsWith('.supabase.co');
  const ca = env.DATABASE_CA_CERT?.replaceAll('\\n', '\n')
    || (supabase ? readFileSync(new URL('../prod-ca-2021.crt', import.meta.url), 'utf8') : undefined);
  // URL options must not override certificate verification.
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'uselibpqcompat']) url.searchParams.delete(key);
  return { connectionString: url.toString(), max: 1, connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000,
    query_timeout: 10000, allowExitOnIdle: true,
    ssl: local ? false : { rejectUnauthorized: true, ...(ca ? { ca } : {}) } };
}
export function createPool(env: NodeJS.ProcessEnv = process.env): Pool {
  const pool = new pg.Pool(databasePoolConfig(env));
  pool.on('error', () => { console.error('Database connection unavailable'); }); // Never log driver errors/URLs.
  return pool;
}
const columns = 's.id,s.user_id AS "userId",u.handle,u.role,s.created_at AS "createdAt",s.expires_at AS "expiresAt"';
function integer(value: unknown): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error('Invalid database integer');
  return number;
}
function session(row: QueryResultRow | undefined): Session | undefined {
  return row ? { ...row, createdAt: integer(row.createdAt), expiresAt: integer(row.expiresAt) } as Session : undefined;
}
/** A transaction always uses one checked-out connection. No named prepared statements. */
export class PostgresStore implements StateStore {
  readonly pool: Pool;
  private client?: PoolClient;
  constructor(pool: Pool, client?: PoolClient) { this.pool = pool; this.client = client; }
  private async rows(sql: string, values: unknown[] = []): Promise<QueryResultRow[]> {
    return (await (this.client ?? this.pool).query(sql, values)).rows;
  }
  async assertReady() {
    const rows = await this.rows('SELECT version FROM veyl.schema_migrations WHERE version=1');
    if (rows.length !== 1) throw new Error('Run database setup');
    const user = await this.userByHandle('admin');
    if (!user) throw new Error('Run database seed');
  }
  async atomic<T>(fn: (store: StateStore) => Promise<T>): Promise<T> {
    if (this.client) return fn(this);
    const client = await this.pool.connect();
    let broken = false;
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout='5s'");
      await client.query("SET LOCAL statement_timeout='5s'");
      // Transaction lock works with Supavisor and coordinates all Vercel instances.
      // A demo-wide lock also orders resets/toggles against risk inspection.
      await client.query('SELECT pg_advisory_xact_lock(1835363685,1)');
      const result = await fn(new PostgresStore(this.pool, client));
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { broken = true; }
      throw error;
    } finally { client.release(broken); }
  }
  async seed() {
    await this.atomic(async state => {
      const store = state as PostgresStore;
      for (const u of users) await store.rows('INSERT INTO veyl.users VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[u.id,u.handle,u.role]);
      for (const a of accounts) await store.rows('INSERT INTO veyl.accounts VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',[a.id,a.userId,a.name,'USD',a.balanceCents]);
      for (const t of transactions) await store.rows('INSERT INTO veyl.transactions VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',[t.id,t.accountId,t.postedAt,t.description,t.amountCents]);
    });
  }
  async protection() {
    const value = (await this.rows("SELECT value FROM veyl.settings WHERE key='protection'"))[0]?.value;
    if (value !== 'true' && value !== 'false') throw new Error('Protection setting missing');
    return value === 'true';
  }
  async setProtection(enabled: boolean) {
    await this.atomic(async state => { await (state as PostgresStore).rows("UPDATE veyl.settings SET value=$1 WHERE key='protection'",[String(enabled)]); });
  }
  async resetSecurity() {
    await this.atomic(async state => {
      const store = state as PostgresStore;
      await store.rows('DELETE FROM veyl.events');
      await store.rows('DELETE FROM veyl.signals');
      await store.setProtection(true);
    });
  }
  async resetAll() {
    await this.atomic(async state => {
      const store = state as PostgresStore;
      await store.resetSecurity();
      await store.rows('DELETE FROM veyl.sessions');
    });
    await this.seed();
  }
  async prune(now: number, windowMs: number, retentionMs: number) {
    await this.rows('DELETE FROM veyl.signals WHERE at<=$1',[now-windowMs]);
    await this.rows('DELETE FROM veyl.events WHERE at<=$1',[now-retentionMs]);
    await this.rows('DELETE FROM veyl.sessions WHERE expires_at<=$1',[now]);
  }
  async signals(id: string, since: number): Promise<Signal[]> {
    return (await this.rows('SELECT at,action,authorization_outcome AS "authorization" FROM veyl.signals WHERE session_id=$1 AND at>$2 ORDER BY at,id',[id,since]))
      .map(row => ({ ...row, at: integer(row.at) } as Signal));
  }
  async addSignal(id: string, signal: Signal) { await this.rows('INSERT INTO veyl.signals(session_id,at,action,authorization_outcome) VALUES($1,$2,$3,$4)',[id,signal.at,signal.action,signal.authorization]); }
  async record(event: SecurityEvent) { await this.rows('INSERT INTO veyl.events(session_id,at,payload) VALUES($1,$2,$3)',[event.sessionId,Date.parse(event.timestamp),JSON.stringify(event)]); }
  async events(limit: number, before: number, id?: string): Promise<StoredEvent[]> {
    const rows = id === undefined
      ? await this.rows('SELECT sequence,payload FROM veyl.events WHERE sequence<$1 ORDER BY sequence DESC LIMIT $2',[before,limit])
      : await this.rows('SELECT sequence,payload FROM veyl.events WHERE sequence<$1 AND session_id=$2 ORDER BY sequence DESC LIMIT $3',[before,id,limit]);
    return rows.map(row => ({ sequence: integer(row.sequence), event: row.payload as SecurityEvent }));
  }
  async periodEvents(start: number, end: number): Promise<SecurityEvent[]> {
    return (await this.rows('SELECT payload FROM veyl.events WHERE at>=$1 AND at<=$2 ORDER BY sequence',[start,end])).map(row => row.payload as SecurityEvent);
  }
  async sessionById(id: string) { return session((await this.rows('SELECT '+columns+' FROM veyl.sessions s JOIN veyl.users u ON u.id=s.user_id WHERE s.id=$1',[id]))[0]); }
  async sessionByToken(hash: string, now: number) { return session((await this.rows('SELECT '+columns+' FROM veyl.sessions s JOIN veyl.users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>$2',[hash,now]))[0]); }
  async userByHandle(handle: string) { return (await this.rows('SELECT id,handle,role FROM veyl.users WHERE handle=$1',[handle]))[0] as User | undefined; }
  async saveSession(id: string, hash: string, userId: string, createdAt: number, expiresAt: number) { await this.rows('INSERT INTO veyl.sessions VALUES($1,$2,$3,$4,$5)',[id,hash,userId,createdAt,expiresAt]); }
  async revokeSession(id: string) { await this.rows('DELETE FROM veyl.sessions WHERE id=$1',[id]); }
  async accountIds(userId: string) { return (await this.rows('SELECT id FROM veyl.accounts WHERE user_id=$1 ORDER BY id',[userId])).map(row => String(row.id)); }
  async ownsAccount(userId: string, id: string) { return (await this.rows('SELECT 1 FROM veyl.accounts WHERE id=$1 AND user_id=$2',[id,userId])).length > 0; }
  async account(id: string): Promise<Account> {
    const row = (await this.rows('SELECT id,name,currency,balance_cents AS "balanceCents" FROM veyl.accounts WHERE id=$1',[id]))[0];
    if (!row) throw new Error('Account missing');
    return { ...row, balanceCents: integer(row.balanceCents) } as Account;
  }
  async transactions(id: string): Promise<Transaction[]> {
    return (await this.rows('SELECT id,account_id AS "accountId",posted_at AS "postedAt",description,amount_cents AS "amountCents" FROM veyl.transactions WHERE account_id=$1 ORDER BY posted_at,id',[id]))
      .map(row => ({ ...row, amountCents: integer(row.amountCents) } as Transaction));
  }
  async eventStats(id: string) {
    const row = (await this.rows('SELECT COUNT(*) AS count,MIN(at) AS first,MAX(at) AS last FROM veyl.events WHERE session_id=$1',[id]))[0]!;
    return { count: integer(row.count), first: row.first === null ? null : integer(row.first), last: row.last === null ? null : integer(row.last) };
  }
  async recentSessionIds(since: number) { return (await this.rows('SELECT session_id FROM veyl.events WHERE at>=$1 AND session_id IS NOT NULL GROUP BY session_id ORDER BY MAX(sequence) DESC LIMIT 100',[since])).map(row => String(row.session_id)); }
  async close() { if (!this.client) await this.pool.end(); }
}
