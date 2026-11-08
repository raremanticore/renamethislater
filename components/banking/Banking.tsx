
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import DemoLogin from '@/components/DemoLogin';
import { api, ApiError, downloadCsv, errorMessage, money, post, timestamp } from '@/lib/api';
import type { Account, DemoSessionResponse, Transaction } from '@/backend/src/contracts';
import Image from "next/image";

/**
 * Banking Dashboard
 * Original template: TailBank
 * Creator: John Champ / Pixelcave
 * Source: https://taildashboards.com/get/tailbank/
 * Adapted for Next.js, React and Tailwind CSS.
 */

export default function BankingDashboard() {
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [session, setSession] = useState<DemoSessionResponse | null>();
  const [selectedAccount, setSelectedAccount] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [actionError, setActionError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [resource, setResource] = useState<{ key: string; account: Account | null; transactions: Transaction[]; month: string; error: string } | null>(null);
  const key = `${session?.sessionId}:${selectedAccount}:${refresh}`;
  const data = resource?.key === key ? resource : null;
  const loading = !!session && !!selectedAccount && !data;
  const month = data?.month ?? '';
  const monthly = data?.transactions.filter(tx => tx.postedAt.slice(0, 7) === month) ?? [];
  const income = monthly.reduce((sum, tx) => sum + Math.max(0, tx.amountCents), 0);
  const expenses = monthly.reduce((sum, tx) => sum + Math.max(0, -tx.amountCents), 0);

  useEffect(() => {
    const controller = new AbortController();
    api<DemoSessionResponse>('/api/demo/session', { signal: controller.signal }).then(current => {
      setSession(current); setSelectedAccount(current.accountIds[0] ?? '');
    }).catch(error => {
      if (controller.signal.aborted) return;
      setSession(null);
      if (!(error instanceof ApiError && error.status === 401)) setActionError(errorMessage(error));
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!session || !selectedAccount) return;
    const controller = new AbortController();
    const path = `/api/bank/accounts/${encodeURIComponent(selectedAccount)}`;
    Promise.all([
      api<{ account: Account }>(path, { signal: controller.signal }),
      api<{ transactions: Transaction[] }>(`${path}/transactions`, { signal: controller.signal }),
    ]).then(([account, feed]) => {
      if (!controller.signal.aborted) setResource({ key, account: account.account, transactions: feed.transactions, month: new Date().toISOString().slice(0, 7), error: '' });
    }).catch(error => {
      if (controller.signal.aborted) return;
      setResource({ key, account: null, transactions: [], month: '', error: errorMessage(error) });
      if (error instanceof ApiError && error.status === 401) setSession(null);
    });
    return () => controller.abort();
  }, [key, selectedAccount, session]);

  function signedIn(current: DemoSessionResponse) {
    setSession(current); setSelectedAccount(current.accountIds[0] ?? ''); setActionError(''); setResource(null);
  }
  async function signOut() {
    try {
      await post('/api/demo/logout', { scope: 'customer' });
      setSession(null); setSelectedAccount(''); setResource(null); setActionError(''); setUserDropdownOpen(false);
    } catch (error) { setActionError(errorMessage(error)); }
  }
  async function exportTransactions() {
    setDownloading(true); setActionError('');
    try { await downloadCsv(selectedAccount); }
    catch (error) { setActionError(errorMessage(error)); }
    finally { setDownloading(false); }
  }

  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100">

      {/* Page Header */}
      <header className="border-b border-slate-800 bg-slate-900">
        <div className="mx-auto max-w-7xl px-4 lg:px-8">

          <div className="flex items-center justify-between py-4">

                {/* Logo and Brand Name */}
            <Link href="/" className="flex items-center gap-3">

              <div>
              <Image className="self-auto"
                src="/ghostone.svg"
                alt="Ghost Logo"
                width={40}
                height={40}
               />
            </div>


              <span className="text-xl font-mono tracking-wide text-white">
                veyl
              </span>

            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden items-center gap-3 lg:flex">

              <Link
                href="/"
                className="rounded-lg bg-violet-500/10 px-4 py-2 text-sm font-medium text-violet-400"
              >
                Banking
              </Link>

              <Link
                href="/security"
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                Security Dashboard
              </Link>

            </nav>

            {/* Right Section */}
            <div className="flex items-center gap-3">

              {/* User Dropdown */}
              <div className="relative">

                <button
                  onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                  disabled={!session}
                  className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
                >
                  {session ? `${session.user.handle === 'alice' ? 'Alice' : 'Bob'} · demo` : 'Demo banking'}
                </button>

                {userDropdownOpen && (
                  <div className="absolute right-0 z-20 mt-2 w-48 rounded-lg border border-slate-700 bg-slate-800 p-2 shadow-xl">

                    <button onClick={() => document.getElementById('transactions')?.scrollIntoView({ behavior: 'smooth' })} className="w-full rounded-md px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-700">
                      View transactions
                    </button>

                    <button onClick={signOut} className="w-full rounded-md px-3 py-2 text-left text-sm text-red-400 hover:bg-slate-700">
                      Sign out
                    </button>

                  </div>
                )}

              </div>

              {/* Mobile Navigation Toggle */}
              <button
                onClick={() => setMobileNavOpen(!mobileNavOpen)}
                aria-label="Toggle banking navigation"
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white hover:bg-slate-700 lg:hidden"
              >
                ☰
              </button>

            </div>
          </div>

          {/* Mobile Navigation */}
          {mobileNavOpen && (
            <nav className="flex flex-col gap-2 border-t border-slate-800 py-4 lg:hidden">

              <Link
                href="/"
                className="rounded-lg px-3 py-2 text-violet-400 hover:bg-slate-800"
              >
                Banking
              </Link>

              <Link
                href="/security"
                className="rounded-lg px-3 py-2 text-slate-300 hover:bg-slate-800"
              >
                Security Dashboard
              </Link>

            </nav>
          )}

        </div>
      </header>

      {/* Page Content */}
      <main className="mx-auto max-w-7xl px-4 py-8 lg:px-8">

        {/* Page Heading */}
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">

          <div>
            <h1 className="text-2xl font-bold text-white">
              Quick Overview
            </h1>

            <p className="mt-1 text-sm text-slate-400">
              Welcome to your personal e-banking dashboard.
            </p>
          </div>

          <div className="flex gap-3">

            <button disabled={!session || !selectedAccount || loading || downloading} onClick={() => { setActionError(''); setRefresh(value => value + 1); }} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50">
              Refresh banking data
            </button>

            <button disabled={!session || !selectedAccount || loading || downloading} onClick={exportTransactions} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50">
              {downloading ? 'Exporting…' : 'Export CSV'}
            </button>

          </div>
        </div>

        <hr className="my-8 border-slate-800" />

        {session === undefined && <p className="mb-6 text-sm text-slate-400">Checking your demo session…</p>}
        {session === null && <div className="mb-6"><DemoLogin scope="customer" onLogin={signedIn} /></div>}
        {session && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4 text-sm text-slate-300">
            <label className="flex items-center gap-3">Account
              <select aria-label="Bank account" value={selectedAccount} onChange={event => { setSelectedAccount(event.target.value); setActionError(''); }} className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white">
                {session.accountIds.map(id => <option key={id} value={id}>{id}</option>)}
              </select>
            </label>
            <p>{session.bankingSource === 'nessie' ? 'Nessie sandbox' : 'Local fictional fixtures'} · Development demo</p>
            <p className="w-full break-all text-xs text-slate-500">Session ID: {session.sessionId}</p>
            {!session.accountIds.length && <p className="w-full">No accounts are mapped to this demo customer. Choose another customer or configure the trusted backend mapping.</p>}
          </div>
        )}
        {(actionError || data?.error) && <p role="alert" className="mb-6 rounded-lg border border-rose-900 bg-rose-950/40 p-4 text-sm text-rose-300">{actionError || data?.error}</p>}
        {loading && <p role="status" className="mb-4 text-sm text-slate-400">Loading banking data…</p>}

        {/* Banking Statistics */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">

          {/* Total Balance */}
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-lg">
            <p className="text-2xl font-bold text-white">{data?.account ? money(data.account.balanceCents, data.account.currency) : '—'}</p>
            <p className="mt-1 text-sm text-slate-400">Account Balance</p>
            <p className="mt-4 border-t border-slate-800 pt-3 text-xs text-slate-500">
              {data?.account?.name ?? 'Selected account'}
            </p>
          </div>

          {/* Income */}
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-lg">
            <p className="text-2xl font-bold text-emerald-400">{data?.account ? money(income, data.account.currency) : '—'}</p>
            <p className="mt-1 text-sm text-slate-400">Income</p>
            <p className="mt-4 border-t border-slate-800 pt-3 text-xs text-slate-500">
              This month · loaded transactions
            </p>
          </div>

          {/* Expenses */}
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-lg">
            <p className="text-2xl font-bold text-rose-400">{data?.account ? money(expenses, data.account.currency) : '—'}</p>
            <p className="mt-1 text-sm text-slate-400">Expenses</p>
            <p className="mt-4 border-t border-slate-800 pt-3 text-xs text-slate-500">
              This month · loaded transactions
            </p>
          </div>

        </div>

        <section id="transactions" className="mt-8 overflow-auto rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-lg">
          <h2 className="text-lg font-semibold text-slate-100">Transactions</h2>
          <p className="mt-1 text-sm text-slate-400">{data?.transactions.length ?? 0} records · Selected account · Amounts in USD</p>
          <table className="mt-4 w-full min-w-max text-left text-sm">
            <thead><tr className="border-b border-slate-700 text-slate-400"><th className="p-3">Date</th><th className="p-3">Description</th><th className="p-3 text-right">Amount</th></tr></thead>
            <tbody>
              {data?.transactions.slice().reverse().map(tx => <tr key={tx.id} className="border-b border-slate-800 hover:bg-slate-800">
                <td className="p-3 text-slate-400">{timestamp(tx.postedAt)}</td><td className="max-w-xl whitespace-normal p-3 text-slate-200">{tx.description}</td>
                <td className={`p-3 text-right ${tx.amountCents >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{money(tx.amountCents, data.account?.currency)}</td>
              </tr>)}
              {!data?.transactions.length && <tr><td colSpan={3} className="p-6 text-slate-500">{session ? 'No transaction records loaded.' : 'Sign in to view your account transactions.'}</td></tr>}
            </tbody>
          </table>
        </section>

      </main>
    </div>
  );
}
