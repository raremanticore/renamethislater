import type { StateStore } from './storage.ts';
import type { SecurityEngine } from './security.ts';
import type { Counts, EventsResponse, OverviewResponse, SecurityEvent, SessionResponse, SessionSummary } from './contracts.ts';
import { deterministicExplanation } from './explanations.ts';

const emptyCounts = (): Counts => ({ total: 0, allow: 0, deny: 0, throttle: 0, block: 0 });
const increment = (counts: Counts, event: SecurityEvent) => { counts.total++; counts[event.decision]++; };
export async function eventPage(store: StateStore, limit: number, before: number, id?: string): Promise<EventsResponse> {
  const rows = await store.events(limit + 1, before, id);
  const page = rows.slice(0, limit);
  const hasMore = rows.length > limit;
  return { apiVersion: '1', items: page.map(row => row.event), pagination: {
    limit, hasMore, nextCursor: hasMore ? String(page.at(-1)!.sequence) : null,
  } };
}
export async function sessionSummary(store: StateStore, engine: SecurityEngine, id: string, now: number): Promise<SessionSummary | undefined> {
  const row = await store.eventStats(id);
  const session = await store.sessionById(id);
  if (!session && Number(row.count) === 0) return undefined;
  const assessment = await engine.assess(id, now);
  return { sessionId: id, firstSeen: new Date(Number(row.first ?? session!.createdAt)).toISOString(),
    lastSeen: new Date(Number(row.last ?? session!.createdAt)).toISOString(),
    riskScore: assessment.riskScore, triggeredRules: assessment.triggeredRules,
    decision: assessment.decision, eventCount: Number(row.count) };
}
export async function sessionDetail(store: StateStore, engine: SecurityEngine, id: string, now: number, limit: number, before: number): Promise<SessionResponse | undefined> {
  const session = await sessionSummary(store, engine, id, now);
  if (!session) return undefined;
  const page = await eventPage(store, limit, before, id);
  return { apiVersion: '1', session, protection: await engine.status(), timeline: page.items,
    timelinePagination: page.pagination, explanation: deterministicExplanation(page.items) };
}
export async function overview(store: StateStore, engine: SecurityEngine, now: number): Promise<OverviewResponse> {
  const bucketMs = 60_000;
  const end = Math.floor(now / bucketMs) * bucketMs + bucketMs;
  const start = end - 15 * bucketMs;
  const buckets = Array.from({ length: 15 }, (_, i) => ({
    start: new Date(start + i * bucketMs).toISOString(), end: new Date(start + (i + 1) * bucketMs).toISOString(), ...emptyCounts(),
  }));
  const totals = emptyCounts();
  for (const event of await store.periodEvents(start, now)) {
    increment(totals, event);
    increment(buckets[Math.floor((Date.parse(event.timestamp) - start) / bucketMs)]!, event);
  }
  const recentSessions = await store.recentSessionIds(start);
  // The serverless pool has one connection. Avoid queueing hundreds of simultaneous
  // queries (and exhausting connection wait timeouts) for the bounded session list.
  const sessions: SessionSummary[] = [];
  for (const id of recentSessions) {
    const summary = await sessionSummary(store, engine, id, now);
    if (summary) sessions.push(summary);
  }
  return { apiVersion: '1', generatedAt: new Date(now).toISOString(), protection: await engine.status(),
    period: { start: new Date(start).toISOString(), end: new Date(end).toISOString(), bucketMs },
    totals, buckets, sessions };
}
