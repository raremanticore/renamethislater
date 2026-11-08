import type { RuleHit } from '@/backend/src/contracts';

export default function TriggeredRules({ rules }: { rules: RuleHit[] }) {
  return <div>
    <h3 className="mb-4 text-lg font-semibold text-slate-100">Triggered Rules</h3>
    <ul className="list-disc list-inside text-slate-200 marker:text-red-400 space-y-3 text-sm">
      {rules.map(rule => <li key={rule.id}><strong>{rule.id}</strong>: {rule.reason} <span className="text-slate-500">(score {rule.score})</span></li>)}
    </ul>
    {!rules.length && <p className="text-sm text-slate-500">No current behavioral rules triggered.</p>}
  </div>;
}
