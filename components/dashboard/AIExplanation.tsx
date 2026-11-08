import type { AnalysisResponse } from '@/backend/src/contracts';
import { timestamp } from '@/lib/api';

export default function AIExplanation({ result, summary, busy, onAnalyze }: { result: AnalysisResponse | null; summary: string; busy: boolean; onAnalyze: () => void }) {
  return <div>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="text-lg font-semibold text-slate-100 tracking-tight">AI Explanation</h3>
      <button disabled={busy} onClick={onAnalyze} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-40">{busy ? 'Analyzing…' : 'Analyze recent activity'}</button>
    </div>
    <p className="mt-2 text-xs text-slate-500">Advisory only. Each explicit analysis may use API credits; dashboard refreshes do not call the model.</p>
    {result ? <div className="mt-4 space-y-3">
      <p className="text-sm font-medium text-violet-300">{result.analysis.source === 'model' ? 'AI advisory' : 'Rule-based fallback'} · <span className="capitalize">{result.analysis.assessment}</span></p>
      <p className="text-sm font-normal text-slate-400 leading-relaxed">{result.analysis.explanation}</p>
      {result.analysis.fallbackReason && <p className="text-xs text-amber-300">Fallback reason: {result.analysis.fallbackReason}</p>}
      <p className="text-xs text-slate-500">Snapshot {timestamp(result.generatedAt)} · {result.sample.eventCount} sampled events · Rule decision at analysis: {result.enforcement.currentDecision}</p>
      {!!result.analysis.supportingRequestIds.length && <div><p className="mb-2 text-xs text-slate-400">Supporting request IDs (highlighted in the timeline; use latest activity if viewing history):</p>
        <ul className="space-y-2 text-xs">{result.analysis.supportingRequestIds.map(id => <li key={id}><a href={`#event-${id}`} className="break-all text-violet-400 underline underline-offset-4">{id}</a></li>)}</ul>
      </div>}
    </div> : <div className="mt-4"><p className="mb-2 text-xs text-slate-500">Deterministic activity summary</p><p className="text-sm font-normal text-slate-400 leading-relaxed">{summary}</p></div>}
  </div>;
}
