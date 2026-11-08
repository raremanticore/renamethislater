import type { Decision, EventsResponse } from '@/backend/src/contracts';
import { timestamp } from '@/lib/api';

const labels: Record<Decision, string> = { allow: 'Allowed', deny: 'Denied', throttle: 'Throttled', block: 'Blocked' };
const colors: Record<Decision, string> = { allow: 'text-emerald-400', deny: 'text-amber-300', throttle: 'text-orange-400', block: 'text-rose-400' };
export default function LiveActivityTable({ page, selectedId, onSelect, onOlder, onLatest, viewingHistory }: {
  page: EventsResponse | null; selectedId: string; onSelect: (id: string) => void; onOlder: () => void; onLatest: () => void; viewingHistory: boolean;
}) {
  return <div className="relative flex flex-col w-full h-full overflow-auto text-slate-200 bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg">
    <h2 className="mb-4 text-lg font-semibold">Live Activity</h2>
    <table className="w-full text-left table-auto min-w-max">
      <thead><tr>{['Time', 'Session ID', 'Action', 'Status', 'Reason'].map(label => <th key={label} className="p-4 border-b border-slate-700 bg-slate-800 text-slate-300 text-sm font-semibold">{label}</th>)}</tr></thead>
      <tbody>{page?.items.map(event => <tr key={event.requestId} className={`hover:bg-slate-800 transition-colors ${selectedId === event.sessionId ? 'bg-slate-800/50' : ''}`}>
        <td className="p-4 border-b border-slate-800 text-slate-400 text-sm">{timestamp(event.timestamp)}</td>
        <td className="p-4 border-b border-slate-800 text-sm">{event.sessionId ? <button title={event.sessionId} onClick={() => onSelect(event.sessionId!)} className="text-violet-400 underline underline-offset-4">{event.sessionId}</button> : 'No authenticated session'}</td>
        <td className="p-4 border-b border-slate-800 text-sm">{event.action}</td>
        <td className={`p-4 border-b border-slate-800 text-sm font-medium ${colors[event.decision]}`}>{labels[event.decision]}</td>
        <td className="max-w-lg whitespace-normal p-4 border-b border-slate-800 text-slate-400 text-sm">{event.reasons.join('; ')}<span className="mt-1 block text-xs text-slate-500">Request {event.requestId}</span></td>
      </tr>)}</tbody>
    </table>
    {!page?.items.length && <p className="p-6 text-sm text-slate-500">{page ? 'No banking events recorded. Use the banking page to generate activity.' : 'Loading activity…'}</p>}
    <div className="mt-4 flex gap-3 text-sm">
      {viewingHistory && <button onClick={onLatest} className="rounded-lg border border-slate-700 px-3 py-2 hover:bg-slate-800">Latest events</button>}
      <button onClick={onOlder} disabled={!page?.pagination.hasMore} className="rounded-lg border border-slate-700 px-3 py-2 hover:bg-slate-800 disabled:opacity-40">Older events</button>
    </div>
  </div>;
}
