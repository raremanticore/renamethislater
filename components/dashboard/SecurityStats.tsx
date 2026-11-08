import type { OverviewResponse } from '@/backend/src/contracts';

export default function SecurityStats({ overview }: { overview: OverviewResponse | null }) {
  const stats = [
    { label: 'Recent Sessions', value: overview?.sessions.length, note: 'Up to 100 sessions active in the last 15 minutes' },
    { label: 'Flagged Sessions', value: overview?.sessions.filter(session => session.triggeredRules.length > 0).length, note: 'Recent sessions with current behavioral signals' },
    { label: 'Blocked Requests', value: overview?.totals.block, note: 'Security blocks in the last 15 minutes' },
  ];
  return <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
    {stats.map(stat => <div key={stat.label} className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg">
      <h2 className="text-sm font-medium text-slate-400">{stat.label}</h2>
      <p className="text-3xl font-bold text-white mt-3">{stat.value ?? '—'}</p>
      <p className="mt-3 text-xs text-slate-500">{stat.note}</p>
    </div>)}
  </div>;
}
