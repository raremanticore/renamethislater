import type { ProtectionStatus } from '@/backend/src/contracts';

export default function RiskScore({ score, protection }: { score: number; protection: ProtectionStatus }) {
  return <div>
    <h3 className="text-lg font-semibold text-slate-200 mb-4">Risk Score</h3>
    <span className={`text-4xl font-bold ${score >= protection.blockScore ? 'text-red-400' : score >= protection.throttleScore ? 'text-orange-400' : 'text-emerald-400'}`}>{score}</span>
    <span className="text-sm text-slate-400 ml-2">internal rule score</span>
    <progress aria-label="Risk relative to the block threshold" value={Math.min(score, protection.blockScore)} max={protection.blockScore} className="w-full h-3 mt-4 rounded-full overflow-hidden accent-red-500" />
    <p className="mt-2 text-xs text-slate-500">Throttle at {protection.throttleScore} · Block at {protection.blockScore} · Scores can exceed the block threshold; they are not probabilities.</p>
    {!protection.enabled && <p className="mt-2 text-sm text-amber-300">Behavioral protection is off. Authentication and ownership remain enforced.</p>}
  </div>;
}
