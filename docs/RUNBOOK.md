# Bridge Operations Runbook

## Current native chat installation — 2026-09-09

Open https://bridgechatgpt-production.up.railway.app and sign in using the protected local file `E:\AI\Bridge\runtime\runner-control\bridge-sign-in.txt`. Select BridgeChatgpt + Gemini 3.8 Flash. The old localhost Google-login portal is closed; native Google login is already persisted.

Scheduled task `Bridge Native Runner v2` starts a hidden protected runner at user logon. Inspect runtime/runner-control/runner-status.json and task state before restarting; idle state is waiting. Do not start another proxy on port 43892. Current service allows only the default workspace and advertises Gemini/Sonnet/Opus. See HANDOFF for live proof and remaining limitations.

Current deployment: 766a96bd-3a82-4ed6-9687-cffd27e02411, a CLI upload of tracked f711e489 source using npm. CLI deployment metadata has no commitHash; verify the recorded archive digest and frontend build match in server-release-proof.json. Never commit sign-in credentials.

## Local Phase 2 auth checkpoint (not deployed)

Before eventual promotion, configure `BRIDGE_PUBLIC_ORIGIN` to the exact external HTTPS origin (no trailing slash/path) and `BRIDGE_BROWSER_PASSWORD` to a separate random credential of at least 32 characters. Do not reuse `BRIDGE_MCP_TOKEN` as the browser password. Do not write either credential into source, logs, documentation or browser storage. Keep existing machine pairing; no per-project re-pairing is needed.

The dashboard signs in through `/api/auth/login` and uses a Secure, HttpOnly, SameSite=Strict host-only cookie. HTTPS is required even for local interactive sign-in; no insecure-cookie fallback is implemented. API tests manually transport the cookie over an isolated loopback test connection, which does not prove actual browser cookie behavior. Mutations need the returned CSRF header and exact Origin. Sessions expire after eight hours and are revoked on logout, server restart, or password/origin rotation. Restart prompts reauthentication; sessions are intentionally not persisted.

`BRIDGE_EXTENSION_ORIGINS` is an optional comma-separated list of exact approved extension origins for CORS, with no wildcard. It grants no authentication or task capability. Protocol-v2 extension/scoped runner/attempt credentials remain unimplemented. URL tokens and unauthenticated development mode are no longer accepted by the changed auth boundaries. Recover bad auth configuration by fixing configuration; do not restore the header bypass.

The legacy CLI worker now exits 78 before reading credentials or claiming work. Its replacement requires [Windows boundary setup](BRIDGE_WINDOWS_BOUNDARY_SETUP.md) and remaining Phase 2–5 implementation. Do not restart or promote it as a working replacement. No existing process was stopped. Parent review/push/deploy is required; this session does none of those operations.

This runbook is for normal operation, deployment, recovery after PC power loss, and handoff to another agent.

## 0. Cost/quota gate — mandatory

Read `docs/FREE_FIRST_POLICY.md` before choosing an operational path.

- Prefer free/included/browser/local/repository/open-source operations.
- Do not call a paid/quota API, token-metered AI API, provider AI Agent, or paid automation without explicit prior user approval.
- Railway AI Agent is not a routine deployment mechanism.
- If an operation/fix takes too long, search this repository first, then trusted public repos/docs/internet for an existing maintained solution before adding custom machinery or switching to a paid path.
- If the free path is blocked, stop and present the free vs paid options, including expected quota/cost when knowable. No approval = no paid/quota fallback.

## 1. Normal live-state verification

Do not infer state from old screenshots or chat history.

Check in this order:

1. GitHub `main` head commit.
2. GitHub CI/status for the intended commit when relevant.
3. Railway latest deployment status and `commitHash`.
4. Railway runtime logs for server startup/persistent DB.
5. PC executor `register` / `jobs/claim` traffic when the PC is expected online.
6. Browser Wake `/api/resource-registry/wake-queue` traffic when the Bridge browser is expected online.

A Railway `SUCCESS` deployment proves the server deployment, not the PC/browser/agent path.

## 2. After a PC power outage

Expected sequence:

```text
Power restored
→ Windows boots
→ user logs in (if required)
→ Local Executor startup launcher/service starts
→ executor registers with Railway
→ Bridge browser must be opened/restarted
→ Bridge Wake extension starts polling
→ bound ChatGPT/Studio pages can be woken
```

Verification:

- PC Control should show the PC node online.
- Railway should receive repeated `/api/executors/jobs/claim` requests.
- Browser Wake should periodically request `/api/resource-registry/wake-queue`.

If the executor is absent but Railway is healthy, treat it as a PC/startup problem, not a Railway outage.

## 3. Syncing Bridge source to the PC

Preferred UI path:

```text
Bridge → PC Control → Sync repo
```

The sync action should execute a fast-forward-only pull inside the registered Bridge project path. Do not use hard reset as a routine sync mechanism.

After structural changes, verify:

- `git status` is clean or expected;
- expected files/folders exist under the new layout;
- executor startup path still points to the current code location if startup scripts depend on source paths.

## 4. Creating a new project

From Bridge UI:

1. `Add Project`.
2. Enter the repository URL.
3. Give the project a readable name.
4. Choose execution target (`PC` or `Studio`).
5. Add ChatGPT/Studio resource URLs if already known.

Bridge must register:

```text
local_path = Apps/<ProjectName>
```

When an online PC executor is available, project setup queues a clone into that folder. The same physical PC node is reused across projects; do not pair a new PC token just because a new project was added.

After clone, initialize the project's Markdown handoff set from `Apps/_TEMPLATE/` and commit those docs in the project's own repository.

## 5. Running PC jobs

Controller-created jobs are scoped to the active workspace `local_path`.

Typical safe actions:

- Git status/diff
- tests
- build
- fast-forward sync
- targeted file read/write
- allowlisted direct commands

Never construct a job whose working directory intentionally escapes the approved Bridge root.

## 6. Binding ChatGPT Web / AI Studio Web

A project natural-language task needs at least one valid bound resource target.

### ChatGPT

Use the original conversation URL containing:

```text
/c/<conversation-id>
```

Do not use a public share URL.

### AI Studio

Use the app URL containing:

```text
/apps/<app-id>
```

Bridge stores resource identity in the project registry and Bridge Wake uses it to find/open the correct tab.

Prefer these browser/subscription paths over metered LLM APIs.

## 7. Browser Wake

Expected behavior:

1. Bridge browser/extension is running.
2. Extension polls wake queue.
3. For a queued bound task it opens/focuses the target page when needed.
4. It waits for the page to load.
5. It injects the prompt only if the composer is not busy and there is no existing draft.
6. It sends the prompt.

If wake queue polling works but prompt injection fails, inspect extension state/logs and current page DOM behavior. Do not assume the entire wake mechanism is broken. Check existing source and maintained public implementations before replacing the browser-wake design.

## 8. Deploying Bridge to Railway

Preferred routine workflow:

```text
feature branch
→ CI
→ pull request
→ merge to main
→ deterministic Railway deploy from exact merged commit
→ verify deployment commitHash
```

Routine deployment must use ordinary free/included Git/platform-native controls and must **not** depend on Railway AI Agent. If the normal webhook/deploy route fails, diagnose/reuse an existing deterministic deploy mechanism first. Do not silently fall back to Railway AI Agent or another paid/quota AI API.

Do not report deployment complete until Railway shows `SUCCESS` for the intended commit hash.

Persistent storage must remain mounted at `/app/data`.

## 9. CI expectations

For structural changes, require at least:

- TypeScript typecheck
- test suite
- production build
- Bridge Wake syntax/package step
- production startup smoke test

Do not merge a structural change while CI is red unless the failure is explicitly understood and approved.

## 10. End-of-session handoff

Before ending substantial work:

1. Update `docs/HANDOFF.md`.
2. Update `docs/ROADMAP.md`.
3. Record exact merged commit.
4. Record Railway deployment ID/hash if deployment occurred.
5. Record PC sync status separately from GitHub/Railway status.
6. Clearly state which E2E checks are still unproven.
7. Record any explicitly approved paid/quota dependency, its purpose, cost/quota risk, and removal path.

## 11. Common failure classification

### Railway healthy, PC offline

Likely PC power/login/startup/worker issue.

### PC executor online, project shows unbound

Check machine-scoped executor regression and project snapshot routing. A new project should not require a second PC pairing.

### PC online, task runs in wrong repo

Check workspace `local_path` and controller job `cwd` scoping immediately. Stop further writes until corrected.

### Wake queue 200, no ChatGPT activity

Check target binding, browser login state, extension delivery log, busy/draft detection, and DOM selectors.

### GitHub main and Railway commit differ

Do not blindly redeploy or invoke a provider AI Agent. Determine which commit is intended, inspect ancestry/diff, then restore a single canonical `main` and use a deterministic deploy path.

### A small task is consuming too much time

Stop expanding the investigation. Search the current repo for an existing implementation, then trusted public repos/docs/internet. Reuse/adapt an existing compatible solution when safe instead of repeatedly rebuilding the same capability.

## 12. No-secret / no-surprise-spend rule

Runbooks and handoff docs may name configuration variables and service IDs, but must never contain raw authentication secrets. An available API key or connected service is not authorization to consume paid quota. Explicit prior user approval is required before any paid/quota API/AI-Agent use.
# Conversation runtime candidate — 2026-09-08

The `codex/bridge-completion` candidate is not deployed/qualified. Active UI now uses `/api/chat` conversations and SSE. Keep `BRIDGE_MCP_TOKEN`, independent `BRIDGE_BROWSER_PASSWORD` (at least 32 characters), and exact HTTPS `BRIDGE_PUBLIC_ORIGIN` configured before promotion; `/ready` returns 503 for missing configuration or draining. Runtime subject/attempt grants have bounded lifetimes; revocations persist in `data/runtime-revocations.json` and revoke descendant attempt capabilities. Back up that file with `data/bridge.sqlite`; do not restore one independently without considering credential revocation.

Run `npm run lint`, `npm run test:isolated`, `npm run build`. Isolated test runner writes only fresh fixture state under runtime. Do not run the old ad-hoc `runtime/phase2-validate.mjs`, which edits source before testing. Native adapter/outbox tests are synthetic and do not authorize enabling CLI generation.

Windows probes: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File Apps/BridgeChatgpt/pc-executor/windows-job-probe.ps1`; `native-capability-probe.ps1` uses the same owned job with a deadline. These are process-specific policies for repository scripts, not a machine execution-policy change. Current filesystem/network gates fail; keep the legacy worker disabled. Consult [current phase evidence](BRIDGE_IMPLEMENTATION_STATUS.md) before promotion. SIGTERM refuses new claims/turns and closes streams so clients reconnect; attempts/locks survive and require real owner cleanup, not elapsed-time replay.
