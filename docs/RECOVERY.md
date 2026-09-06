# Bridge Recovery Guide

Use this when chat context is lost, Git/Deploy state diverges, the PC restarts, or an agent is unsure what to trust.

## A. Replacement chat/agent recovery

1. Read `START_HERE.md`.
2. Read `AGENTS.md`.
3. Read `docs/HANDOFF.md`.
4. Read `docs/ROADMAP.md`.
5. Verify GitHub `main` HEAD; do not assume the handoff's commit is still current.
6. Verify live Railway deployment commit hash.
7. If PC-dependent work is next, verify whether the PC is powered/online before diagnosing worker issues.
8. Continue only from an item explicitly marked unfinished/blocked.

Do not ask the human to re-explain the entire project unless documentation is genuinely incomplete.

## B. GitHub and Railway disagree

If GitHub `main` and Railway are on different commits:

1. Fetch both commit IDs and ancestry.
2. Compare diffs.
3. Determine which commit contains the intended latest fixes.
4. Never deploy the older GitHub head merely because it is called `main`.
5. Restore one canonical forward history through a branch/PR or safe fast-forward.
6. Verify CI.
7. Deploy/verify the exact canonical commit.
8. Update `docs/HANDOFF.md` with the resolved commit IDs.

Avoid force moves unless required and explicitly justified.

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

Do not reinstall everything when only one stage failed.

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
