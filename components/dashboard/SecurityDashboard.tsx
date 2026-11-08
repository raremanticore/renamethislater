"use client";

import { useEffect, useRef, useState } from 'react';
import type { AnalysisResponse, DemoSessionResponse, EventsResponse, OverviewResponse, SessionResponse } from '@/backend/src/contracts';
import DemoLogin from '@/components/DemoLogin';
import { api, ApiError, errorMessage, post } from '@/lib/api';
import SecurityStats from './SecurityStats';
import LiveActivityTable from './LiveActivityTable';
import SessionDetails from './SessionDetails';
import RequestChart from './RequestChart';
import DemoControls from './DemoControls';

export default function SecurityDashboard() {
  const [admin, setAdmin] = useState<DemoSessionResponse | null>();
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [events, setEvents] = useState<EventsResponse | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState<SessionResponse | null>(null);
  const [eventCursor, setEventCursor] = useState<string | null>(null);
  const [timelineCursor, setTimelineCursor] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState('');
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const analysisRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api<DemoSessionResponse>('/api/demo/admin-session', { signal: controller.signal }).then(setAdmin).catch(error => {
      if (controller.signal.aborted) return;
      setAdmin(null);
      if (!(error instanceof ApiError && [401, 403].includes(error.status))) setError(errorMessage(error));
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!admin) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const [summary, page] = await Promise.all([
          api<OverviewResponse>('/api/security/overview', { signal: controller.signal }),
          api<EventsResponse>(`/api/security/events?limit=20${eventCursor ? `&cursor=${eventCursor}` : ''}`, { signal: controller.signal }),
        ]);
        if (controller.signal.aborted) return;
        setOverview(summary); setEvents(page); setError('');
        setSelectedId(current => current || summary.sessions[0]?.sessionId || page.items.find(item => item.sessionId)?.sessionId || '');
      } catch (error) {
        if (controller.signal.aborted) return;
        setError(errorMessage(error));
        if (error instanceof ApiError && [401, 403].includes(error.status)) {
          setAdmin(null); setOverview(null); setEvents(null); setDetail(null); setAnalysis(null);
        }
      } finally { if (!controller.signal.aborted) timer = setTimeout(load, 5000); }
    }
    void load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [admin, eventCursor, refresh]);

  useEffect(() => {
    if (!admin || !selectedId) return;
    const controller = new AbortController();
    api<SessionResponse>(`/api/security/sessions/${encodeURIComponent(selectedId)}?limit=100${timelineCursor ? `&cursor=${timelineCursor}` : ''}`, { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setDetail(result); })
      .catch(error => { if (!controller.signal.aborted) { setDetail(null); setError(errorMessage(error)); } });
    return () => controller.abort();
  }, [admin, selectedId, timelineCursor, overview?.generatedAt, refresh]);

  useEffect(() => () => analysisRequest.current?.abort(), []);
  function selectSession(id: string) {
    if (id === selectedId) return;
    analysisRequest.current?.abort(); setAnalysisBusy(false); setAnalysis(null);
    setSelectedId(id); setDetail(null); setTimelineCursor(null);
  }
  function resetView() {
    analysisRequest.current?.abort(); setAnalysisBusy(false); setAnalysis(null); setSelectedId('');
    setDetail(null); setOverview(null); setEvents(null); setEventCursor(null); setTimelineCursor(null);
    setRefresh(value => value + 1);
  }
  async function signOut() {
    try { await post('/api/demo/logout', { scope: 'admin' }); setAdmin(null); resetView(); }
    catch (error) { setError(errorMessage(error)); }
  }
  async function analyze() {
    if (!selectedId || analysisBusy) return;
    const controller = new AbortController(); analysisRequest.current = controller;
    setAnalysisBusy(true); setError('');
    try {
      const result = await post<AnalysisResponse>(`/api/security/sessions/${encodeURIComponent(selectedId)}/analysis`, {}, controller.signal);
      if (!controller.signal.aborted) { setAnalysis(result); setTimelineCursor(null); setRefresh(value => value + 1); }
    } catch (error) { if (!controller.signal.aborted) setError(errorMessage(error)); }
    finally { if (!controller.signal.aborted) setAnalysisBusy(false); }
  }
  const visibleDetail = detail?.session.sessionId === selectedId ? detail : null;
  const visibleAnalysis = analysis?.sessionId === selectedId ? analysis : null;
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold text-white">Security Dashboard</h1>
        {admin && <button onClick={signOut} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">Sign out administrator</button>}
      </div>
      {error && <p role="alert" className="mb-6 rounded-lg border border-rose-900 bg-rose-950/40 p-4 text-sm text-rose-300">{error}</p>}
      {admin === undefined && <p role="status" className="text-slate-400">Checking administrator session…</p>}
      {admin === null && <DemoLogin scope="admin" onLogin={current => { setAdmin(current); setError(''); }} />}
      {admin && <div className="flex flex-col gap-8">
        <DemoControls protection={overview?.protection ?? null} disabled={analysisBusy} onChanged={() => setRefresh(value => value + 1)} onReset={resetView} />
        <SecurityStats overview={overview} />
        <RequestChart buckets={overview?.buckets ?? []} />
        <LiveActivityTable page={events} selectedId={selectedId} onSelect={selectSession} onOlder={() => setEventCursor(events?.pagination.nextCursor ?? null)} onLatest={() => setEventCursor(null)} viewingHistory={!!eventCursor} />
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400">
          <label htmlFor="security-session">Security session</label>
          <select id="security-session" value={selectedId} onChange={event => selectSession(event.target.value)} className="max-w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200">
            {!selectedId && <option value="">No recorded sessions</option>}
            {selectedId && !overview?.sessions.some(session => session.sessionId === selectedId) && <option value={selectedId}>{selectedId}</option>}
            {overview?.sessions.map(session => <option key={session.sessionId} value={session.sessionId}>{session.sessionId}</option>)}
          </select>
          <p>Updates every 5 seconds · Latest 15 minutes</p>
        </div>
        <SessionDetails detail={visibleDetail} selectedId={selectedId} analysis={visibleAnalysis} analysisBusy={analysisBusy} onAnalyze={analyze}
          onOlder={() => setTimelineCursor(visibleDetail?.timelinePagination.nextCursor ?? null)} onLatest={() => setTimelineCursor(null)} viewingHistory={!!timelineCursor} />
      </div>}
    </div>
  );
}
