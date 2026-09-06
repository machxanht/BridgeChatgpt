# Bridge Recovery Guide

Use this when chat context is lost, Git/Deploy state diverges, the PC restarts, an agent is unsure what to trust, or a normal free/included operating path breaks.

## 0. Mandatory recovery cost/reuse rule

Read `docs/FREE_FIRST_POLICY.md` first. Recovery is not permission to spend money/quota.

- Do not call a paid/quota API or provider AI Agent as a shortcut without explicit prior user approval.
- Before inventing a new recovery mechanism, search this repository for an existing one.
- If two targeted attempts fail or recovery is dragging, search trusted public repos, official docs, and the internet for a maintained compatible solution before writing more custom machinery.
- Prefer deterministic free/included Git/platform/browser/local paths.

## A. Replacement chat/agent recovery

1. Read `START_HERE.md`.
2. Read `AGENTS.md`.
3. Read `docs/FREE_FIRST_POLICY.md`.
4. Read `docs/HANDOFF.md`.
5. Read `docs/ROADMAP.md`.
6. Verify GitHub `main` HEAD; do not assume the handoff's commit is still current.
7. Verify live Railway deployment commit hash.
8. If PC-dependent work is next, verify whether the PC is powered/online before diagnosing worker issues.
9. Continue only from an item explicitly marked unfinished/blocked.

Do not ask the human to re-explain the entire project unless documentation is genuinely incomplete.

## B. GitHub and Railway disagree

If GitHub `main` and Railway are on different commits:

1. Fetch both commit IDs and ancestry.
2. Compare diffs.
3. Determine which commit contains the intended latest fixes.
4. Never deploy the older GitHub head merely because it is called `main`.
5. Restore one canonical forward history through a branch/PR or safe fast-forward.
6. Verify CI.
7. Use a deterministic free/included deploy path for the exact canonical commit.
8. Verify deployment commit hash.
9. Update `docs/HANDOFF.md` with the resolved commit IDs.

Do not invoke Railway AI Agent simply because normal deployment is inconvenient. Railway AI Agent use requires explicit prior user approval when it consumes separate quota. Avoid force moves unless required and explicitly justified.

## C. PC power loss / reboot

After power returns:

1. Confirm Windows boots.
2. Log in if startup requires a user session.
3. Wait for Local Executor startup path.
4. Check Bridge PC Control.
5. Confirm Railway receives executor register/claim traffic.
6. If the worker does not return, inspect startup configuration only within authorized scope; obtain explicit permission for system/user folders if needed.
7. Sync Bridge repo with fast-forward-only pull.
8. Verify a harmless project-scoped action.

## D. PC executor works for Bridge but not another project

Expected architecture: one physical PC node serves all `Apps/<Project>` workspaces.

Check:

- active project has correct `local_path`;
- project snapshot exposes the shared PC node;
- job is assigned to that `node_id`;
- job retains the target workspace/project IDs;
- job `cwd` equals target workspace `local_path`;
- executor rejects path escape attempts.

Do not solve this by pairing the same PC separately for every project.

## E. Wrong-project execution

If an action runs in the wrong repository:

1. Stop write/build operations for that project.
2. Inspect workspace `local_path`.
3. Inspect queued job payload `cwd`.
4. Inspect executor result `cwd`.
5. Do not perform cleanup until exact unintended changes are known.
6. Use Git status/diff in the affected repo to assess impact.

## F. Browser Wake failure

Separate the stages:

1. Is the Bridge browser running?
2. Is the extension polling `/wake-queue`?
3. Does the project have a valid bound ChatGPT/Studio URL?
4. Does the extension open/find the correct tab?
5. Is the page logged in?
6. Is the composer busy or holding a draft?
7. Did DOM selectors find composer/send control?
8. Was task/result state updated?

Do not reinstall/rebuild everything when only one stage failed. Check the existing extension code and compatible public implementations/selectors before replacing the design. Do not replace browser wake with a metered LLM API without explicit approval.

## G. Persistent Railway state issue

Expected persistent path:

```text
/app/data
```

Expected DB file:

```text
/app/data/bridge.sqlite
```

If state appears reset after deploy, verify volume mount and configured data/store paths before creating replacement state.

## H. Documentation drift

If source and docs disagree:

- treat docs as potentially stale, not authoritative over code;
- inspect actual source and live state;
- fix the docs in the same change that resolves the discrepancy;
- record what was stale in `docs/HANDOFF.md`.

## I. Secret exposure

If a raw secret was committed:

1. Stop copying/repeating it.
2. Rotate/revoke it at the provider.
3. Remove it from current source/documentation.
4. Assess Git history exposure.
5. Do not publish the replacement secret in handoff docs.

## J. Unapproved paid/quota usage

If an agent accidentally consumes a paid API or AI-Agent quota without explicit approval:

1. Stop further use immediately.
2. Record which service was used and what action caused consumption; do not expose secrets.
3. Do not buy/increase quota automatically.
4. Return to the free/included path.
5. Search existing repo/public solutions for a non-metered replacement.
6. Update `docs/HANDOFF.md` and the relevant runbook/roadmap so another agent does not repeat it.
