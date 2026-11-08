# Banking security backend API v1

This repository had no application stack or authentication when this backend was added. The backend is an independent TypeScript package in `backend/`; it needs Node **24.11+** and uses Node's HTTP server, native TypeScript execution, and built-in SQLite. SQLite currently prints Node's experimental-feature warning. There are no production npm dependencies. No frontend, styling, root/shared configuration, Nessie integration, deployment, or changes to `main` are included.

## Run locally

From the repository root in PowerShell:

```powershell
cd backend
npm ci
Copy-Item .env.example .env
# Edit .env: set DEMO_ADMIN_KEY to a random secret of at least 24 characters.
# Generate one, for example: node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
npm run seed
npm start
```

Default URL: `http://127.0.0.1:3001`. `DEMO_MODE=true` explicitly enables fictional fixture login. Startup refuses `NODE_ENV=production`, and refuses to run without demo mode. Administrator login remains disabled until a sufficiently long `DEMO_ADMIN_KEY` is configured. `.env`, SQLite files/WAL files, and dependencies are ignored by `backend/.gitignore`. Never commit credentials.

```powershell
npm test
npm run typecheck
npm run demo
npm run reset
```

`seed` inserts fictional fixtures idempotently. Startup also seeds. CLI `reset` clears all sessions, risk signals, and audit events, enables protection, and re-seeds missing fixtures. It intentionally preserves existing fixture rows; banking routes are read-only. Run CLI reset with the server stopped to avoid invalidating active demos unexpectedly. API reset preserves sessions and fixture data.

`npm run demo` is **scripted HTTP automation, not a real AI-agent test**. It checks the local demo health marker and uses only `http://127.0.0.1:<port>` (override port with `DEMO_BASE_URL`). It refuses redirects and non-loopback targets. It makes at most 30 requests within 20 seconds, demonstrating ordinary browsing, a burst, and slower cross-account attempts. Use default security thresholds with protection enabled; it does not reset anyone's existing activity. Integration tests use ephemeral loopback servers and temporary/in-memory databases; fake time tests the five-minute window without long waits. Optional model tests mock network calls. No automation targets external banking sites or real accounts.

## Authentication and dashboard integration

All session identity comes from an opaque `demo_session` cookie. The database stores only its SHA-256 digest, plus a separate nonsecret UUID session ID for dashboard correlation. Cookies are HttpOnly, SameSite=Strict, Path=/, expire after eight hours, and gain Secure when `APP_ORIGIN` uses HTTPS. Nonsecret session IDs are never accepted as bearer credentials. Client `userId`, role, request-ID headers, user-agent strings, and mouse behavior cannot authorize banking requests.

**Development-only login**: `POST /api/demo/session`, `Content-Type: application/json`.

```json
{ "handle": "alice" }
```

Customer handles: `alice`, `bob`. Administrator login: `{ "handle": "admin", "adminKey": "<your DEMO_ADMIN_KEY>" }`. Do not bundle the admin key into frontend code, store it in browser storage, or supply a default key. A demo operator enters it explicitly for local login. A customer supplying an admin role or user ID cannot gain admin access.

Example 201 response (also sets the cookie):

```json
{
  "developmentOnly": true,
  "sessionId": "11111111-1111-4111-8111-111111111111",
  "expiresAt": "2026-11-07T20:00:00.000Z",
  "user": { "handle": "alice", "role": "customer" },
  "accountIds": ["acc-alice-checking", "acc-alice-savings"]
}
```

Bob owns `acc-bob-checking`. The administrator has no banking accounts and has no ownership bypass. Alice/Bob are fictional logins anyone can select in demo mode; they are **not production authentication**. Fresh demo logins create new session state, so this system is intentionally not resistant to session farming. Production authentication, distributed coordination, upstream abuse protection, and replacing synthetic data remain future work.

The dashboard should use relative `/api/...` URLs and cookies. Serve/proxy the API and dashboard through the same origin and set `APP_ORIGIN` to that exact browser origin. For a dashboard at `http://localhost:3000`, set that as `APP_ORIGIN` and proxy `/api` to `http://127.0.0.1:3001`. No frontend proxy configuration is changed here. Cross-origin POST requests and browser `Sec-Fetch-Site: cross-site` mutations receive 403; no CORS access is enabled. JSON request bodies are capped at 4096 bytes. CLI clients may omit Origin. Health endpoint: `GET /api/health` returns `{ "status": "ok", "developmentOnly": true }`.

Type-only integration:

```ts
import type {
  OverviewResponse, EventsResponse, SessionResponse,
  ProtectionResponse, ResetResponse, ErrorResponse
} from '../backend/src/contracts'; // adjust relative path for your dashboard
```

The canonical contract is [`backend/src/contracts.ts`](../backend/src/contracts.ts). Security responses carry `apiVersion: "1"`; changes should be additive. Complete machine-readable example responses, including all 15 chart buckets, are in [`backend-api.examples.json`](backend-api.examples.json). Render explanation text as text, never executable HTML.

Regenerate the fixture examples with `npm run docs:examples` from `backend/`. This runs a bounded set of requests against its own ephemeral loopback application and in-memory database, with a three-second timeout per request and no external/model calls.

## Banking routes

| GET route | Allowed response |
| --- | --- |
| `/api/bank/accounts/:id` | `{ "account": { "id", "name", "currency", "balanceCents" } }` |
| `/api/bank/accounts/:id/transactions` | `{ "transactions": [{ "id", "accountId", "postedAt", "description", "amountCents" }] }` |
| `/api/bank/accounts/:id/export` | CSV download; same transactions, integer cents, quoted/escaped fields |
| `/api/bank/decoy/export` | Harmless `{ "decoy": true, "message": "Demo decoy: no banking data exists here" }` if permitted |

Amounts use integer cents, timestamps use ISO 8601 UTC, currency is USD. CSV textual formulas are prefixed with an apostrophe. Authentication, then ownership, then behavioral enforcement all precede protected payload fetching. The ownership lookup only returns a boolean; it does not retrieve balances or transactions. Unknown and other-user account IDs get the same ownership error. A repository adapter must implement the ownership lookup against a trusted user-account mapping; Nessie must not bypass this gate.

`BankingRepository` accepts synchronous or async results for ownership, account, and transaction methods. The local SQLite adapter is synchronous; a future network adapter can return promises without altering route enforcement order.

All matched banking routes go through the engine and audit recorder, including authentication/ownership denials and unsupported methods. Unsupported methods return 405 after security checks. Unmatched URLs return 404 without banking data and are not banking audit events. Audit failure fails closed with 500 before payload fetching. Banking fetch failures can return 500 after an `allow` event; events record authorization/security decisions, not delivery success.

| Condition | Status | Error code |
| --- | --- | --- |
| Missing/expired/invalid session | 401 | `authentication_required` |
| No ownership, including unknown account | 403 | `account_access_denied` |
| Behavioral block | 403 | `security_blocked` |
| Behavioral throttle | 429, `Retry-After: <integer seconds>` | `security_throttled` |
| Non-admin accessing security endpoints | 403 | `admin_required` |

Authentication/ownership denials take precedence over a behavioral decision. Logged `decision: "deny"` means an authorization denial, with any behavioral rules/risk still recorded. A block is temporary and evaluated on each request; after the signals expire, a session can recover. Throttle retry time is conservative: burst-only requests wait the burst window; score-based throttles wait until the most recent signal leaves the risk window. Continued denied/throttled attempts create signals and can extend the wait. Every response uses `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, and a server-generated `X-Request-ID`.

Error shape:

```json
{
  "error": {
    "code": "security_throttled",
    "message": "Request throttled; wait before retrying",
    "requestId": "22222222-2222-4222-8222-222222222222"
  }
}
```

## Detection and storage

Rules are pure configurable TypeScript in `backend/src/rules.ts`; thresholds/windows are loaded in `config.ts`. Default rules:

| Rule | Signal in sliding risk window | Internal score |
| --- | --- | --- |
| `request_frequency` | More than 8 banking attempts in the last 2000ms | 0; independently throttles |
| `unauthorized_resources` | Each authenticated ownership denial | 25 each |
| `repeated_exports` | Account export attempts, including rejected attempts | First free, then 20 each |
| `decoy_access` | Each authenticated decoy access | 70 each |

The risk window is `(now - 300000ms, now]`. Scores add across rules. Score >=55 throttles, score >=90 blocks; otherwise burst excess throttles. Normal authorized reads and one ordinary export carry no score. Repeated unauthorized attempts at 15-second intervals can reach 100 without any burst. Rule reasons are included even for an allowed request that is below enforcement thresholds. Scores are unbounded internal rule totals, **not probabilities, AI classification, or proof of malicious intent**.

Signals, session token digests, settings, and audit metadata persist in SQLite at `DATABASE_PATH`. Assessment plus signal/event writes are transactional. Each incoming request prunes expired signals, expired sessions, and audit events older than 24 hours; queries exclude expired risk immediately even during idle periods. Overview is bounded to 15 minutes/100 recent sessions; event and timeline pages are capped at 100. This is a single-machine hackathon backend, with no production traffic-volume guarantees.

Audit records contain request ID, nonsecret session ID (null if unauthenticated), timestamp, action, target resource, authorization, effective decision, triggered rules, internal risk score, reasons, and protection state. `targetResource` combines the canonical route template with a SHA-256 fingerprint of the requested account identifier, for example `/api/bank/accounts/:id#sha256:<64 hex characters>`. This correlates repeated targets without echoing arbitrary client text into logs. Decoys use their fixed route without a fingerprint. Raw paths, account identifiers, query strings, bodies, cookies, API keys, bank payloads, and transaction contents are excluded. Fingerprints are correlation identifiers, not encryption; predictable fixture account IDs can be matched by hashing. Request frequency, denial counts, and export counts are scoped to each server session. New sessions do not inherit another session's risk.

**Protection off** disables only behavioral signal collection/scoring/enforcement. Authentication, ownership, administrator permissions, audit recording, and request validation stay active. Off-mode events have score 0, no rules, and `protectionEnabled: false`. Existing signals are retained until their normal expiry and resume contributing if protection is re-enabled; use reset to clear them. Admin/security reads do not themselves count as banking signals.

## Administrator dashboard endpoints

Every endpoint below requires an authenticated administrator; unauthenticated callers get 401 and customers get 403 before logs are read or controls changed.

### GET /api/security/overview

Returns `OverviewResponse`: `generatedAt`, `protection`, `period`, `totals`, `buckets`, `sessions`. Fifteen one-minute UTC buckets include zero counts. Each bucket has `start`, exclusive `end`, `total`, `allow`, `deny`, `throttle`, and `block`. Period covers 15 minute-aligned buckets, including the partially filled current minute; `generatedAt` is the actual observation cutoff. Totals sum the buckets. Sessions lists at most the 100 most recently active sessions in this period. Session `eventCount`/firstSeen/lastSeen describe all retained events; session `riskScore`, `decision`, and rules reflect **current** behavioral state. Session decision does not imply permission to access any account. Historical events retain their original scores.

### GET /api/security/events?limit=50&cursor=123

Returns `EventsResponse`:

```json
{
  "apiVersion": "1",
  "items": [],
  "pagination": { "limit": 50, "nextCursor": null, "hasMore": false }
}
```

Newest first by immutable database sequence. `limit`: integer 1–100 (default 50). Treat the decimal `nextCursor` as opaque: pass it back as `cursor` to retrieve strictly older events. New events cannot duplicate entries across subsequent pages. Null means no next page. Invalid pagination returns 400. Cursors remain meaningful across resets; the database sequence is never rewound. Retention/reset can remove rows between pages.

### GET /api/security/sessions/:id?limit=50&cursor=123

Returns `SessionResponse` with `session`, `protection`, newest-first `timeline`, `timelinePagination` (same cursor semantics as events), and deterministic `explanation` for that page. A nonexistent session without retained history returns 404. Expired sessions can still have retained timelines. Current risk is recomputed so a dashboard does not show stale blocking scores.

### POST /api/security/demo/reset

JSON body `{}`. Atomically clears all behavioral signals and bank audit events and re-enables protection. Keeps demo sessions and banking fixtures so the demo operator does not need to sign in again. Returns `ResetResponse`:

```json
{
  "apiVersion": "1",
  "resetAt": "2026-11-07T12:00:00.000Z",
  "protection": {
    "enabled": true, "windowMs": 300000, "burstWindowMs": 2000,
    "burstLimit": 8, "throttleScore": 55, "blockScore": 90,
    "scoreMeaning": "internal_rule_score"
  }
}
```

### POST /api/security/demo/protection

JSON body `{ "enabled": false }` or `{ "enabled": true }`. Requires an actual boolean; invalid body returns 400. Returns `ProtectionResponse`: `{ "apiVersion": "1", "protection": { ... } }` using the exact protection fields shown above. Settings survive server restarts.

## Optional explanations

`POST /api/security/sessions/:id/explanation?limit=50&cursor=...` (administrator only) returns `{ "source": "deterministic" | "model", "text": "..." }`. `GET` session details always use a deterministic explanation and never call a model. A missing `OPENAI_API_KEY` or `OPENAI_EXPLANATION_MODEL` causes no network call. Configure both server-side values to opt into an OpenAI Responses request. The explanation path has a three-second timeout, output cap, no tools, and deterministic fallback for timeout/provider/parse errors. No real model request is made by the test suite or local demo script.

Only a maximum of 50 events' allowlisted action/auth/decision enums, scores, protection booleans, and rule IDs/counts/scores are transmitted. No free-text reasons, identifiers, URLs, banking payloads, or secrets are model input. Untrusted event data is separated from fixed instructions; output remains untrusted plain text. Provider credentials are used only in server-side authorization headers. Explanations never authorize requests and are not called from banking enforcement. The optional request follows the [official OpenAI Responses guidance](https://developers.openai.com/api/docs/guides/migrate-to-responses) with separated instructions/input and `store: false`; this flag does not promise zero provider retention. Live provider connectivity/model availability has not been tested.

## Files and remaining work

Implementation is confined to `backend/` (package/config/environment sample, source, database fixtures, scripts, tests, and lockfile) and `docs/` (this contract and example JSON). The root README is unchanged. No shared configuration changes were necessary. Work belongs on `backend/security-engine`, independently of the dashboard on `main`.

Future work: teammate's dashboard and same-origin development proxy; real authentication before any real banking deployment; a Nessie repository adapter with trusted ownership mapping; production storage/rate limiting/operations. This demo detects configured session behavior and makes no claim to identify real AI agents.
