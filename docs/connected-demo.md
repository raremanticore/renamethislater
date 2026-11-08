# Connected banking and security demo

The frontend from `origin/main` was merged into the isolated `test` branch. Its slate/violet design, navigation, card layout, and typography are preserved. The banking page and security dashboard now use the existing backend contract through a same-origin API proxy. No merge into `main`, remote push, PR, or deployment is included.

## Start both apps

Use Node 24.11+. Stop older frontend/backend processes on ports 3000 and 3001 first. From the **repository root**:

```powershell
npm ci
npm --prefix backend ci
npm run dev:all
```

Open **http://localhost:3000** for banking and **http://localhost:3000/security** for monitoring. Use `localhost` consistently rather than switching to `127.0.0.1`; browser cookies and the exact allowed origin are host-specific.

The launcher reads your existing ignored `backend/.env` in the backend process only. It preserves your Nessie mapping/key, OpenAI settings, demo admin key, and SQLite data. It sets backend `APP_ORIGIN=http://localhost:3000`, `HOST=127.0.0.1`, and `PORT=3001` for this process, and configures the frontend proxy. It does not edit `.env`, copy keys into the frontend, or expose provider URLs to the browser. No `NEXT_PUBLIC_` credentials are needed. Press Ctrl+C to stop both applications.

For different ports:

```powershell
$env:FRONTEND_PORT='3020'
$env:BACKEND_PORT='3021'
npm run dev:all
```

For separate terminals, run `npm start` from `backend/` with `APP_ORIGIN=http://localhost:3000` in its `.env`, and `npm run dev` from the repository root. The frontend's server-only `BACKEND_URL` defaults to `http://127.0.0.1:3001`; set it explicitly if the backend uses another port. Do not put keys into that URL. The backend remains development-only even though the frontend can be built with `npm run build`.

## Use the connected pages

1. On the banking page, choose Alice (or Bob if configured) and sign in. This is explicitly development-only demo authentication. Only server-mapped account aliases appear. The page restores a valid session on reload without silently creating a new session or resetting risk.
2. The account selector loads that account's balance and transaction feed. Income/expenses total the **loaded selected-account transactions for the current UTC month**. These are not guaranteed to be a complete bank ledger; Nessie currently includes deposits/withdrawals with their provider status in descriptions. The source label says `Nessie sandbox` or `Local fictional fixtures`. Empty/unmapped accounts and provider errors are shown explicitly; there is no fallback to fake live data.
3. `Refresh banking data` makes one account read and one transaction read. There is no automatic banking-data polling that would repeatedly call Nessie or add security risk. `Export CSV` calls the protected export route, handles enforcement errors before starting a download, and downloads only successful backend-generated CSV. Repeated exports contribute to the existing behavioral rules.
4. Open the security page in another tab and sign in with your **demo admin key**. Administrator and customer sessions use separate HttpOnly cookies, so the dashboard does not replace Alice's banking session. The two scoped sign-out actions revoke only their own session.
5. The dashboard polls overview/events and the selected session every five seconds. Event rows and the session dropdown select a timeline/risk/rules panel. Event pagination is 20 rows/page; session activity uses 100 rows/page. The cards count up to 100 recently active sessions from the overview list, current rule-triggered sessions in that list, and security-blocked requests over the last 15 minutes. They are not Nessie metrics or global lifetime totals.
6. The request chart uses all 15 minute buckets and separates allowed requests, ownership/auth denials, throttles, and security blocks. The risk display shows the raw internal score plus configured throttle/block thresholds, with a threshold-relative bar; it is not a percentage or AI probability.
7. `Analyze recent activity` is an explicit administrator action calling `/api/security/sessions/:id/analysis`. Model calls never occur automatically while polling or selecting sessions. The page displays `AI advisory` versus `Rule-based fallback`, the fallback reason, snapshot time, and supporting request IDs. Evidence links highlight matching timeline events. Use the latest timeline if viewing history; old evidence can leave the displayed page as new traffic arrives or retention/reset removes it. Actual rule enforcement remains displayed separately from advisory interpretation.
8. `Turn protection off/on` and `Reset demo activity` use the protected administrator endpoints. Reset clears security history/risk and enables protection; it preserves banking data and active sessions. Cross-account access remains denied with behavioral protection off.

The original inert `New request`/`New transfer` buttons became `Refresh banking data`/`Export CSV`, matching the backend's read-only banking scope. Existing bank styling was retained and a transaction table/sign-in form were added. The only navigation color adjustment makes the existing links readable against their dark background. No transfer or payment execution feature was added.

## Validation

```powershell
# From the repository root:
npm run typecheck
npm run lint
npm run build
npm run test:e2e

# Backend checks:
npm --prefix backend run typecheck
npm --prefix backend test
```

The browser checks start isolated local servers on ports **3018/3019**, use an in-memory SQLite database and test-only administrator key, and intentionally load no real `.env` file. `BANKING_PROVIDER=local` and empty OpenAI credentials ensure **zero Nessie or model calls**. They cover customer banking, CSV download, admin login, session coexistence/logout, advisory fallback, real throttle/block responses reaching the UI, protection-off ownership checks, reset, and cursor pagination. They do not exercise a real AI collector. Default browser channel is Chrome; use `PLAYWRIGHT_BROWSER_CHANNEL=msedge` if Edge is installed instead. Traces/screenshots stay in ignored `test-results/`.

Live Nessie and model connectivity were verified separately using the existing explicitly invoked smoke commands; browser regressions never repeat provider automation. Your existing `backend/.env` settings determine which providers the combined demo uses.

## Configuration changes

- `next.config.ts`: added `/api/:path*` rewrite to the server-only backend origin; retained her existing Next.js settings.
- Root `tsconfig.json`: excludes standalone backend/test-runner files; the frontend imports only type definitions from `backend/src/contracts.ts`. Backend type checks remain separate.
- Root `package.json`/lockfile: added the combined development launcher, type-check/browser-test commands, and Playwright as a development dependency. No production dependency was added.
- Root ESLint/ignore configuration: excludes backend and generated browser-test artifacts. Next.js automatically updates the existing `AGENTS.md` when running development mode with her `agentFeedback` setting; that generated change is retained.
- `backend/.env.example`: describes the frontend origin; existing real `.env` files are not rewritten.
- Backend auth/routes: added scoped administrator cookies, session restoration, and scoped logout. Existing banking/security response contracts and ownership enforcement remain intact; legacy admin sessions are still accepted.
