import { useState } from 'react';
import type { ProtectionStatus } from '@/backend/src/contracts';
import { errorMessage, post } from '@/lib/api';

export default function DemoControls({ protection, disabled, onChanged, onReset }: { protection: ProtectionStatus | null; disabled: boolean; onChanged: () => void; onReset: () => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function control(reset: boolean) {
    setBusy(true); setError('');
    try {
      await post(`/api/security/demo/${reset ? 'reset' : 'protection'}`, reset ? {} : { enabled: !protection?.enabled });
      if (reset) onReset(); else onChanged();
    } catch (error) { setError(errorMessage(error)); }
    finally { setBusy(false); }
  }
  return <section className="rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-lg">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div><h2 className="text-lg font-semibold text-slate-100">Demo controls</h2><p className="mt-1 text-sm text-slate-400">Behavioral protection: <span className={protection?.enabled ? 'text-emerald-400' : 'text-amber-300'}>{protection ? protection.enabled ? 'On' : 'Off' : 'Loading…'}</span></p></div>
      <div className="flex flex-wrap gap-3">
        <button disabled={!protection || busy || disabled} onClick={() => control(false)} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-40">{protection?.enabled ? 'Turn protection off' : 'Turn protection on'}</button>
        <button disabled={busy || disabled} onClick={() => control(true)} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-40">{busy ? 'Updating…' : 'Reset demo activity'}</button>
      </div>
    </div>
    <p className="mt-3 text-xs text-slate-500">Ownership checks stay on. Reset clears security activity and risk, preserves bank data, and enables protection.</p>
    {error && <p role="alert" className="mt-3 text-sm text-rose-400">{error}</p>}
  </section>;
}
