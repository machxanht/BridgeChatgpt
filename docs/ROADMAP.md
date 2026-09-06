# Bridge Roadmap and Completion Matrix

Status legend:

- ✅ PASS / proven
- 🟢 implemented, live verification may still be needed
- 🟡 partial / in progress
- 🔴 blocked / broken
- ⬜ not started

## Core platform

### ✅ Railway control plane

Bridge production architecture, persistent state, project registry, executor API, wake queue, Studio relay, and web UI are implemented and have previously run successfully on Railway.

Completion rule: every production change must be verified against the exact Railway deployment `commitHash`.

### ✅ Project layout under Apps

Bridge source lives under `Apps/BridgeChatgpt`. New projects use readable `Apps/<ProjectName>` local paths.

### 🟢 Nested project Git isolation

Bridge `.gitignore` now ignores independent `Apps/*` project repos while keeping Bridge source and `Apps/_TEMPLATE` tracked.

Live acceptance test still needed: clone/create a real second project and confirm the parent Bridge repository remains clean.

## PC execution

### 🟢 One paired PC executor for all projects

Implemented and CI-tested. A paired PC is machine-scoped by `node_id` rather than requiring a new pairing per project. Jobs retain their own workspace/project identity.

CI regression test proves a node registered to Project A can claim a Project B job when explicitly assigned to the same node.

Live acceptance tests still needed after PC power returns:

- Project B PC Control sees the same PC node;
- Project B job is assigned to that node;
- worker claims Project B job without re-pairing;
- result remains attached to Project B;
- path escape attempts remain rejected.

### 🟢 Controller project cwd scoping

Implemented and CI-tested. Controller-created jobs are forced to the workspace `local_path` (`Apps/<ProjectName>`).

Live acceptance test: Project A and Project B harmless Git/status actions execute from their own repositories, not the Bridge root or each other.

### 🟡 PC startup after reboot/power loss

Background executor startup had been installed previously, but a full real power-cycle/login proof is not yet durable.

Current known condition: the PC was reported without power from approximately 07:00 UTC+7 on 2026-09-06. Worker/RDC offline while power is absent is expected.

Acceptance test after power returns:

- Windows login if required;
- no manual executor terminal launch;
- Railway receives repeated executor register/claim traffic;
- PC Control reports node online;
- queued fast-forward sync completes.

## Browser agents

### 🟢 Bridge Wake extension

Implementation exists for wake-queue polling, target tab discovery/opening, prompt injection, send attempt, busy/draft safety checks, and duplicate-delivery suppression.

### 🟡 Browser startup persistence

Extension startup is handled when the Bridge browser itself starts, but reliable automatic Bridge-browser launch after Windows reboot is not yet proven.

Installing Windows Startup/Task Scheduler/user-profile configuration is outside the ordinary approved Bridge filesystem scope and requires explicit narrow permission.

### 🟡 ChatGPT Web E2E

Browser is the selected ChatGPT integration. ChatGPT Desktop is intentionally out of scope.

Remaining live acceptance test:

```text
Tablet task
→ Railway/Bridge task
→ wake bound ChatGPT conversation
→ prompt sent
→ ChatGPT interprets
→ scoped PC action
→ result returned to Bridge
```

### 🟡 Google AI Studio E2E

Relay/source support exists. Final browser wake + task/result flow still needs live proof for the selected Studio app.

## Project onboarding

### ✅ Mandatory Markdown handoff standard

Required project documentation and end-of-session update rules are codified in `AGENTS.md` and `docs/PROJECT_STANDARD.md`.

### ✅ Project template

`Apps/_TEMPLATE/` contains:

- `START_HERE.md`
- `docs/HANDOFF.md`
- `docs/ARCHITECTURE.md`
- `docs/RUNBOOK.md`
- `docs/SECURITY.md`
- `docs/ROADMAP.md`

### ⬜ Automatic template seeding into newly cloned projects

Desired behavior: after a project clone succeeds, Bridge initializes only missing handoff files from `Apps/_TEMPLATE/` without overwriting existing project docs.

Committing/pushing those docs into the project's own repository must respect that project's Git state and credentials.

## Tablet UX

### ✅ Single primary Bridge Chat

Current intended layout uses one primary composer and separate PC Control.

### ✅ PC Control

Executor status/jobs plus Git/test/build/repo-sync controls exist.

### 🟡 Historical wording cleanup

Older feedback strings such as `System Details` may remain in source. Normalize them to `PC Control` when touched.

## Operational documentation

### ✅ Durable recovery entrypoint

Replacement sessions have `START_HERE.md` + `AGENTS.md` + `docs/HANDOFF.md` as a deterministic recovery path.

### ✅ Full handoff/runbook set

Architecture, security, operations, recovery, roadmap, project standard, current handoff, and future-project templates are committed.

## GitHub / deployment sync

### ✅ Multi-project + docs code merged

PR #4 passed full Bridge CI and was squash-merged. Latest verified code baseline before finalization:

```text
84d77dc0f5ab30b74481acaf3801b14b636cc6d2
```

### 🟡 Final Railway deployment

Railway was still on `b6a1d081...` before the final handoff/sync commit. Deploy and verify the exact final `main` SHA after finalization merge.

### 🟡 PC final source sync

A command-bus `git pull --ff-only` is being queued. It cannot complete until the powered-off PC returns and its executor starts.

## Deferred / intentionally out of scope

### ⬜ ChatGPT Desktop automation

Intentionally not planned. Browser integration is the chosen path.

## Recommended execution order

1. Merge final handoff/roadmap/PC-sync command into `main`.
2. Deploy exact final `main` commit to Railway and verify `SUCCESS` + commit hash.
3. Leave PC sync job pending while PC has no power.
4. When power returns, verify worker online and queued sync completion.
5. Live-prove one shared PC node against a second project without re-pairing.
6. Live-prove executor restart behavior after the actual outage/login.
7. Bind/test ChatGPT Web E2E.
8. Bind/test AI Studio E2E.
9. Implement automatic project-doc template seeding.
10. Only with explicit permission, decide on Windows browser autostart installation.
