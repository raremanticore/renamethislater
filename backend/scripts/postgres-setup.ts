import { readFile } from 'node:fs/promises';
import { createPool, PostgresStore } from '../src/postgres.ts';

// Explicit command, never invoked during a build or HTTP request. No Nessie/model calls.
let pool: ReturnType<typeof createPool> | undefined;
try {
  pool = createPool();
  const store = new PostgresStore(pool);
  const sql = await readFile(new URL('../migrations/001_initial.sql', import.meta.url), 'utf8');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(1835363685,1)');
    await client.query(sql);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
  await store.seed();
  await store.assertReady();
  console.log('Postgres schema ready; fictional fixtures seeded idempotently. No Nessie data changed.');
} catch {
  console.error('Database setup failed. Check DATABASE_URL, URL-encoded password, TLS certificate, connectivity, and database permissions. No driver details printed.');
  process.exitCode = 1;
} finally { await pool?.end(); }
