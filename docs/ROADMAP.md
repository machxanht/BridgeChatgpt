# Bridge Roadmap and Completion Matrix

Status legend:

- ✅ PASS / proven
- 🟢 implemented, may still need live verification
- 🟡 partial / in progress
- 🔴 blocked / broken
- ⬜ not started

## Core platform

### ✅ Railway control plane

Production server architecture, persistent state, project registry, executor API, wake queue, Studio relay, and web UI exist and have previously run successfully on Railway.

Completion criterion going forward: every production change must be verified against the exact Railway deployment commit hash.

### ✅ Project layout under Apps

Bridge source lives under `Apps/BridgeChatgpt` and new projects use readable `Apps/<ProjectName>` paths.

### 🟢 Nested project Git isolation

Bridge `.gitignore` is configured so independent `Apps/<Project>` repos do not pollute the Bridge parent repository while keeping Bridge + templates tracked.

Acceptance test: clone/create a second project and confirm parent Bridge `git status` remains clean.

## PC execution

### 🟢 One PC executor for all projects

Machine-scoped executor routing is being implemented so one paired `node_id` can accept jobs from multiple workspaces/projects. Project identity remains on each job.

Acceptance tests:

- node originally paired to Project A appears in Project B PC Control;
- Project B job can be assigned to that node;
- worker claims Project B job without re-pairing;
- result remains associated with Project B;
- no project path can escape the approved root.

### 🟢 Controller project cwd scoping

Controller-created jobs are forced to the workspace `local_path` (`Apps/<ProjectName>`).

Acceptance test: project A and B `git.status` commands report their own repositories, not the Bridge root or each other.

### 🟡 PC startup after reboot/power loss

A background executor startup path existed previously, but complete reboot/login proof is not durable yet.

Current known condition: the PC was reported without power from approximately 07:00 UTC+7 on 2026-09-06. Worker offline during that period is therefore expected and not evidence of a Bridge server failure.

Acceptance test after power returns:

- login Windows if required;
- no manual executor terminal launch;
- Railway receives repeated register/claim traffic;
- PC Control reports node online.

## Browser agents

### 🟢 Bridge Wake extension

Extension code can poll wake queue, open/find ChatGPT/AI Studio targets, inject prompt, and attempt send.

### 🟡 Browser startup persistence

The extension runs after the Bridge browser starts, but reliable automatic browser launch after Windows reboot is not yet proven.

Security blocker: installing anything into Windows Startup/Task Scheduler/user profile paths is outside ordinary approved project-root filesystem scope. Obtain explicit narrow permission before installing system/user startup configuration.

### 🟡 ChatGPT Web E2E

Browser is the selected ChatGPT integration. ChatGPT Desktop is intentionally not planned.

Remaining acceptance test:

```text
Tablet task
→ Bridge task
→ wake bound ChatGPT conversation
→ prompt sent
→ agent interprets
→ scoped PC action
→ result returned
```

### 🟡 Google AI Studio E2E

Relay/source support exists, but final browser wake + task/result flow must be proven live for the selected Studio app.

## Project onboarding

### ✅ Mandatory Markdown handoff standard

Bridge defines required durable documentation for every project.

### 🟢 Project template

`Apps/_TEMPLATE/` should contain the required document skeleton for new projects.

### ⬜ Automatic template seeding into newly cloned projects

Desired future behavior: after project clone succeeds, Bridge initializes missing handoff docs from the template without overwriting existing project documentation.

Important: committing/pushing those docs into each project's own repository should be explicit and must respect that project's Git state/credentials.

## Tablet UX

### ✅ Single primary Bridge Chat

Current intended layout uses one primary composer and a separate PC Control panel.

### ✅ PC Control

Executor jobs, status, Git/test/build controls and repo sync are available.

### 🟡 Status wording cleanup

Some older UI feedback strings may still use historical labels such as “System Details”. These should be normalized to current terminology (`PC Control`) when encountered.

## Operational documentation

### ✅ START_HERE / agent operating contract

Replacement sessions have a deterministic recovery entrypoint.

### 🟢 Full runbook/handoff set

Architecture, security, operations, roadmap, project standard and handoff documents are being committed alongside the multi-project executor change.

## Deferred / intentionally out of scope

### ⬜ ChatGPT Desktop automation

Not planned. Browser integration is preferred and should be completed first.

## Recommended execution order

1. Finish CI for machine-scoped multi-project executor.
2. Merge canonical GitHub `main` so it contains the Railway-running Apps fix plus current changes.
3. Deploy/verify exact merged commit on Railway.
4. Queue a fast-forward PC sync; it will execute when the PC is powered and executor returns.
5. Verify one PC node works for a second project without re-pairing.
6. Verify executor startup after real power return/login.
7. Bind/test ChatGPT Web E2E.
8. Bind/test AI Studio E2E.
9. With explicit permission, decide whether to install browser autostart outside the Bridge root.
