# Banking security backend API v1

The backend is an independent TypeScript package in `backend/`; it needs Node **24.11+** and uses Node's HTTP server, native TypeScript execution, and built-in SQLite. SQLite currently prints Node's experimental-feature warning. There are no backend production npm dependencies. Its purpose is detecting suspicious collection of banking data after login. It does not detect fraudulent transactions, identify every AI agent, or claim to prevent all DDoS attacks. The existing Nessie sandbox adapter and advisory analyst are now connected to the Next.js banking/security frontend on the isolated `test` branch. See [connected-demo.md](connected-demo.md) to start both apps; no changes to `main` or deployment are included.

## Run locally

From the repository root in PowerShell:

```powershell
cd backend
npm ci
if (!(Test-Path .env)) { Copy-Item .env.example .env }
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

`npm run seed` inserts local fictional fixtures idempotently. Startup also seeds locally. CLI `reset` clears all sessions, risk signals, and audit events, enables protection, and re-seeds missing local fixtures. It intentionally preserves existing fixture rows; banking routes are read-only. Run CLI reset with the server stopped to avoid invalidating active demos unexpectedly. API reset preserves sessions and fixture data. Neither `npm run reset` nor `npm run seed` creates, mutates, or resets anything in Nessie. The separate explicit `nessie:seed --live` command below provisions sandbox records. No banking or security HTTP route writes to Nessie.

`npm run demo` is **scripted HTTP automation, not a real AI-agent test**. It checks the local demo health marker and uses only `http://127.0.0.1:<port>` (override port with `DEMO_BASE_URL`). It refuses redirects, non-loopback targets, and any banking source other than `local`, before making banking requests. It makes at most 30 requests within 20 seconds, demonstrating ordinary browsing, a burst, and slower cross-account attempts. Use default security thresholds with protection enabled; it does not reset anyone's existing activity. Integration tests use ephemeral loopback servers and temporary/in-memory databases; fake time tests the five-minute window without long waits. Nessie responses come from the checked-in `backend/tests/fixtures/nessie-sandbox.json`, a reusable fictional sandbox-format fixture based on official examples, not a capture of anyone's live account. All AI calls in tests/examples are mocked. No repeated automation or load test targets Nessie or external banks.

## Select local fixtures or our Nessie sandbox

Leave `BANKING_PROVIDER=local` for offline development. To opt into actual Nessie sandbox reads, configure the **ignored server-side** `backend/.env`:

```dotenv
BANKING_PROVIDER=nessie
NESSIE_API_KEY=YOUR_OWN_SANDBOX_KEY
NESSIE_API_BASE_URL=https://prod-api.nessieisreal.com
NESSIE_ACCOUNT_MAP='{"user-alice":{"acc-alice-checking":"YOUR_ALICE_SANDBOX_ACCOUNT_ID"},"user-bob":{"acc-bob-checking":"YOUR_BOB_SANDBOX_ACCOUNT_ID"}}'
```

Create/choose accounts in your own Nessie sandbox using its official site, then insert their IDs into this mapping. Remove users/accounts you have not provisioned. Do not put real keys or account IDs into source, dashboard bundles, example JSON, Git, command arguments, or documentation. No key is supplied in this repository and startup does not make a provider call.

`NESSIE_ACCOUNT_MAP` maps trusted **server user IDs** to public application aliases and then upstream sandbox account IDs. An account alias must start with `acc-`. Aliases and upstream IDs must each be unique across the whole mapping; only the known customer identities `user-alice` and `user-bob` are permitted. Admins have no banking ownership bypass. A server operator must verify these are the correct sandbox accounts before assigning them; the application cannot independently infer who owns your upstream sandbox. The mapping is loaded once at startup, independent of client input, and survives restarts through `.env`. Restart to apply edits; no public mapping-update route exists.

Clients continue using `/api/bank/accounts/acc-alice-checking`, **not** a raw Nessie ID. Login's existing `accountIds` now comes from the selected repository without a Nessie read. Raw upstream IDs, unknown aliases, and another user's aliases are denied. Local SQLite ownership rows are not used to authorize Nessie access. The order remains authentication -> trusted local ownership check -> atomic security decision/audit -> protected provider fetch. CSV is generated here from the permitted provider transaction feed.

Source is explicit: `GET /api/health` adds `bankingSource: "local" | "nessie"`; login adds the same optional field; banking responses, including errors, send `X-Banking-Source: local|nessie`. Account/transaction/CSV body formats remain unchanged. There is **no fallback** from Nessie to fixtures. Local rows still exist in SQLite for offline mode but are never substituted into a Nessie response. Do not label `local` as live sandbox data.

### Verified official Nessie endpoints and mapping policy

Verified on **2026-11-08** against [Nessie's official OpenAPI spec](https://prod.nessieisreal.com/nessie-openapi-spec.yaml), OpenAPI 3.0.3 / API 1.0.0. Spec SHA-256: `2a33e85ec72e34b9f4298489a06b10fce492e3f729a96aebc80de05033603dcc`. The [official documentation](https://prod.nessieisreal.com/docs) selects `https://prod-api.nessieisreal.com` and documents withdrawal field examples where the spec's response schema is generic.

| Backend read | Official Nessie request |
| --- | --- |
| Account | `GET /accounts/{id}` |
| Transaction feed part 1 | `GET /accounts/{id}/deposits` |
| Transaction feed part 2 | `GET /accounts/{id}/withdrawals` |

The official spec requires `key` as a query parameter. The server constructs it privately over HTTPS and refuses redirects. It never logs that URL, upstream response/error bodies, or original fetch exceptions. `NESSIE_API_BASE_URL` is configurable but must be HTTPS with no credentials, query, or fragment. Point it only at a trusted sandbox; operators control where credentials are sent. Avoid HTTP debug/proxy tracing of outbound requests because Nessie credentials are in the upstream query string.

Nessie exposes balance/amount numbers without a currency field. This application's documented USD policy treats these as **major units**, converting exactly to integer cents: 5000 -> 500000, 0.29 -> 29. More than two decimal places, unsafe/negative values, malformed rows, mismatched account IDs, invalid dates, and duplicate transaction IDs fail the entire response. No binary floating-point rounding is used to convert monetary values. Validate the USD unit policy against your sandbox expectations during the smoke check before presenting balances.

Deposits are positive, withdrawals negative. Public account IDs remain aliases. Transaction IDs are namespaced by kind; date-only values become UTC midnight, and records sort oldest first by date/ID to match local mode. Descriptions include provider/kind/status, so pending/cancelled records are not presented as silently completed. `postedAt` is the provider's `transaction_date`, not a promise of settlement. This feed covers **deposits and withdrawals only**; purchases, transfers, bills, and loans are not fetched or represented as a complete banking ledger. The current spec does not publish account-scoped purchase/transfer GETs; the adapter does not guess undocumented endpoints.

Each permitted account read makes one upstream GET. A permitted transaction/CSV read makes two sequential upstream GETs under one five-second deadline. There are no automatic retries, hidden prefetches, discovery calls, or model calls. Responses are bounded to 2 MiB each and 1000 records per feed; excess data causes an explicit `nessie_invalid_response` error rather than a partial result. CSV uses the same transaction feed and existing escaping/formula protections.

Nessie errors preserve the existing `ErrorResponse` envelope and source header:

| HTTP | Code | Meaning |
| --- | --- | --- |
| 502 | `nessie_auth_failed` | Upstream rejected the server's key/permissions |
| 502 | `nessie_account_not_found` | Configured upstream resource missing; review mapping |
| 503 + `Retry-After: 5` | `nessie_rate_limited` | Upstream, rather than behavioral rules, throttled the read |
| 504 | `nessie_timeout` | Five-second upstream operation deadline expired |
| 502 | `nessie_unavailable` | Network/redirect failure; no fixture fallback |
| 502 | `nessie_upstream_error` | Other non-success upstream status |
| 502 | `nessie_invalid_response` | Invalid/oversized/inconsistent response |

Security audit `allow` means the rules permitted a read; it does not mean Nessie delivered successfully. Provider failures happen after the enforcement decision and do not get relabeled as security blocks.

### Explicit, small live smoke check

After configuring your own sandbox mapping/key, run this **only when you intend to contact Nessie**:

```powershell
cd backend
npm run nessie:smoke -- --live --user alice --account acc-alice-checking
```

This starts its own ephemeral local backend/in-memory database, creates a demo session, and passes the account and transaction routes through the same ownership/security checks. It is limited to **one mapped account, at most three upstream GETs, and a 15-second overall deadline**. It allows only the official production/QA Nessie origins, makes no provider writes, prints no payloads/keys/URLs, and makes no OpenAI requests. It does not touch the running application's sessions/events. It refuses to run without `--live`, Nessie mode, and a valid owned mapping. It is never invoked by `npm test`, `npm run demo`, startup, or example generation.

Failures identify the stage (`login`, `account`, or `transactions`) and an allowlisted error code, with a static troubleshooting hint. For example, HTTP 502 with `nessie_auth_failed` indicates rejected server credentials; `nessie_account_not_found` indicates a missing/mismapped bank account; `nessie_unavailable` indicates connectivity; `nessie_invalid_response` indicates incompatible provider data. Unknown codes, upstream messages, and response bodies are never echoed. A 502 alone does not prove the key is incorrect.

### Add fictional transaction data to your own Nessie sandbox

The operator-only seed command uses the existing key and trusted account mapping from `.env`. It is not exposed through an HTTP endpoint or run automatically. Preview first from `backend/`:

```powershell
npm run nessie:seed -- --user alice --account acc-alice-checking
```

The preview makes **zero network calls**. To actually add the records:

```powershell
npm run nessie:seed -- --user alice --account acc-alice-checking --live
```

This provisions **30 fictional transactions: 6 deposits and 24 withdrawals**, dated within the past month, with fictional payroll/savings, cafe, groceries, rent, utilities, streaming, fuel, bookshop, and transit labels. It changes your sandbox balance: deposits total USD 4000, withdrawals USD 2310. Credits are written before debits so an empty new sandbox account can be populated. It does not create customers/accounts or delete existing transactions.

The writes use the official documented `POST /accounts/{id}/deposits` and `POST /accounts/{id}/withdrawals` endpoints, with `medium: "balance"`, `status: "completed"`, positive integer major-unit amounts, `transaction_date`, and fictional descriptions. See the verified official spec and withdrawal field examples referenced above. Scope is restricted to one mapped account on an official production/QA sandbox origin.

Each invocation makes at most **32 provider requests (2 feed reads + 30 creates)** under a **60-second overall deadline**, with five-second individual request deadlines and 500ms spacing before writes. This is bounded data provisioning, not a load test. It makes no model calls, performs no automatic retries, and never prints keys, URLs, upstream bodies, or protected banking contents. Tests mock all provider calls.

Descriptions contain fixed `bank-detect-demo-v1` markers. Reruns inspect the existing feeds and skip visible matching records, allowing a stopped batch to resume instead of blindly writing another 30. Existing conflicting/duplicate markers cause a failure before writes. Historical dates are preserved for skipped records. The sandbox API provides no transactional idempotency guarantee: let writes become visible before rerunning and do not run seeders concurrently across machines. A local `data/nessie-seed.lock` prevents concurrent invocations from this workspace; if a process is killed, remove that one lock file only after confirming no seed is running. Error output states acknowledged writes; a timed-out final write may have succeeded, so rerun the marker check rather than manually replaying that write.

After seeding, `npm run nessie:smoke -- --live --user alice --account acc-alice-checking` should report records. Our banking transaction and CSV routes will read them without a server restart if the key/mapping is already loaded. Seeding itself does not create suspicious-collection security events; those are produced when sessions access the protected banking routes.

## Authentication and dashboard integration

Customer identity comes from the opaque `demo_session` cookie; administrator login sets a separate `demo_admin_session` cookie. This lets the banking page and security dashboard run side by side without replacing each other's identity. The database stores token SHA-256 digests, plus separate nonsecret UUID session IDs for dashboard correlation. Cookies are HttpOnly, SameSite=Strict, Path=/, expire after eight hours, and gain Secure when `APP_ORIGIN` uses HTTPS. Nonsecret session IDs are never accepted as bearer credentials. Client `userId`, role, request-ID headers, user-agent strings, and mouse behavior cannot authorize banking requests. A customer token placed under the administrator cookie name still fails the server's role check. Legacy administrator sessions in `demo_session` remain accepted for security endpoints.

**Development-only login**: `POST /api/demo/session`, `Content-Type: application/json`.

```json
{ "handle": "alice" }
```

Customer handles: `alice`, `bob`. Administrator login: `{ "handle": "admin", "adminKey": "<your DEMO_ADMIN_KEY>" }`. Do not bundle the admin key into frontend code, store it in browser storage, or supply a default key. A demo operator enters it explicitly for local login. A customer supplying an admin role or user ID cannot gain admin access.

Additive frontend session routes: `GET /api/demo/session` restores a customer session, and `GET /api/demo/admin-session` restores an administrator session, returning the existing `DemoSessionResponse` shape without retrieving protected banking payloads. Missing/expired sessions return 401; a customer token used as an admin session returns 403. `POST /api/demo/logout` with JSON `{ "scope": "customer" }` or `{ "scope": "admin" }` revokes only that server session and clears its cookie. It returns `{ "developmentOnly": true, "signedOut": true, "scope": "customer" | "admin" }`. Invalid scope is 400; all demo mutations are subject to the same origin check as login.

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

In local mode Bob owns `acc-bob-checking`; in Nessie mode ownership comes only from the server mapping above. The administrator has no banking accounts and has no ownership bypass. Alice/Bob are fictional logins anyone can select in demo mode; they are **not production authentication**, including in Nessie mode. Use only your own synthetic sandbox accounts. Fresh demo logins create new session state, so this system is intentionally not resistant to session farming. Production authentication, distributed coordination, and upstream abuse protection remain future work.

The connected frontend uses relative `/api/...` URLs and cookies through `next.config.ts` rewrites. `npm run dev:all` from the repository root sets the backend's exact `APP_ORIGIN` to `http://localhost:3000` and proxies `/api` to `http://127.0.0.1:3001` without copying provider credentials to the frontend. For separate startup commands, set the origin yourself as described in [connected-demo.md](connected-demo.md). Cross-origin POST requests and browser `Sec-Fetch-Site: cross-site` mutations receive 403; no CORS access is enabled. JSON request bodies are capped at 4096 bytes where parsed. CLI clients may omit Origin. Health endpoint: `GET /api/health` returns `{ "status": "ok", "developmentOnly": true, "bankingSource": "local" }` (or `nessie`). This reports configured source, not upstream availability, and performs no Nessie probe.

Type-only integration:

```ts
import type {
  OverviewResponse, EventsResponse, SessionResponse,
  ProtectionResponse, ResetResponse, ErrorResponse, AnalysisResponse
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

`BankingRepository` accepts synchronous or async results for ownership, account, and transaction methods. The local SQLite adapter is synchronous; the Nessie adapter returns promises for data retrieval. Optional `source` and `accountIds` members were added compatibly for provenance and trusted login discovery; the original methods/signatures are preserved.

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

New events add optional `enforcement: { cause, threshold, contributingRuleIds }`, recording the **actual deterministic enforcement basis**. A score-based block records `cause: "score_threshold"`, the configured block threshold at that time, and all positive-score contributing rule IDs. Multiple rules may combine to cause a block; do not claim a single rule caused it when scores were combined. Burst-only throttles record `request_frequency`; ownership/authentication denials record `authorization`. The AI does not generate these fields. Historical events without this added field are supported and expose a null basis in analysis.

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

## Existing optional explanations

`POST /api/security/sessions/:id/explanation?limit=50&cursor=...` (administrator only) returns `{ "source": "deterministic" | "model", "text": "..." }`. `GET` session details always use a deterministic explanation and never call a model. A missing `OPENAI_API_KEY` or `OPENAI_EXPLANATION_MODEL` causes no network call. Configure both server-side values to opt into an OpenAI Responses request. The explanation path has a three-second timeout, output cap, no tools, and deterministic fallback for timeout/provider/parse errors. No real model request is made by the test suite or local demo script.

Only a maximum of 50 events' allowlisted action/auth/decision enums, scores, protection booleans, and rule IDs/counts/scores are transmitted by the legacy explanation endpoint. No free-text reasons, identifiers, URLs, banking payloads, or secrets are legacy explanation input. Untrusted event data is separated from fixed instructions; output remains untrusted plain text. Provider credentials are used only in server-side authorization headers. Explanations never authorize requests and are not called from banking enforcement. The optional request follows the [official OpenAI Responses guidance](https://developers.openai.com/api/docs/guides/migrate-to-responses) with separated instructions/input and `store: false`; this flag does not promise zero provider retention. The structured analyst has passed the live check below; the legacy free-text endpoint has not been separately live-verified.

## Advisory AI security analyst

New administrator-only endpoint: **`POST /api/security/sessions/:id/analysis`**. Send `{}` with the admin session cookie. It shares the existing server-only OpenAI credentials/transport. All existing routes and response fields, including the legacy explanation endpoint, remain available unchanged. No automatic AI request occurs during banking enforcement or dashboard GET requests.

The analyst reviews the **50 newest events at most**, for this session only, within the current configured risk window (default five minutes). This endpoint deliberately does not accept timeline pagination: an old page must not be presented as a current assessment. `sample` states the count, cap, window, and first/last event timestamps. `generatedAt` is the snapshot time before the provider call; refresh analysis after new activity. Analysis is returned on demand and is not cached/persisted. One model request may be in flight per application; additional requests receive a labeled deterministic `busy` fallback. No retries are made. Disable the dashboard button while a request is pending rather than polling the model endpoint.

Configure `OPENAI_API_KEY` and `OPENAI_EXPLANATION_MODEL` in the ignored server `.env`, then restart. Choose a model available to your account that supports Responses structured outputs; no model is hardcoded. With either variable missing, the same endpoint works offline and explicitly reports `source: "deterministic"`. Model requests use a five-second timeout, 64 KiB response cap, 1200 output token limit, `store: false`, no tools, and strict JSON Schema, following [official OpenAI structured-output guidance](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).

The input allowlist includes server-generated nonsecret **request IDs** (the stable event identifiers needed for evidence citations), UTC timestamps, action/authorization/decision enums, scores, protection booleans, and rule IDs/counts/scores. It excludes session IDs, resource fingerprints/IDs, free-text reasons, request bodies, account/transaction contents, URLs, credentials, and API keys. Unexpected enums or malformed metadata never go to the model. Fixed instructions treat all event data as untrusted. Output is parsed and validated again locally: allowed assessment enum, short nonempty explanation (<=1200 characters), <=10 unique cited IDs, all of which must exist in the actual sampled session events. `normal`/`suspicious` require at least one citation; `uncertain` may have none. Invalid shape, fabricated citations, refusals, incomplete output, or provider failure all fall back deterministically.

Response shape (`AnalysisResponse`):

```json
{
  "apiVersion": "1",
  "sessionId": "11111111-1111-4111-8111-111111111111",
  "generatedAt": "2026-11-08T12:00:00.000Z",
  "sample": {
    "eventCount": 1, "maxEvents": 50, "windowMs": 300000,
    "firstEventAt": "2026-11-08T11:59:59.000Z", "lastEventAt": "2026-11-08T11:59:59.000Z"
  },
  "analysis": {
    "source": "model", "assessment": "suspicious", "advisoryOnly": true,
    "explanation": "Repeated denied account access warrants review.",
    "supportingRequestIds": ["22222222-2222-4222-8222-222222222222"]
  },
  "enforcement": {
    "currentDecision": "block", "currentRiskScore": 100,
    "protection": {
      "enabled": true, "windowMs": 300000, "burstWindowMs": 2000,
      "burstLimit": 8, "throttleScore": 55, "blockScore": 90, "scoreMeaning": "internal_rule_score"
    },
    "blockedRequests": [{
      "requestId": "22222222-2222-4222-8222-222222222222", "riskScore": 100,
      "triggeredRules": [{ "id": "unauthorized_resources", "count": 4, "score": 100, "reason": "4 unauthorized resource attempts in the risk window" }],
      "reasons": ["4 unauthorized resource attempts in the risk window"],
      "basis": { "cause": "score_threshold", "threshold": 90, "contributingRuleIds": ["unauthorized_resources"] }
    }]
  }
}
```

`assessment` is `normal`, `suspicious`, or `uncertain`; it is always advisory. `source` distinguishes model interpretation from the deterministic fallback. Fallback includes `fallbackReason`: `not_configured`, `no_events`, `provider_failed`, `invalid_response`, or `busy`. The deterministic fallback marks positive-score rule signals/ownership denials as suspicious, three or more allowed signal-free events as normal, and sparse/ambiguous samples as uncertain. Neither source proves AI identity, transaction fraud, or malicious intent. `normal` does not guarantee safety, particularly with protection off or a small sample.

**Dashboard integration (implemented on `test`; behavior for future maintenance):**

1. Keep displaying the existing timeline, current rule risk, and decision from `GET /api/security/sessions/:id`.
2. Add an explicit "Analyze recent activity" action calling the new POST with `{}`, same-origin credentials, and the admin cookie. For example:

   ```ts
   const response = await fetch(`/api/security/sessions/${sessionId}/analysis`, {
     method: 'POST', credentials: 'same-origin',
     headers: { 'Content-Type': 'application/json' }, body: '{}'
   });
   if (!response.ok) throw new Error('Unable to request session analysis');
   const result: AnalysisResponse = await response.json();
   ```

3. Display `analysis.assessment`, plain-text `analysis.explanation`, and an explicit badge: **"AI advisory"** for `source: "model"`, **"Rule-based fallback"** for `deterministic`. Show `fallbackReason` and sample/snapshot time so an unavailable model is not mistaken for an AI result.
4. Link `supportingRequestIds` to matching timeline events by `requestId`. The sample can be larger than the current timeline page, so fetch more existing timeline pages if a cited ID is not loaded yet. Do not invent missing events or treat an unloaded page as an invalid citation.
5. Display rule enforcement separately: `enforcement.currentDecision`, risk score, and blocked request `basis`/`triggeredRules`/threshold. Label this **"Actual rule enforcement"**. A model saying normal never removes a rule block. The analyst cannot change ownership, protection settings, risk state, or authorization.
6. Show banking source from login/health or `X-Banking-Source`. A `nessie_*` provider error is different from `security_blocked`/`security_throttled`. Never put provider keys into the dashboard or call Nessie directly from it.

The machine-readable examples contain a real local **deterministic endpoint response** under `securityAnalysis`, an explicitly mocked `mockedModelAnalysis`, and `mockedNessieExample` showing normalized adapter output and the sanitized provider-error envelope. `exampleMetadata` records that zero real provider calls were made. Mocked Nessie examples are not claimed to be a live sandbox capture.

### Check one live AI analyst response

After setting `OPENAI_API_KEY`, `OPENAI_EXPLANATION_MODEL`, and `DEMO_ADMIN_KEY` in the server `.env`, run from `backend/`:

```powershell
npm run analyst:smoke -- --live
```

This uses API credits for at most **one real OpenAI request**. It starts a separate ephemeral local backend/in-memory database, authenticates as the demo administrator, and creates five scripted local banking events (four ownership denials and the resulting behavioral block). Virtual time spaces these events; banking data comes only from local fictional fixtures. It makes **zero Nessie calls**, at most ten local requests, and uses a 15-second overall deadline. It does not modify your running server's state. This is a live analyst connectivity/validation check, not a real AI collector test.

Success reports `source: "model"`, the advisory assessment/explanation, validated evidence count, and a separately recorded actual rule block/score. Fallback is reported explicitly and exits unsuccessfully; a safe numeric provider status helps distinguish rejected credentials (401), model access (403/404), and quota/rate limits (429), without echoing provider bodies or keys. GPT-6 Luna requests set `reasoning.effort: "none"` for this short structured advisory task; other configured model IDs keep their existing parameters. Restart `npm start` after changing `.env` so the running dashboard backend also gets the new settings.

**Live verification, 2026-11-08:** the configured GPT-6 Luna analyst returned HTTP 200, `source: "model"`, `assessment: "suspicious"`, and five validated supporting event IDs. The independent actual rule decision remained `block` with an internal score of 100. Exactly one real model request and zero Nessie requests were made. The temporary smoke data was discarded when the check finished.

## Files and remaining work

The original backend lives in `backend/` and `docs/`. Frontend integration is isolated on `test`, where the fetched frontend was merged and its existing components were connected. Shared proxy/type-check/development configuration changes are documented in [connected-demo.md](connected-demo.md). The root README is unchanged. No merge into `main`, deployment, pull request, push, or secret commit is performed.

The banking UI, dashboard source/error/advisory displays, same-origin proxy, customer/admin login, charts, and demo controls are connected on `test`. Remaining future work includes the actual browser collector agent, real authentication before any real banking deployment, broader documented transaction feeds, and production operations. The user previously verified the own-sandbox Nessie smoke with one account and 30 deposit/withdrawal records, and the structured analyst passed the live verification above. Automated regression/browser tests continue using local fictional fixtures and mocked or disabled AI responses; no live provider calls are made by test suites or example generation.
