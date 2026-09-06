# Bridge Roadmap and Completion Matrix

Status legend:

- ✅ PASS / proven
- 🟢 implemented, live verification still needed
- 🟡 live verification pending
- ⬜ intentionally not started / deferred

## Mandatory cost/reuse gate

All roadmap work follows `docs/FREE_FIRST_POLICY.md`.

- Prefer free/included/browser/local/open-source/repository paths.
- No paid/quota API, token-metered AI API, provider AI Agent, or paid automation without explicit prior user approval.
- If work/troubleshooting starts taking too long, search the current repo first, then trusted public repos/docs/internet, and reuse a maintained compatible solution before expanding custom implementation.
- Routine deploy must be deterministic and free/included; Railway AI Agent is not a routine deployment path.

## Core platform

### ✅ Railway control plane

Production architecture, persistent state, project registry, executor API, wake queue, Studio relay, command bus, and web UI are implemented. Every production change must be verified against the exact Railway deployment `commitHash`.

### ✅ Project layout under Apps

Bridge application source lives under `Apps/BridgeChatgpt`. Independent projects use `Apps/<ProjectName>`.

Bridge is a monorepo-style special case: its `.git` and root `package.json` live at the approved executor root, so Bridge's own executor cwd is `.`.

### 🟢 Nested project Git isolation

Independent `Apps/*` project repos are ignored by the Bridge parent repository while Bridge source and `Apps/_TEMPLATE` remain tracked. A second real project still needs live verification after PC power returns.

## PC execution

### 🟢 One paired PC executor for all projects

Implemented and CI-tested. Pairing is machine-scoped by `node_id`; jobs retain workspace/project identity and do not require re-pairing for each project.

### 🟢 Project cwd scoping on every normal control path

Implemented for:

- Bridge REST/UI executor jobs;
- Executor MCP jobs;
- GitHub command-bus executor jobs.

Rules:

- BridgeChatgpt → cwd `.`;
- independent project → cwd `Apps/<ProjectName>`;
- invalid independent project path outside `Apps/` → rejected.

The only intentional root-level exception is project bootstrap, because it must create the new `Apps/<ProjectName>` directory.

### 🟡 PC startup after real power loss

Background executor startup was previously installed but must be live-proven after the current outage/login. No source change should be needed.

## Browser agents

### 🟢 Bridge Wake extension

Static implementation and review cover wake-queue polling, target tab discovery/opening, prompt injection, send attempt, busy/draft safety, and duplicate-delivery suppression.

### 🟡 ChatGPT Web E2E

Remaining work is live verification with the actual logged-in browser:

```text
Tablet → Bridge task → wake bound ChatGPT conversation → prompt sent
→ ChatGPT interprets → scoped PC action → result returned
```

Browser/subscription integration remains preferred over a metered OpenAI API dependency.

### 🟡 Google AI Studio E2E

Studio relay + bound instance/task/result path are implemented. Remaining work is live browser/Studio verification. Browser/Studio path remains preferred over a metered Gemini API dependency.

### 🟡 Browser startup persistence

Extension handles browser startup, but automatically launching the browser after Windows reboot may require writing outside `E:\AI\Bridge`; that needs explicit narrow permission before installation.

## Project onboarding and durable handoff

### ✅ Mandatory Markdown standard

`AGENTS.md`, `START_HERE.md`, `docs/PROJECT_STANDARD.md`, `docs/FREE_FIRST_POLICY.md`, `docs/HANDOFF.md`, and the rest of the handoff set define the mandatory recovery/cost protocol for every project.

### ✅ Project template

`Apps/_TEMPLATE/` contains the required handoff skeleton and free-first policy references.

### 🟢 Automatic template seeding

Implemented in the project bootstrap flow. After cloning a new project, Bridge copies only missing files from `Apps/_TEMPLATE/` into the new project.

Safety behavior:

- never overwrites an existing project file;
- target must remain under `Apps/`;
- no automatic commit;
- no automatic push.

Live acceptance test remains: create a real second project and confirm missing handoff docs are seeded while existing README/docs remain untouched.

## Deployment / cost control

### 🟡 Deterministic Railway deploy without AI Agent quota

Current requirement: routine deployment must not depend on Railway AI Agent or another paid/quota AI service.

Completion criterion:

- identify/reuse the simplest free/included deterministic Git/platform-native deploy path available to the existing Railway/GitHub setup;
- deploy the exact intended `main` commit without Railway AI Agent;
- verify `SUCCESS` + exact `commitHash`;
- document the procedure in `docs/RUNBOOK.md`;
- no recurring paid API/AI-agent dependency introduced.

Before building new deployment machinery, inspect this repo and trusted existing Railway/GitHub/open-source solutions first.

## Tablet UX

### ✅ Single primary Bridge Chat

One primary composer plus separate PC Control.

### ✅ PC Control

Executor state/jobs plus Git/test/build/repo-sync controls exist.

## Operational documentation

### ✅ Durable replacement-session recovery

Replacement sessions use:

1. `START_HERE.md`
2. `AGENTS.md`
3. `docs/FREE_FIRST_POLICY.md`
4. `docs/HANDOFF.md`
5. `docs/PRE_POWER_RETURN_CHECKLIST.md` when the PC returns.

## Remaining sequence

1. Merge/CI-verify the free-first documentation policy.
2. Establish and prove the deterministic free/included Railway deploy path without provider AI Agent quota.
3. Leave the existing fast-forward PC sync pending while the PC is off.
4. When power returns, perform `docs/PRE_POWER_RETURN_CHECKLIST.md`:
   - executor reconnect;
   - PC Git sync;
   - Bridge git status/test/build;
   - second-project shared-node + cwd + template-seed proof;
   - ChatGPT Web E2E;
   - AI Studio E2E.
5. Record evidence; only fix code if a live test reveals an unexpected defect.

## Intentionally deferred

### ⬜ ChatGPT Desktop automation

Not planned. Browser integration is the selected path.

### ⬜ Windows/browser autostart outside approved root

Requires explicit narrow permission before touching Windows user/system locations.

### ⬜ Paid/quota API fallback

Not a default roadmap item. It may only be considered after explicit prior user approval with cost/quota disclosure and a comparison against the free alternative.

## Fast Chat usability — 2026-09-06

Implemented and locally tested: direct completion at DB/MCP boundary, no chat/debate CI, clean chat answers, Vietnamese wake instructions, ChatGPT-first Auto, explicit-only multi-agent, larger composer. Production deploy and real ChatGPT/Studio E2E remain unproven until deployment evidence is recorded. Awake wake polling requires updated extension code on PC.


## Release result — 2026-09-06 17:28 UTC

- Fix commit: 541e4147caff75669d522e3aef455a0001de07c0; PR #18 merged as b085fe3e2a61e0d236aa7b70c45d84e495fa1487.
- GitHub Bridge CI run 34048566977 SUCCESS (includes typecheck, all tests, build, extension package and production startup smoke).
- Deployment BLOCKED: ordinary Railway redeploy produced deployment d379c0bc-114d-42d2-ae7a-b48f217621b4 SUCCESS but its commitHash is 13f6f640719f812c915fc3a62564e4dc7d720bdf, not the merged fix. Production therefore still has old behavior.
- Current Railway connector does not expose changing service source or deploying latest GitHub commit on the existing service. Its create_deployment tool creates a NEW service (not appropriate); redeploy reuses the old snapshot. Do not repeat redeploy expecting new source.
- Railway CLI is unavailable on the connected Windows PC. No re-login, re-pair, browser profile reset, or Railway AI Agent was used.
- Production browser was opened successfully and old TASK/review metadata was observed. Three real-agent E2E cases for the fix are NOT PROVEN because the fix is not deployed. PC extension 2-second poll is also NOT PROVEN installed/live.
- Next necessary step: deploy the existing Railway service from b085fe3 (or its documentation-only successor), verify actual deployment commitHash, then submit the three specified real chat cases and record answers/latency. Do not rerun the repo audit.
