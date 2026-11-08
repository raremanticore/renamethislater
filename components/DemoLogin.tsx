"use client";

import { useState } from 'react';
import type { FormEvent } from 'react';
import type { DemoSessionResponse } from '@/backend/src/contracts';
import { errorMessage, post } from '@/lib/api';

export default function DemoLogin({ scope, onLogin }: { scope: 'customer' | 'admin'; onLogin: (session: DemoSessionResponse) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget; const values = new FormData(form);
    const data = scope === 'admin' ? { handle: 'admin', adminKey: String(values.get('adminKey') ?? '') }
      : { handle: String(values.get('handle') ?? 'alice') };
    if (scope === 'admin') form.reset(); // Credentials never enter persistent browser storage.
    setBusy(true); setError('');
    try { onLogin(await post<DemoSessionResponse>('/api/demo/session', data)); }
    catch (error) { setError(errorMessage(error)); }
    finally { setBusy(false); }
  }
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-lg">
      <h2 className="text-lg font-semibold text-slate-100">{scope === 'admin' ? 'Administrator sign in' : 'Development demo sign in'}</h2>
      <p className="mt-2 text-sm text-slate-400">{scope === 'admin' ? 'Enter the demo admin key configured on your backend. Customer sessions stay signed in separately.' : 'Choose a fictional customer to view their permitted sandbox accounts.'}</p>
      <form onSubmit={submit} className="mt-4 flex flex-wrap items-end gap-3">
        {scope === 'admin' ? (
          <label className="flex flex-col gap-2 text-sm text-slate-300">Demo admin key
            <input name="adminKey" type="password" required autoComplete="off" className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white" />
          </label>
        ) : (
          <label className="flex flex-col gap-2 text-sm text-slate-300">Demo customer
            <select name="handle" defaultValue="alice" className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white">
              <option value="alice">Alice</option><option value="bob">Bob</option>
            </select>
          </label>
        )}
        <button disabled={busy} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50">
          {busy ? 'Signing in…' : scope === 'admin' ? 'Sign in as administrator' : 'Sign in to banking'}
        </button>
      </form>
      {error && <p role="alert" className="mt-3 text-sm text-rose-400">{error}</p>}
    </section>
  );
}
