import type { Store } from './database.ts';
import type { SecurityEngine } from './security.ts';
import type { Counts, EventsResponse, OverviewResponse, SecurityEvent, SessionResponse, SessionSummary } from './contracts.ts';
import { deterministicExplanation } from './explanations.ts';

const emptyCounts = (): Counts => ({ total: 0, allow: 0, deny: 0, throttle: 0, block: 0 });
const increment = (counts: Counts, event: SecurityEvent) => { counts.total++; counts[event.decision]++; };
export function eventPage(store: Store, limit: number, before: number, id?: string): EventsResponse {
  const rows = store.events(limit + 1, before, id);
  const page = rows.slice(0, limit);
  const hasMore = rows.length > limit;
  return { apiVersion: '1', items: page.map(row => row.event), pagination: {
    limit, hasMore, nextCursor: hasMore ? String(page.at(-1)!.sequence) : null,
  } };
}
export function sessionSummary(store: Store, engine: SecurityEngine, id: string, now: number): SessionSummary | undefined {
  const row = store.db.prepare('SELECT COUNT(*) AS count,MIN(at) AS first,MAX(at) AS last FROM events WHERE session_id=?').get(id)!;
  const session = store.sessionById(id);
  if (!session && Number(row.count) === 0) return undefined;
  const assessment = engine.assess(id, now);
  return { sessionId: id, firstSeen: new Date(Number(row.first ?? session!.createdAt)).toISOString(),
    lastSeen: new Date(Number(row.last ?? session!.createdAt)).toISOString(),
    riskScore: assessment.riskScore, triggeredRules: assessment.triggeredRules,
    decision: assessment.decision, eventCount: Number(row.count) };
}
export function sessionDetail(store: Store, engine: SecurityEngine, id: string, now: number, limit: number, before: number): SessionResponse | undefined {
  const session = sessionSummary(store, engine, id, now);
  if (!session) return undefined;
  const page = eventPage(store, limit, before, id);
  return { apiVersion: '1', session, protection: engine.status(), timeline: page.items,
    timelinePagination: page.pagination, explanation: deterministicExplanation(page.items) };
}
export function overview(store: Store, engine: SecurityEngine, now: number): OverviewResponse {
  const bucketMs = 60_000;
  const end = Math.floor(now / bucketMs) * bucketMs + bucketMs;
  const start = end - 15 * bucketMs;
  const buckets = Array.from({ length: 15 }, (_, i) => ({
    start: new Date(start + i * bucketMs).toISOString(), end: new Date(start + (i + 1) * bucketMs).toISOString(), ...emptyCounts(),
  }));
  const totals = emptyCounts();
  for (const event of store.periodEvents(start, now)) {
    increment(totals, event);
    increment(buckets[Math.floor((Date.parse(event.timestamp) - start) / bucketMs)]!, event);
  }
  const recentSessions = store.db.prepare('SELECT session_id FROM events WHERE at>=? AND session_id IS NOT NULL GROUP BY session_id ORDER BY MAX(sequence) DESC LIMIT 100').all(start);
  return { apiVersion: '1', generatedAt: new Date(now).toISOString(), protection: engine.status(),
    period: { start: new Date(start).toISOString(), end: new Date(end).toISOString(), bucketMs },
    totals, buckets, sessions: recentSessions.map(row => sessionSummary(store, engine, String(row.session_id), now)!) };
}
