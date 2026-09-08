# Bridge handoff — Agent workspace capability

Date: 2026-09-08
Repo: machxanht/BridgeChatgpt
Canonical source: GitHub `main`
Active WIP branch: `feat/agent-capability-smoke`

## Mission
Bridge must behave as one unified multi-agent workspace. Every bound ChatGPT/AI Studio agent must know exactly which project/workspace/root it belongs to, be able to prove its real read/write capabilities, and return results through Bridge. The design must be generic for future projects, not hard-coded to BridgeChatgpt.

## Architecture contract
GitHub is the sole source of truth. PC and AI Studio sync FROM GitHub. Workspace copies are mirrors. Each task is bound to `workspace_id`, `project_id`, and `agent_instance_id`. Workspace registry supplies `project_name`, `repository_url`, `branch`, `local_path` (root folder), and `execution_target`. A coding agent must sync the declared GitHub branch before reading/editing code. If `START_HERE.md` or `.bridge/project.json` exists, read it before coding. Never guess another project/root.

## Completed work
Main contains commit `118efde6c5ecb4cb027dde4d8c869f08d2151ce4` (`fix(agents): bootstrap unified workspace context`). `Apps/BridgeChatgpt/server/wakeQueue.ts` now injects a `BRIDGE WORKSPACE CONTEXT` into ChatGPT and Studio wake prompts containing workspace/project/repo/branch/root/execution target/provider/agent instance and the rules above. Studio prompts retain pre-task GitHub sync before claim.

Earlier UI change on main: commit `33b53cdf4c74ebc0979ba14cc3f3b1cdeb20e143`; `BridgeChatPanelV2.tsx` Auto mode dispatches the same user message to both latest ChatGPT target and first Studio target as separate bound tasks. Build for that UI change passed. Do not generate images for code/UI work unless user explicitly asks.

## Current problem
Bridge UI can show ChatGPT/Studio as `ready` while real end-to-end replies fail. `ready` therefore must NOT be treated as proof of capability. User also observed agents can answer as generic agents and may not know what they can do in the bound Bridge project. Need real capability proof.

## Capability feature required
Implement a generic Workspace Capability Smoke Test per bound target. Required capability dimensions:
- `workspace_read`: can read the exact bound workspace/root.
- `workspace_write`: can create/write in that workspace/root.
- `github_read`: can read canonical GitHub project.
- `github_write`: can actually commit/write to canonical GitHub when that agent/tool path supports it.

Do not infer PASS from agent text. Verification must be mechanical. Smoke flow: generate nonce; ask the exact bound agent to READ a known project file and WRITE a temporary nonce file such as `.bridge/capability-smoke/<target-id>-<nonce>.txt`; independently verify existence/content; clean up the temp file; persist/report each capability separately. A target may legitimately be workspace RW but GitHub write false, etc. UI/API should never collapse this into generic `ready`.

## WIP branch/checkpoint
Branch `feat/agent-capability-smoke` was created from main after the workspace bootstrap commit. No capability implementation has been committed yet; only this handoff doc. Initial inspection identified the minimal integration points:
- `Apps/BridgeChatgpt/server/resourceRoutes.ts`: resource/workspace/target API. Existing routes include GET `/`, GET `/wake-queue`, POST `/projects`, POST `/projects/:workspace_id/setup`, POST `/targets`, DELETE `/targets/:target_id`.
- `Apps/BridgeChatgpt/server/resourceRegistry.ts`: `ResourceTargetRecord`, `ResourceTargetView`, `ResourceRegistrySnapshot`, `upsertResourceTarget()`, `getResourceRegistry()`. Snapshot already joins workspace metadata and target state.
- `Apps/BridgeChatgpt/server/db.ts`: `createTask()` available for creating a specifically bound smoke task if needed.
- `Apps/BridgeChatgpt/server/wakeQueue.ts`: already understands task binding and exact target routing.

Suggested shortest implementation: add a small capability-smoke module/store plus resource routes to start/read a smoke test. Reuse existing task binding/wake routing rather than inventing a second agent transport. Ensure smoke tasks are recognizable so wakeQueue gives exact instructions and does not run normal coding workflow. Verification/cleanup should be server-side where possible. Persist result keyed by workspace + target, including timestamps and individual booleans/status/reason.

## Local PC warning
Primary local repo is `E:\AI\Bridge`. At checkpoint it has unrelated tracked local modification `Apps/BridgeChatgpt/scripts/cli-agent-worker.mjs` plus many intentional/untracked runtime files. A checkout of the WIP branch was correctly aborted to avoid overwriting that change. DO NOT stash/delete/reset unrelated user work. A clean temporary clone was created at `E:\AI\Bridge-cap-smoke` on branch `feat/agent-capability-smoke`, HEAD initially `118efde`. Continue there for local build/test if it still exists. Local git credentials may be wrong for push; use the connected GitHub connector for canonical writes.

## Production / E2E status
Production URL: `https://bridgechatgpt-production.up.railway.app/`. Do not claim latest commit is deployed merely because a Railway deployment says SUCCESS. Latest real agent E2E is NOT proven PASS. Prior acceptance criterion: actual task must be received/claimed, result returned through Bridge, task terminal/completed, no fake manual completion. User does not want to be asked to test if we can self-test.

Known Studio app ID: `15c1d80d-6265-47e1-bdf2-e30fb7bf430c`; project `gen-lang-client-0231333816`. PC Studio URL uses `/u/1/apps/...`; tablet uses `/u/3/apps/...`. Correct ChatGPT conversation ID: `6a9e55a5-3f44-83ec-9a4e-c533c4427bae`. Do not reconstruct URLs from IDs when exact registered resource URL exists.

## Quality gate / completion
Keep scope small. Implement exact feature, run relevant build/tests from repo root (package.json is at `E:\AI\Bridge` / temp clone root, NOT `Apps/BridgeChatgpt`). Do not repeat the known-bad `npm test --prefix Apps/BridgeChatgpt`. Open PR from `feat/agent-capability-smoke` to main after tests. Merge only with passing required checks / project flow. Then verify production only as needed and run a real capability/E2E test for ChatGPT and Studio. Report PASS only with mechanical evidence.

## Working rules
FAST PATH, NOT SHORTCUTS. No repo-wide audit unless genuinely blocked. Do not restart completed work. Do not create duplicate task/branch/PR. Preserve existing local changes. No Codex unless explicitly requested. No image generation unless explicitly requested. Do not expose or ask user to paste secrets/tokens.
