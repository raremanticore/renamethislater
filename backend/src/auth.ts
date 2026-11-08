import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Config } from './config.ts';
import type { Store, Session } from './database.ts';

export function secretMatches(supplied: string, expected: string): boolean {
  return expected.length >= 24 && timingSafeEqual(createHash('sha256').update(supplied).digest(), createHash('sha256').update(expected).digest());
}
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
export function readSession(store: Store, cookie: string | undefined, now: number, cookieName: 'demo_session' | 'demo_admin_session' = 'demo_session'): Session | undefined {
  const prefix = `${cookieName}=`;
  const token = cookie?.split(';').map(part => part.trim()).find(part => part.startsWith(prefix))?.slice(prefix.length);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return undefined;
  const row = store.db.prepare('SELECT id FROM sessions WHERE token_hash=? AND expires_at>?').get(hash(token), now);
  return row ? store.sessionById(String(row.id)) : undefined;
}
export function createSession(store: Store, handle: string, now: number, config: Config) {
  const user = store.db.prepare('SELECT id,handle,role FROM users WHERE handle=?').get(handle);
  if (!user) return undefined;
  const token = randomBytes(32).toString('hex');
  const id = randomUUID();
  const expiresAt = now + config.sessionTtlMs;
  store.db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?)').run(id, hash(token), String(user.id), now, expiresAt);
  return {
    session: store.sessionById(id)!,
    cookie: `${user.role === 'admin' ? 'demo_admin_session' : 'demo_session'}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(config.sessionTtlMs / 1000)}${config.origin.startsWith('https:') ? '; Secure' : ''}`,
  };
}
