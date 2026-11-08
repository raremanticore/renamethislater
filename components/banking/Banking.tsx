
"use client";

import { useState } from "react";
import Link from "next/link";

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

  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100">

      {/* Page Header */}
      <header className="border-b border-slate-800 bg-slate-900">
        <div className="mx-auto max-w-7xl px-4 lg:px-8">

          <div className="flex items-center justify-between py-4">

            {/* Logo */}
            <Link
              href="/"
              className="text-xl font-bold tracking-wide text-white"
            >
              Tail<span className="font-normal text-violet-400">Bank</span>
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
                  className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
                >
                  John Doe
                </button>

                {userDropdownOpen && (
                  <div className="absolute right-0 z-20 mt-2 w-48 rounded-lg border border-slate-700 bg-slate-800 p-2 shadow-xl">

                    <button className="w-full rounded-md px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-700">
                      Account
                    </button>

                    <button className="w-full rounded-md px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-700">
                      Settings
                    </button>

                    <button className="w-full rounded-md px-3 py-2 text-left text-sm text-red-400 hover:bg-slate-700">
                      Sign out
                    </button>

                  </div>
                )}

              </div>

              {/* Mobile Navigation Toggle */}
              <button
                onClick={() => setMobileNavOpen(!mobileNavOpen)}
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

            <button className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500">
              New request
            </button>

            <button className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500">
              New transfer
            </button>

          </div>
        </div>

        <hr className="my-8 border-slate-800" />

        {/* Banking Statistics */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">

          {/* Total Balance */}
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-lg">
            <p className="text-2xl font-bold text-white">$112,768</p>
            <p className="mt-1 text-sm text-slate-400">Total Balance</p>
            <p className="mt-4 border-t border-slate-800 pt-3 text-xs text-slate-500">
              From all accounts
            </p>
          </div>

          {/* Income */}
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-lg">
            <p className="text-2xl font-bold text-emerald-400">$6,840</p>
            <p className="mt-1 text-sm text-slate-400">Income</p>
            <p className="mt-4 border-t border-slate-800 pt-3 text-xs text-slate-500">
              This month
            </p>
          </div>

          {/* Expenses */}
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-lg">
            <p className="text-2xl font-bold text-rose-400">$4,725</p>
            <p className="mt-1 text-sm text-slate-400">Expenses</p>
            <p className="mt-4 border-t border-slate-800 pt-3 text-xs text-slate-500">
              This month
            </p>
          </div>

        </div>

        {/* Credit Cards */}
        {/* Add your original credit card JSX here */}

      </main>
    </div>
  );
}
