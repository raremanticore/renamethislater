# Local Browser Use collector demo

This optional runner operates the banking UI as Alice and repeatedly requests CSV exports. **AI mode uses Browser Use and OpenAI; scripted mode uses Playwright only and must not be presented as an AI-agent test.** Neither is the security analyst. The backend rules enforce access independently of both.

## Install once

From repository root in Windows PowerShell (Python 3.12 and Chrome/Edge installed):

```powershell
py -3.12 -m venv agents/.venv
agents/.venv/Scripts/python.exe -m pip install -r agents/requirements.txt
```

The environment is already installed on the original development device. Do not commit it. On macOS/Linux use `python3 -m venv agents/.venv` and `agents/.venv/bin/python -m pip install -r agents/requirements.txt`. Set `BROWSER_EXECUTABLE` if Chrome is not in a standard location.

## Run and record

1. Stop any previous local frontend/backend terminals with Ctrl+C. Start this fixture-only site from root:

   ```powershell
   npm run demo:site
   ```

   It starts localhost:3000/3001 with **local fixtures and local SQLite**, regardless of the provider/database values saved in `.env`. It preserves the existing demo admin and analyst settings. It does not edit `.env`, write to Nessie, or use Supabase. `HOSTED_DEMO_MODE` is disabled for this process.

2. In your own browser, open http://localhost:3000/security and sign in using the existing `DEMO_ADMIN_KEY`. Reset demo activity and leave protection on. Keep the dashboard visible beside the agent browser.

3. In a second terminal, run the real AI collector:

   ```powershell
   npm run demo:agent -- --live
   ```

   This uses API credits. Only `OPENAI_API_KEY` and `OPENAI_EXPLANATION_MODEL` are read from `backend/.env`; no administrator, Nessie, or database credentials are passed to the agent. Optional process variable `BROWSER_AGENT_MODEL` overrides the model for the collector only. The current default is `gpt-6-luna`, with reasoning disabled for this short task. Other model access/compatibility depends on your API project.

4. The runner opens a **separate visible browser**, signs in as Alice through model-selected UI actions, and tries repeated exports, stopping at the first 429 throttle or 403 block. The terminal prints the customer session ID. Select that same ID in the dashboard. The scripted mode separately demonstrates all six attempts: 200, 200, 200, 429, 429, 403 under default rules. Existing reads can also trigger frequency throttling, so use the recorded rule reasons when explaining a result. Do not claim the AI reached a block if its recorded result was a throttle.

5. On the dashboard, show the session timeline, repeated-export rule, score and actual block. Then click **Analyze recent activity** for the separate analyst interpretation. That is an additional model request when analyst credentials are enabled.

The runner saves a final fictional-data screenshot and a metadata-only `report.json` under ignored `agents/artifacts/`. Its browser closes shortly after the run. Record the browser/dashboard live, or use the screenshot when explaining the outcome. Browser profiles/config live in a temporary directory outside the frontend source tree to avoid Windows file-lock/compiler issues. Profiles are not shared with your normal browser or admin session.

## Rehearsal and fallback

```powershell
npm run demo:agent -- --scripted
```

This clicks the same real UI in a visible browser but makes **zero model calls**. Label it **scripted browser automation** in the presentation. Add `--headless` for checks without a visible window. Scripted mode succeeds only on a confirmed `security_blocked` response; AI mode succeeds on a confirmed throttle or block. A model's claim that it completed the task is not sufficient: the exit status is based on recorded HTTP enforcement responses.

For custom local ports, start the site with `FRONTEND_PORT`/`BACKEND_PORT` and pass the frontend origin using `--base http://localhost:3020`.

## Hard limits and scope

- Refuses non-loopback sites and refuses a backend health marker reporting Nessie data.
- Browser requests are intercepted: external origins, dashboard/admin requests, non-Alice accounts, and repeat login attempts are denied.
- At most 6 export requests, 30 API requests, 14 model calls, and 120 seconds of collection activity. The launcher also terminates a process that exceeds 150 seconds including cleanup. AI mode stops on a verified throttle/block; scripted mode continues to the block or cap. The model sees only fictional UI content; this is not intended for real banking data.
- AI tools are restricted to navigation, clicks, scrolling, dropdowns, waits and completion. No arbitrary JavaScript evaluation, file-reading, upload, search or credential tools are exposed to the model.
- Prompt constraints supplement these enforced limits. The browser profile is isolated, telemetry is disabled, and raw model/provider errors are not printed.
- No evasion, session farming, remote load testing, or claim of universally identifying AI agents.

## Checks

```powershell
agents/.venv/Scripts/python.exe -m unittest discover -s agents -p test_collector.py
npm run demo:agent -- --scripted --headless
```

Policy tests make no network/model calls. Scripted rehearsal tests the running local site's actual UI and backend enforcement. Real AI verification must be run explicitly with `--live`; do not equate a scripted rehearsal with a successful real model run.

Verified on 2026-11-08: the final real Browser Use/OpenAI run completed with **5 model calls, 4 export attempts, and a verified 429 security throttle**, then exited successfully. The independent scripted browser rehearsal completed all six export attempts and observed **200, 200, 200, 429, 429, 403**. Both used local fictional data and made zero Nessie or Supabase calls. The three policy tests, frontend type check, and lint passed. The real AI run demonstrated throttling, not a 403 block.

References: [Browser Use quickstart](https://docs.browser-use.com/open-source/quickstart), [Browser settings](https://docs.browser-use.com/open-source/customize/browser/all-parameters), [OpenAI model documentation](https://developers.openai.com/api/docs/models/gpt-6-luna).
