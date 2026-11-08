import type { TimeBucket } from '@/backend/src/contracts';

const series = [{ key: 'allow', label: 'Allowed', fill: '#34d399' }, { key: 'deny', label: 'Denied', fill: '#fcd34d' },
  { key: 'throttle', label: 'Throttled', fill: '#fb923c' }, { key: 'block', label: 'Blocked', fill: '#fb7185' }] as const;
export default function RequestChart({ buckets }: { buckets: TimeBucket[] }) {
  const max = Math.max(1, ...buckets.map(bucket => bucket.total));
  return <section className="rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-lg">
    <h2 className="text-lg font-semibold text-slate-100">Requests over time</h2>
    <p className="mt-1 text-xs text-slate-500">15 one-minute buckets · Counts of actual request decisions</p>
    <svg viewBox="0 0 600 160" role="img" aria-label="Request decisions over the last 15 minutes" className="mt-4 h-40 w-full">
      <line x1="0" y1="140" x2="600" y2="140" stroke="#334155" />
      {buckets.map((bucket, index) => {
        let bottom = 140;
        return <g key={bucket.start}><title>{`${new Date(bucket.start).toLocaleTimeString()}: ${bucket.total} requests`}</title>
          {series.map(item => {
            const height = bucket[item.key] / max * 120; bottom -= height;
            return <rect key={item.key} x={index * 40 + 6} y={bottom} width="28" height={height} fill={item.fill} />;
          })}
        </g>;
      })}
    </svg>
    <div className="flex flex-wrap gap-4 text-xs text-slate-400">{series.map(item => <span key={item.key} className="flex items-center gap-2"><span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: item.fill }} />{item.label}</span>)}</div>
  </section>;
}
