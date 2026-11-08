# Deploy the existing frontend and backend as two Vercel projects

The frontend stays at repository root; the backend project root is `backend`. Both use the same repository. The UI calls relative `/api/...` paths; Next.js proxies them to the backend's production origin via `BACKEND_URL`. No browser CORS client, second login flow, or UI redesign is needed. SQLite remains available offline; hosted instances require Supabase Postgres and never fall back to SQLite.

## 1. Initialize Supabase once

Use **Connect → Direct/Connection string → Transaction pooler**, port **6543**. Copy the supplied host and username; don't derive them from the project URL. Replace the password placeholder with a URL-encoded database password. Save as `DATABASE_URL` in ignored `backend/.env`:

```dotenv
DATABASE_URL=postgresql://postgres.YOUR_PROJECT:URL_ENCODED_PASSWORD@YOUR_POOLER_HOST:6543/postgres
```

From repository root:

```powershell
npm --prefix backend ci
npm --prefix backend run db:setup
```

This explicit command applies `backend/migrations/001_initial.sql` and seeds three fictional users, three fixture accounts, and nine fixture transactions idempotently. It does not change Nessie or call OpenAI. Re-running it preserves existing sessions, events, protection settings, and fixtures. It creates a private `veyl` schema with RLS and no browser policies. Leave that schema out of Supabase's exposed schemas. The backend connects using a trusted database owner connection; the public/publishable Supabase key is not used.

TLS verifies the database certificate and hostname. Supabase connections automatically trust the downloaded public `backend/prod-ca-2021.crt`; Vercel's function configuration explicitly packages this file. The certificate is public and can be committed; it contains no private key. Optional `DATABASE_CA_CERT` overrides it with PEM contents (literal `\n` accepted). When the CA expires or rotates, obtain its replacement from Supabase Database settings. Do not disable certificate verification. Connection errors are sanitized; check the supplied pooler URL, saved file, password encoding, TLS and permissions. PostgreSQL error `28P01` means the server rejected database credentials: use the database password and the exact pooler username, not a Supabase publishable/API key.

No SQLite history is automatically copied to Supabase. Nessie account ownership mapping stays server-side in `NESSIE_ACCOUNT_MAP`; the sandbox's existing transactions remain there.

## 2. Backend Vercel project

| Setting | Value |
| --- | --- |
| Repository | Your existing renamed repository |
| Root directory | `backend` |
| Framework preset | **Other** (the checked-in `framework: null` uses standard Node functions) |
| Node.js | **24.x** |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Output directory | `public` (set in `backend/vercel.json`) |

`backend/vercel.json` routes `/api/:path*` into the single Node function `api/index.ts`. Its static output directory is explicitly `public`, containing only a small backend landing page. This directory is tracked so the Other preset's static-output check succeeds; never set output to the backend source directory. Vercel compiles the TypeScript function; the build command checks backend TypeScript, including tests. No listener, local disk, seed, migration or provider call runs during the build. Vercel owns the HTTP listener.

`rewriteRelativeImportExtensions: true` in the backend TypeScript configuration changes relative `.ts` imports to `.js` in emitted code. This is required for Vercel's compiled ESM functions; local development still runs the original `.ts` files. `tsconfig.build.json` supports an isolated emit check, and the runtime regression test loads the emitted API and certificate without a database/model call. If runtime logs mention `ERR_MODULE_NOT_FOUND` for a `.ts` path, deploy the updated configuration rather than changing database credentials.

Add these variables in **this project's Vercel environment settings** (a local .env is not uploaded):

```dotenv
DEMO_MODE=true
HOSTED_DEMO_MODE=true
DATABASE_URL=YOUR_PRIVATE_TRANSACTION_POOLER_CONNECTION_STRING
APP_ORIGIN=https://YOUR_FRONTEND_PRODUCTION_DOMAIN
DEMO_ADMIN_KEY=YOUR_EXISTING_RANDOM_SECRET_AT_LEAST_24_CHARACTERS
BANKING_PROVIDER=nessie
NESSIE_API_KEY=YOUR_EXISTING_PRIVATE_KEY
NESSIE_API_BASE_URL=https://prod-api.nessieisreal.com
NESSIE_ACCOUNT_MAP={"user-alice":{"acc-alice-checking":"YOUR_OWN_SANDBOX_ACCOUNT_ID"}}
OPENAI_API_KEY=YOUR_EXISTING_PRIVATE_KEY
OPENAI_EXPLANATION_MODEL=YOUR_EXISTING_MODEL
```

Use the existing actual mapping/model, not the placeholders. In Vercel's UI paste raw JSON without surrounding single quotes. `APP_ORIGIN` is exactly the **frontend** origin, HTTPS, with no trailing slash or path. Keep the security threshold variables at defaults unless intentionally configuring the demo. Optional `DATABASE_CA_CERT` works as described above.

For an offline-source hosted rehearsal use `BANKING_PROVIDER=local`; state still lives in Postgres. OpenAI variables can be omitted for the labeled deterministic fallback. No `NEXT_PUBLIC_` secrets are needed.

After pushing the reviewed code, redeploy this project. Open its **production** URL at `/api/health`. Expect:

```json
{"status":"ok","developmentOnly":true,"bankingSource":"nessie"}
```

Health requires database connectivity. A 503 `backend_unavailable` means initialization/configuration, missing migration/seed, TLS, or connectivity failed. A later database failure fails closed with the existing sanitized 500 `internal_error` and no banking retrieval. No driver messages, passwords, or connection strings are returned or logged. A health response does not test Nessie credentials/provider availability.

## 3. Frontend Vercel project

Keep root `./`, Next.js preset, `npm ci`, `npm run build`, and default output directory. Set:

```dotenv
BACKEND_URL=https://YOUR_BACKEND_PRODUCTION_DOMAIN
```

Use just the origin, no `/api`, credentials, or query. Redeploy the frontend after changing this variable because rewrites are generated at build time. Do not set database/Nessie/OpenAI/admin secrets on the frontend project.

Use stable production domains for both projects. The backend production API must be reachable by the frontend proxy without a Vercel login screen; a protected preview URL is not interchangeable with it. Changing frontend domain requires updating backend `APP_ORIGIN` and redeploying. Browser cookies stay on the frontend origin, HttpOnly, Secure on HTTPS, and SameSite Strict. Direct cross-origin browser mutations remain rejected.

## 4. Verify after deployment

1. Frontend `/api/health` returns the same JSON as backend health.
2. Sign in as Alice on the banking page. Read her account/transactions and export once.
3. Open `/security` and sign in with the demo admin secret. Banking events should appear with the same session ID.
4. For repeated automation, use the local fixture tests below rather than loading Nessie. On the hosted demo, normal browsing plus one export is enough to check connectivity. Only explicitly request AI analysis when wanted; polling never calls the model.
5. A wrong-account request must remain 403 even when protection is disabled. Existing controls reset security state while preserving bank data and sessions.

This remains an explicitly labeled hackathon demo with selectable fictional users, not real customer authentication. No real banking payloads or provider secrets enter model prompts. Risk is an internal rule score; analyst advice cannot authorize/unblock or delay enforcement.

## Local development and checks

Keep `HOSTED_DEMO_MODE=false` locally and `APP_ORIGIN=http://localhost:3000`. With `DATABASE_URL` set, `npm start` in `backend` uses Postgres after `db:setup`; without it, the same command uses local SQLite. A supplied broken URL fails rather than reverting to SQLite. The root `npm run dev:all` still launches frontend and backend together.

```powershell
npm ci
npm --prefix backend ci
npm run build:all
npm --prefix backend test
npm run test:e2e
```

`build:all` runs the Next.js build and backend build from one command; each separate Vercel project still runs its own `npm run build`. The browser tests force local SQLite/fixtures and disable provider keys even if .env has live credentials. Stop existing Next.js dev servers first to avoid the shared .next/dev lock.

Regression tests use temporary SQLite, **embedded PostgreSQL via PGlite** (the real SQL engine with a simulated network pool/lock), cached Nessie fixtures, and mocked/disabled OpenAI. They make no Supabase/Nessie/OpenAI requests. Tests cover migrations/seeds, shared sessions, concurrent throttling, slow risk, ownership, CSV, pagination, admin controls, expiry, reset, and audit rollback. Real distributed advisory-lock behavior and Vercel routing still need verification on the actual deployed environment.

`npm run seed`/`reset` in backend select Postgres when DATABASE_URL is present, otherwise SQLite. CLI reset revokes all demo sessions, resets risk/events/protection, and preserves existing banking rows; use it intentionally. API reset preserves sessions. Neither command writes Nessie.

## Files and compatibility

Backend changes: shared async state contract, SQLite compatibility adapter, Postgres adapter/migration, common HTTP handler, local/hosted transports, build/setup commands, environment template, and offline tests. All existing routes and v1 JSON/CSV response shapes are retained; `developmentOnly: true` deliberately remains true even for the hosted demo. Initialization adds a documented generic 503 error.

Shared changes: root `package.json` adds only `build:all`; browser-test configuration clears DATABASE_URL to keep tests offline. No frontend components, styling, dashboard layout, or provider integration behavior changed. Nothing is deployed, committed, or pushed by these changes.

References: [Vercel Node functions](https://vercel.com/docs/functions/runtimes/node-js), [Supabase connection/pooling guide](https://supabase.com/docs/guides/database/connecting-to-postgres), [node-postgres transactions](https://node-postgres.com/features/transactions).
