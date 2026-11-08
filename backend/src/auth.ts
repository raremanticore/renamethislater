import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Config } from './config.ts';
import type { Session } from './database.ts';
import type { StateStore } from './storage.ts';

export function secretMatches(supplied: string, expected: string): boolean {
  return expected.length >= 24 && timingSafeEqual(createHash('sha256').update(supplied).digest(), createHash('sha256').update(expected).digest());
}
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
export async function readSession(store: StateStore, cookie: string | undefined, now: number, cookieName: 'demo_session' | 'demo_admin_session' = 'demo_session'): Promise<Session | undefined> {
  const prefix = `${cookieName}=`;
  const token = cookie?.split(';').map(part => part.trim()).find(part => part.startsWith(prefix))?.slice(prefix.length);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return undefined;
  return store.sessionByToken(hash(token), now);
}
export async function createSession(store: StateStore, handle: string, now: number, config: Config) {
  const user = await store.userByHandle(handle);
  if (!user) return undefined;
  const token = randomBytes(32).toString('hex');
  const id = randomUUID();
  const expiresAt = now + config.sessionTtlMs;
  await store.saveSession(id, hash(token), String(user.id), now, expiresAt);
  return {
    session: (await store.sessionById(id))!,
    cookie: `${user.role === 'admin' ? 'demo_admin_session' : 'demo_session'}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(config.sessionTtlMs / 1000)}${config.origin.startsWith('https:') ? '; Secure' : ''}`,
  };
}
