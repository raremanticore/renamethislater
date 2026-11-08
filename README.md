# Veyl

Veyl is a hackathon banking demo that detects and limits suspicious collection of banking data **after login**. It includes a mock banking website, a security dashboard, server-side behavioral rules, and an optional AI security analyst.

Built with Next.js, Node.js, TypeScript, and Tailwind CSS, Veyl can optionally use Capital One's Nessie sandbox for simulated accounts, balances, and transactions.

**Run the demo locally using the instructions below.** No deployment, Supabase project, Nessie account, or OpenAI key is needed for the default setup.

## Requirements

- **Node.js 24.11 or newer within the 24.x release line**, including npm. Check with `node --version` and `npm --version`.
- **Git** to clone the repository.
- A browser. Chrome or Edge is also needed for the optional browser tests.

The commands below use **Windows PowerShell**. Run commands from the repository root unless a section says otherwise.

## 1. Clone and install

```powershell
git clone https://github.com/raremanticore/veyl-crownhacks2026.git
cd veyl-crownhacks2026
npm ci
npm --prefix backend ci
```

Both installs are required: the frontend and backend have separate dependency files.

If you already cloned the repository, use your existing folder. Save your work before pulling newer changes.

## 2. Configure the local demo

Create the backend environment file without overwriting an existing one:

```powershell
if (!(Test-Path backend/.env)) { Copy-Item backend/.env.example backend/.env }
```

On macOS/Linux, the equivalent is `cp -n backend/.env.example backend/.env`.

Generate a demo administrator secret:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Open **`backend/.env`** in your editor and paste the generated value into `DEMO_ADMIN_KEY`. Keep these settings for a fully local demo:

```dotenv
DEMO_MODE=true
HOSTED_DEMO_MODE=false
DATABASE_URL=
DATABASE_PATH=./data/demo.sqlite
APP_ORIGIN=http://localhost:3000
DEMO_ADMIN_KEY=PASTE_YOUR_GENERATED_SECRET_HERE
BANKING_PROVIDER=local
NESSIE_ACCOUNT_MAP='{}'
OPENAI_API_KEY=
OPENAI_EXPLANATION_MODEL=
```

Leave the template's other settings at their defaults. Replace the admin placeholder with the generated secret, which must be at least 24 characters. You create this secret yourself; it is not a Nessie or OpenAI credential.

- **Blank `DATABASE_URL` selects local SQLite.** The database is created automatically.
- `BANKING_PROVIDER=local` selects fictional accounts and transactions.
- Empty OpenAI settings select the labeled deterministic explanation fallback.
- Keep credentials in the ignored `backend/.env`, never in frontend code or `NEXT_PUBLIC_` variables.
- If reusing an environment file from hosting, explicitly set `HOSTED_DEMO_MODE=false` and clear `DATABASE_URL` for this local setup.

## 3. Seed and start

```powershell
npm --prefix backend run seed
npm run dev:all
```

Keep this terminal open. The second command starts **both** the frontend and backend; do not start a duplicate backend in another terminal.

| Address | Purpose |
| --- | --- |
| [http://localhost:3000](http://localhost:3000) | Mock banking website |
| [http://localhost:3000/security](http://localhost:3000/security) | Security dashboard |
| [http://localhost:3000/api/health](http://localhost:3000/api/health) | Backend health through the frontend proxy |
| [http://127.0.0.1:3001/api/health](http://127.0.0.1:3001/api/health) | Direct backend health |

Use **localhost:3000** consistently for the UI so cookies and origin checks match. Backend port 3001 serves the API, not the website; opening its root can return `route_not_found`.

The launcher reads `backend/.env` and sets the matching frontend proxy and backend origin automatically. Local startup also seeds missing fixtures idempotently. The default fixtures contain Alice, Bob, an administrator, three accounts, and nine fictional transactions.

Press **Ctrl+C** to stop both apps. On later runs, just run `npm run dev:all`; reinstall only when dependencies change. Root `npm run dev` alone starts only the frontend.

## 4. Try the demo

1. Open the banking website, choose **Alice**, and sign in. Browse an owned account and its transactions.
2. Download **one CSV export**. Ordinary browsing and one export should remain allowed.
3. In another tab, open `/security`. Sign in with the `DEMO_ADMIN_KEY` from your environment file. Customer and administrator sessions are separate, so both tabs can stay signed in.
4. Confirm banking requests appear in the dashboard. It refreshes about every five seconds. Select the matching session to inspect its timeline, rule hits, and internal risk score.
5. To demonstrate enforcement, make **six total export attempts within five minutes** in the same customer session. With default settings, later attempts throttle (429) and then block (403). Leave a short pause between attempts to isolate export behavior from burst detection.
6. Select that session in the dashboard and click **Analyze recent activity**. Without an OpenAI key/model it shows a rule-based fallback; with them, it requests an advisory AI assessment.
7. Use **Reset demo activity** to clear events and risk and re-enable protection. This preserves active sessions and banking data.

Behavioral protection can be turned off by the demo administrator, but **authentication and account ownership remain enforced**. Risk normally expires after the five-minute sliding window.

The score is an internal rule score, not a probability or proof that a visitor is an AI agent. Previously downloaded or displayed data cannot be taken back by a later block.

### Bounded scripted automation

With the app running in local-fixture mode, open a second terminal at the repository root:

```powershell
npm --prefix backend run demo
```

This creates separate demo sessions and demonstrates normal reads, a request burst, and unauthorized account attempts. Select its recent sessions in the dashboard to inspect results.

This is **scripted automation, not a real AI attacker/agent test**. It is restricted to the local application, at most 30 requests and 20 seconds, and refuses Nessie-backed data. Reset demo activity before a repeat demonstration.

## Optional: use your Nessie sandbox

The default fixtures work without Nessie. To show your own existing sandbox data, change these values in `backend/.env`:

```dotenv
BANKING_PROVIDER=nessie
NESSIE_API_KEY=YOUR_NESSIE_KEY
NESSIE_API_BASE_URL=https://prod-api.nessieisreal.com
NESSIE_ACCOUNT_MAP='{"user-alice":{"acc-alice-checking":"YOUR_NESSIE_ACCOUNT_ID"}}'
```

Use the sandbox **bank account's `_id`**, not the customer ID. This trusted server mapping determines which accounts Alice can access. Add Bob's accounts under `user-bob` if needed; an unmapped user has no Nessie accounts.

Keep `DATABASE_URL=` blank and `HOSTED_DEMO_MODE=false` to continue storing sessions and security events locally. Restart `npm run dev:all` after changing environment settings.

For one explicitly invoked live check:

```powershell
npm --prefix backend run nessie:smoke -- --live --user alice --account acc-alice-checking
```

This reads one mapped account and its deposit/withdrawal feeds, at most three upstream GETs. It performs no writes. Existing sandbox transactions do not need to be reseeded on each device. Nessie failures are reported; the backend never silently substitutes fictional data.

For optional sandbox provisioning and supported transaction formats, see [the backend API guide](docs/backend-api.md). Use local fixtures for repeated automation.

## Optional: enable the AI analyst

Add your server-side credentials to `backend/.env`, then restart the app:

```dotenv
OPENAI_API_KEY=YOUR_OPENAI_API_KEY
OPENAI_EXPLANATION_MODEL=YOUR_AVAILABLE_MODEL_ID
```

Use a model available to your API project that supports Responses and structured outputs. Analysis is requested only by the administrator's **Analyze recent activity** action; dashboard polling does not invoke the model. Live analysis uses API credits.

The model receives bounded activity metadata, not account balances, transaction contents, or credentials. It cannot authorize requests, unblock sessions, or delay rule enforcement. Failures retain the deterministic fallback.

## Seed and reset commands

From the repository root:

```powershell
npm --prefix backend run seed
npm --prefix backend run reset
```

- **Seed:** inserts missing fictional fixtures without duplicating them.
- **CLI reset:** clears all demo sessions, events, and risk, enables protection, and seeds missing fixtures. Stop the app first; sign in again afterward.
- **Dashboard reset:** clears events/risk and enables protection while keeping sessions.
- Neither reset command changes Nessie data.

If `DATABASE_URL` is set, these commands use **that Postgres database**, not local SQLite. For an entirely local rehearsal, keep it blank. SQLite history is per device and is not shared merely by sharing Nessie credentials.

## Checks and builds

```powershell
npm --prefix backend test
npm run typecheck
npm run lint
npm run build:all
```

`build:all` builds the Next.js frontend and checks the backend from one command. It does not start the demo; use `npm run dev:all` for that.

Optional browser regression tests:

```powershell
npm run test:e2e
```

Close existing Next.js dev servers before browser tests to avoid a shared development lock. Tests start their own local servers on ports 3018/3019. Chrome is the default; to use installed Edge:

```powershell
$env:PLAYWRIGHT_BROWSER_CHANNEL='msedge'
npm run test:e2e
```

Backend tests use temporary SQLite or embedded PostgreSQL. Browser tests force local fixtures and disable live provider credentials. Tests do not call Supabase, Nessie, or OpenAI.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Banking sign-in cannot reach the backend | Run `npm run dev:all` from the root, confirm both processes started, and check `/api/health`. |
| Demo mode or configuration error | Confirm the filename is `backend/.env`, not `.env.txt`. Use `DEMO_MODE=true`, `HOSTED_DEMO_MODE=false`, and blank `DATABASE_URL` for the default local setup. |
| Administrator login denied | Use the exact generated `DEMO_ADMIN_KEY`, at least 24 characters; restart after editing it. |
| `EADDRINUSE` / port already in use | Stop the old server with Ctrl+C in its terminal, or choose alternative ports below. |
| Requests return 429 or 403 after automation | Stop requests and let risk expire, or reset activity from the administrator dashboard. Ownership denials still apply after reset. |
| Nessie returns 502 | Check the API key, environment, and mapped account `_id`; see the API guide for detailed smoke diagnostics. |
| Analyst shows a deterministic fallback | Expected without valid OpenAI key/model settings; enforcement still works. |
| Income/expense cards show zero | They total loaded transactions for the current UTC month. Fixed-date fixtures may be from a different month. |
| SQLite prints an experimental warning | Expected with Node 24's built-in SQLite; this warning alone is not a startup failure. |

For alternative local ports:

```powershell
$env:FRONTEND_PORT='3020'
$env:BACKEND_PORT='3021'
npm run dev:all
```

Then use `http://localhost:3020` and `http://localhost:3020/security`. The launcher updates the proxy/origin automatically. If using alternative backend ports for the scripted demo, set `DEMO_BASE_URL=http://127.0.0.1:3021` in the second terminal before running it.

## Scope and documentation

Veyl demonstrates suspicious data-collection detection after fictional login. It does **not** detect fraudulent transactions, identify every AI agent, prevent all DDoS attacks, or provide production banking authentication. A real browser-driven attacker agent is not included.

- [Backend API, response contracts, and provider setup](docs/backend-api.md)
- [Example API responses](docs/backend-api.examples.json)
- [Connected frontend behavior and demo details](docs/connected-demo.md)
- [Optional hosted backend/Postgres setup](docs/vercel-backend.md) — not required for the local demo

The frontend uses Next.js/React; the backend uses TypeScript and Node's HTTP server, with SQLite locally or optional Postgres. Banking data is read-only through the protected API; CSV exports are generated by the backend.
