# Bridge Operations Runbook

This runbook is for normal operation, deployment, recovery after PC power loss, and handoff to another agent.

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

## 7. Browser Wake

Expected behavior:

1. Bridge browser/extension is running.
2. Extension polls wake queue.
3. For a queued bound task it opens/focuses the target page when needed.
4. It waits for the page to load.
5. It injects the prompt only if the composer is not busy and there is no existing draft.
6. It sends the prompt.

If wake queue polling works but prompt injection fails, inspect extension state/logs and current page DOM behavior. Do not assume the entire wake mechanism is broken.

## 8. Deploying Bridge to Railway

Preferred workflow:

```text
feature branch
→ CI
→ pull request
→ merge to main
→ Railway deploy from exact merged commit
→ verify deployment commitHash
```

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

Do not blindly redeploy. Determine which commit is intended, inspect ancestry/diff, then restore a single canonical `main` before proceeding.

## 12. No-secret rule

Runbooks and handoff docs may name configuration variables and service IDs, but must never contain raw authentication secrets.
