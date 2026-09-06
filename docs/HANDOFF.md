# BridgeChatgpt Handoff

> This is the primary replacement-session document. Update it whenever a substantial architecture/deployment/state change occurs.

## Snapshot

Date: 2026-09-06 (UTC+7 context)

Repository: `machxanht/BridgeChatgpt`

Production URL: `https://bridgechatgpt-production.up.railway.app`

Approved PC root:

```text
E:\AI\Bridge
```

Bridge source path:

```text
E:\AI\Bridge\Apps\BridgeChatgpt
```

## Current human decisions

- Use **browser integration** for ChatGPT; do not spend time on ChatGPT Desktop automation.
- Every project belongs under `Apps/<ProjectName>` for easy management.
- A durable Markdown handoff is mandatory so another chat/agent can replace the current one without reconstructing history from the user.
- The same documentation rule applies to every future project.
- Agents/RDC/PC automation must stay within approved Bridge folders unless the human explicitly expands scope.

## Known infrastructure state before this work branch

### Railway

A production deployment had been verified `SUCCESS` for commit:

```text
b6a1d0812aba8aa54681adc783c377da904992c1
```

That commit ensures project creation uses `Apps/<ProjectName>` regardless of PC/Studio execution target.

Persistent Railway state previously loaded from:

```text
/app/data/bridge.sqlite
```

### GitHub divergence discovered

During this handoff/multi-project work, GitHub `main` was observed pointing to:

```text
1b6f22460debd74216d83b16bb6ecb9741fdf838
```

while Railway was running descendant commit `b6a1d081...`.

The current feature branch was deliberately fast-forwarded to `b6a1d081...` before new work so the fix is preserved. Do not redeploy from the stale GitHub `main` state until the canonical branch is repaired/merged forward.

## PC state

The user reported the PC lost power from approximately **07:00 UTC+7 on 2026-09-06**.

Therefore:

- executor offline during this interval is expected;
- RDC offline during this interval is expected;
- lack of worker poll traffic does **not** imply Railway/Bridge failure.

Do not attempt PC live verification until power is restored.

## Work implemented on the current feature branch

Branch:

```text
feat/handoff-and-multiproject-pc
```

### Multi-project PC executor

Implemented changes include:

- executor node is treated as machine-scoped rather than requiring a new pairing per project;
- existing pairing metadata remains for backward compatibility/audit;
- a job can retain Project B workspace/project IDs while being assigned to a PC originally paired from Project A;
- project snapshots expose the shared PC node while keeping job history filtered to the active project;
- controller-created jobs force `cwd` to the workspace `local_path` (`Apps/<ProjectName>`);
- project setup jobs are recorded against the newly created workspace/project instead of the PC's original pairing project;
- regression test added for Project A PC → Project B job claim;
- Bridge parent `.gitignore` ignores independent nested `Apps/*` project repos while tracking Bridge and the standard template.

### Durable documentation

Added/rewritten:

- `START_HERE.md`
- `AGENTS.md`
- `docs/ARCHITECTURE.md`
- `docs/SECURITY.md`
- `docs/RUNBOOK.md`
- `docs/PROJECT_STANDARD.md`
- `docs/ROADMAP.md`
- `docs/HANDOFF.md`

Template docs under `Apps/_TEMPLATE/` are part of this same work item.

## What is NOT yet proven

At the time this handoff entry was written:

- CI for the full feature branch has not yet been recorded as PASS here.
- Feature branch has not yet been merged into canonical GitHub `main`.
- Railway has not yet been verified on the final merged multi-project/handoff commit.
- PC has not synced these changes because the PC has no power.
- One physical PC serving a second real project has not yet been live-proven.
- Executor reboot/power-return autostart remains unproven.
- ChatGPT Web full E2E remains unproven.
- AI Studio full E2E remains unproven.
- Browser automatic startup after Windows reboot is not installed/proven; system/user startup configuration would require explicit scope permission.

## Immediate next steps

1. Finish template docs.
2. Run GitHub CI for the feature branch.
3. Fix any CI regression.
4. Merge through a PR, preferably squash/clean merge.
5. Verify GitHub `main` now includes the previously missing `b6a1d081...` Apps fix.
6. Verify Railway deploys the exact merged commit.
7. Queue a `git pull --ff-only` sync job for the PC so it waits while the PC is off and executes after the worker returns.
8. When power returns, verify executor online and run one cross-project harmless job.
9. Continue ChatGPT Web/Studio binding and E2E work.

## Important security reminder

Do not store Bridge/Railway/executor raw token values in this file. Do not use RDC or any other tool to browse outside `E:\AI\Bridge` without explicit new permission.
