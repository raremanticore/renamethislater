import type { SecurityEvent } from '@/backend/src/contracts';
import { timestamp } from '@/lib/api';

export default function ActivityTimeline({ events, evidenceIds }: { events: SecurityEvent[]; evidenceIds: string[] }) {
  return <div>
    <h3 className="mb-4 text-lg font-semibold text-slate-100">Activity Timeline</h3>
    <ol className="relative">
      {events.map(event => <li id={`event-${event.requestId}`} key={event.requestId} className={`relative flex gap-4 pb-8 last:pb-0 scroll-mt-6 ${evidenceIds.includes(event.requestId) ? 'rounded-lg ring-1 ring-violet-500' : ''}`}>
        <div className="relative flex w-8 flex-none flex-col items-center">
          <span className={`z-10 flex h-8 w-8 items-center justify-center rounded-full text-white ring-4 ring-slate-900 ${event.decision === 'block' ? 'bg-rose-500' : event.decision === 'allow' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          <span className="absolute top-8 bottom-0 w-px bg-slate-700" />
        </div>
        <div className="flex-1 min-w-0 pt-1">
          <p className="text-sm font-medium text-slate-100">{event.action} · {event.decision}</p>
          <time dateTime={event.timestamp} className="text-xs text-slate-400">{timestamp(event.timestamp)}</time>
          <p className="mt-2 text-sm text-slate-400">{event.reasons.join('; ')}</p>
          <p className="mt-1 break-all text-xs text-slate-500">Request {event.requestId} · Score {event.riskScore} · Authorization {event.authorization}</p>
        </div>
      </li>)}
    </ol>
    {!events.length && <p className="text-sm text-slate-500">No retained events for this session.</p>}
  </div>;
}
