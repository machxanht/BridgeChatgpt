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

Bridge is a monorepo-style special case: `.git`, root `package.json`, runtime folders, and project-wide docs live at `E:\AI\Bridge`, so Bridge's own executor jobs use cwd `.`. Independent managed projects use `Apps/<ProjectName>`.

## Human decisions that must be preserved

- Use ChatGPT Web/browser integration; ChatGPT Desktop automation is out of scope.
- Every independent project belongs under `Apps/<ProjectName>`.
- Durable Markdown handoff is mandatory for every project.
- One paired PC executor serves all Bridge projects without re-pairing per project.
- Agents, RDC, executor jobs, and browser automation must remain within approved Bridge scope unless the human explicitly grants a new scope.
- Do not report PC work as completed while the PC has no power.

## Canonical production state before final offline-prep PR #6

GitHub `main`:

```text
e9ded0194b0c790598919e1a11f819a056b88565
```

Railway deployment:

```text
ecd68879-3976-40ed-84a5-a10c3f9cb38f
```

Status: `SUCCESS`

Persistent DB startup verified from:

```text
/app/data/bridge.sqlite
```

## Final offline-prep PR

PR: `#6` — `fix: keep Bridge executor jobs at repo root`

Branch:

```text
fix/bridge-executor-cwd
```

This PR is intended to contain the last planned source changes before the PC returns.

Implemented in this PR:

- Bridge own jobs resolve to cwd `.`.
- Independent project jobs resolve to `Apps/<ProjectName>`.
- Invalid project paths outside `Apps/` are rejected.
- REST/UI executor jobs, Executor MCP jobs, and GitHub command-bus jobs all receive server-enforced project cwd.
- Project bootstrap is the only intentional root-level exception because it must create the new `Apps/<ProjectName>` directory.
- New project bootstrap uses `Apps/BridgeChatgpt/scripts/clone-project.mjs` to clone the repository and copy only missing files from `Apps/_TEMPLATE/`.
- Existing project files are never overwritten by template seeding.
- Template seeding does not automatically commit or push.
- Regression coverage includes Bridge root cwd, independent project cwd, normalization, and path-escape rejection.
- The project bootstrap script is syntax-checked in the normal test suite.
- `docs/PRE_POWER_RETURN_CHECKLIST.md` defines the authoritative live-test sequence.

## Multi-project executor state

Implemented and CI-covered:

- pairing is machine-scoped by `node_id`;
- original pairing workspace/project remains metadata only;
- the same PC node can claim jobs for another workspace/project without re-pairing;
- project snapshots expose the shared PC while project job history remains filtered;
- normal controller paths cannot choose an arbitrary cwd;
- local executor path resolution still prevents escaping the approved root.

## Browser-agent static state

Static review completed while PC was off:

- Bridge Wake manifest permits Railway Bridge, ChatGPT Web, and Google AI Studio targets;
- wake queue emits exact bound resource URLs and single-flight task instructions;
- service worker can open/find the exact target tab, detect a safe composer, inject a prompt, attempt send, and suppress rapid duplicate delivery;
- Studio relay supports bound instance registration, task claiming, progress, result submission, and conflict-safe artifacts.

No additional source-level blocker was identified in this static review. Remaining browser-agent work is live E2E verification with the real logged-in browser.

## PC state

The PC is currently without power. Therefore:

- executor offline is expected;
- RDC offline is expected;
- no register/claim traffic is expected;
- the queued `git pull --ff-only` sync cannot complete yet.

A command-bus fast-forward sync command already exists. Because it uses `git pull --ff-only`, it will pull the latest reachable `main` when the worker actually executes it.

## Remaining work after PR #6 merges and Railway deploys its exact final SHA

No planned source edits remain before the PC returns.

Only live verification should remain:

1. PC powers on and Windows login occurs if required.
2. Background executor reconnects without manual source edits.
3. Queued `git pull --ff-only` sync completes and local `HEAD` matches GitHub `main`.
4. Bridge Git status/test/build succeed from repo root `.`.
5. A second real project proves same-node multi-project routing from `Apps/<ProjectName>`.
6. New-project template seeding is live-proven without overwriting existing docs.
7. ChatGPT Web wake/injection/scoped-PC/result E2E is tested.
8. Google AI Studio wake/relay/result E2E is tested.
9. Actual evidence is recorded in this file and `docs/ROADMAP.md`.

Use `docs/PRE_POWER_RETURN_CHECKLIST.md` as the authoritative sequence.

## Intentionally not auto-installed

Browser/executor startup mechanisms that require writing Windows user/system locations outside `E:\AI\Bridge` need explicit narrow permission first. Do not use RDC to bypass this rule.

## Security reminder

Never put raw Bridge/Railway/executor tokens, passwords, cookies, private keys, or browser credentials in Markdown. Do not use RDC or another tool outside `E:\AI\Bridge` without explicit permission.
