# BridgeChatgpt Handoff

> Primary replacement-session document. Read this after `START_HERE.md`. Update it after every substantial architecture, deployment, security, or live-state change.

## Snapshot

Date: 2026-09-06 (UTC+7)

Repository: `machxanht/BridgeChatgpt`

Production URL: `https://bridgechatgpt-production.up.railway.app`

Approved PC root:

```text
E:\AI\Bridge
```

Bridge application source:

```text
E:\AI\Bridge\Apps\BridgeChatgpt
```

Important monorepo detail: `.git`, root `package.json`, runtime state folders, and project-wide docs live at `E:\AI\Bridge`, so Bridge's own executor jobs must run with cwd `.`. Independent managed projects run from `Apps/<ProjectName>`.

## Human decisions that must be preserved

- Use ChatGPT Web/browser integration; ChatGPT Desktop automation is out of scope.
- Every independent project belongs under `Apps/<ProjectName>`.
- Durable Markdown handoff is mandatory for every project.
- One paired PC executor should serve all Bridge projects without re-pairing per project.
- Agents, RDC, executor jobs, and browser automation must remain within the approved Bridge scope unless the human explicitly grants a new scope.
- Do not report PC work as completed while the PC has no power.

## Canonical state before this final offline-prep PR

GitHub `main`:

```text
e9ded0194b0c790598919e1a11f819a056b88565
```

Railway deployment:

```text
ecd68879-3976-40ed-84a5-a10c3f9cb38f
```

Railway status: `SUCCESS`

Railway exact commit: `e9ded0194b0c790598919e1a11f819a056b88565`

Persistent DB startup was verified from:

```text
/app/data/bridge.sqlite
```

## Final offline-prep branch

Branch:

```text
fix/bridge-executor-cwd
```

Purpose: remove the last known source-level issue before PC power returns.

Implemented:

- `executorCwdForWorkspace()` routes Bridge's own jobs to repo root `.`.
- Independent projects remain scoped to `Apps/<ProjectName>`.
- Independent project paths outside `Apps/` are rejected.
- Regression tests cover Bridge root cwd, independent project cwd, normalization, and path escape rejection.
- `docs/PRE_POWER_RETURN_CHECKLIST.md` defines the exact live verification sequence.

CI run for this branch:

```text
34015330502
```

Result: **PASS**

Verified:

- Typecheck ✅
- Tests ✅
- Build ✅
- Bridge Wake package ✅
- Bridge Wake artifact upload ✅
- Production startup smoke test ✅

## Multi-project executor state

Implemented and CI-tested:

- pairing is machine-scoped by `node_id`;
- original pairing workspace/project remains metadata only;
- the same PC node can claim jobs for another workspace/project without re-pairing;
- project snapshots expose the shared PC while project job history remains filtered;
- controller jobs are assigned a safe project cwd;
- local executor path resolution still prevents escaping the approved root.

## Browser-agent static state

Static review completed while the PC was off:

- Bridge Wake manifest has permissions for Railway Bridge, ChatGPT Web, and Google AI Studio;
- wake queue emits exact bound resource URLs and single-flight task instructions;
- service worker can open/find the exact resource tab, detect a safe composer, inject a prompt, attempt send, and suppress rapid duplicate delivery;
- Studio relay supports bound instance registration, task claiming, progress, result submission, and conflict-safe artifacts.

No additional source-level blocker was identified in this static review. The remaining browser-agent work is live E2E verification with the real logged-in browser.

## PC state

The user reported the PC lost power from approximately 07:00 UTC+7 on 2026-09-06.

Until power returns:

- executor offline is expected;
- RDC offline is expected;
- no register/claim traffic is expected;
- the queued `git pull --ff-only` sync cannot complete.

A command-bus fast-forward sync command already exists. Because it uses `git pull --ff-only`, it should pull whatever latest `main` exists when the worker actually executes it.

## Remaining work after this PR merges/deploys

Only physical-PC/browser verification should remain:

1. PC powers on and Windows login occurs if required.
2. Background executor reconnects without manual source edits.
3. Queued `git pull --ff-only` sync completes and local `HEAD` matches GitHub `main`.
4. Bridge Git status/test/build succeed from repo root `.`.
5. A second real project runs a harmless Git status from `Apps/<ProjectName>` on the same paired PC node.
6. ChatGPT Web wake/injection/scoped-PC/result E2E is tested.
7. Google AI Studio wake/relay/result E2E is tested.
8. Record actual evidence in this file and `docs/ROADMAP.md`.

Use `docs/PRE_POWER_RETURN_CHECKLIST.md` as the authoritative test sequence.

## Still intentionally not auto-installed

Browser or executor startup mechanisms that require writing Windows user/system locations outside `E:\AI\Bridge` need explicit narrow permission first. Do not use RDC to bypass this rule.

## Security reminder

Never put raw Bridge/Railway/executor tokens, passwords, cookies, private keys, or browser credentials in Markdown. Do not use RDC or another tool outside `E:\AI\Bridge` without explicit permission.
