import type { AnalysisResponse, SessionResponse } from '@/backend/src/contracts';
import RiskScore from './RiskScore';
import ActivityTimeline from './ActivityTimeline';
import TriggeredRules from './TriggeredRules';
import AIExplanation from './AIExplanation';

export default function SessionDetails({ detail, selectedId, analysis, analysisBusy, onAnalyze, onOlder, onLatest, viewingHistory }: {
  detail: SessionResponse | null; selectedId: string; analysis: AnalysisResponse | null; analysisBusy: boolean;
  onAnalyze: () => void; onOlder: () => void; onLatest: () => void; viewingHistory: boolean;
}) {
  const blocked = detail?.timeline.find(event => event.decision === 'block');
  return <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg space-y-6">
    <div className="card-one">
      <h2 className="text-3xl font-medium text-slate-100">Session Details</h2>
      <p className="text-sm font-bold text-white mt-3 break-all">Session ID: {selectedId || 'Select a recorded session'}</p>
    </div>
    {!detail && <p className="text-sm text-slate-400">{selectedId ? 'Loading session activity…' : 'Banking requests will appear here once recorded.'}</p>}
    {detail && <>
      <div className="border-t border-slate-700 pt-6">
        <RiskScore score={detail.session.riskScore} protection={detail.protection} />
        <p className="mt-3 text-sm text-slate-400">Actual rule enforcement: <strong className="capitalize text-slate-100">{detail.session.decision}</strong></p>
        <p className="mt-1 text-xs text-slate-500">This behavioral decision does not grant access to another customer’s accounts.</p>
        {blocked && <p className="mt-3 text-sm text-rose-300">Most recent block on this page: {blocked.enforcement?.cause === 'score_threshold'
          ? `${blocked.enforcement.contributingRuleIds.join(' + ')} combined to score ${blocked.riskScore}; block threshold ${blocked.enforcement.threshold}.`
          : blocked.reasons.join('; ')}</p>}
      </div>
      <div className="border-t border-slate-700 pt-6">
        <ActivityTimeline events={detail.timeline} evidenceIds={analysis?.analysis.supportingRequestIds ?? []} />
        <div className="mt-4 flex gap-3 text-sm">
          {viewingHistory && <button onClick={onLatest} className="rounded-lg border border-slate-700 px-3 py-2 hover:bg-slate-800">Latest session activity</button>}
          <button onClick={onOlder} disabled={!detail.timelinePagination.hasMore} className="rounded-lg border border-slate-700 px-3 py-2 hover:bg-slate-800 disabled:opacity-40">Older session activity</button>
        </div>
      </div>
      <div className="border-t border-slate-700 pt-6"><TriggeredRules rules={detail.session.triggeredRules} /></div>
      <div className="border-t border-slate-700 pt-6"><AIExplanation result={analysis} summary={detail.explanation.text} busy={analysisBusy} onAnalyze={onAnalyze} /></div>
    </>}
  </div>;
}
