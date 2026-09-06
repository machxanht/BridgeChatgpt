# Final Offline Snapshot — 2026-09-06

This is the durable checkpoint to use if the current ChatGPT session disappears before the Windows PC returns.

> **Mandatory current policy:** this historical snapshot is subordinate to `docs/FREE_FIRST_POLICY.md`. Do not use Railway AI Agent, another provider AI Agent, or any paid/quota API as a fallback without explicit prior user approval. Prefer deterministic free/included deploy/control paths. If implementation/troubleshooting drags, search the current repo first, then trusted public repos/docs/internet, and reuse a compatible existing solution before rebuilding.

## Final GitHub source baseline

PR #6 passed full Bridge CI and was squash-merged.

Source-code baseline:

```text
07e421be4154b8dac4996a9c1f7a5ca66acf7890
```

PR #6 final CI run:

```text
34015619832
```

Result: PASS

Verified gates:

- Typecheck
- Tests
- Build
- Bridge Wake package
- Bridge Wake artifact upload
- Production startup smoke test

No additional planned source-code edits remain before the PC returns, except later policy/deployment work recorded in current `docs/HANDOFF.md`.

## What the final source implements

- Bridge's own executor jobs use cwd `.` because `.git` and the root `package.json` live at `E:\AI\Bridge`.
- Independent projects use cwd `Apps/<ProjectName>`.
- REST/UI, Executor MCP, and GitHub command-bus executor jobs are server-scoped to the registered workspace cwd.
- Independent paths outside `Apps/` are rejected.
- One paired PC node is reusable across projects without re-pairing.
- Project bootstrap is the intentional root-level exception because it must create a new `Apps/<ProjectName>` directory.
- New project bootstrap clones the repository and seeds only missing durable handoff files from `Apps/_TEMPLATE/`.
- Template seeding never overwrites existing project files and does not automatically commit or push.
- Browser Wake / ChatGPT Web / AI Studio static logic was reviewed while the PC was off; no additional known source blocker was found.
- `docs/PRE_POWER_RETURN_CHECKLIST.md` is the authoritative live verification sequence.

## Railway production — historical blocker

Latest proven Railway deployment at this snapshot was:

```text
Deployment: ecd68879-3976-40ed-84a5-a10c3f9cb38f
Commit:     e9ded0194b0c790598919e1a11f819a056b88565
Status:     SUCCESS
```

Persistent database startup was proven from:

```text
/app/data/bridge.sqlite
```

The source baseline `07e421...` had NOT yet been proven deployed to Railway at the time of this snapshot.

Historical reason:

- automatic Railway deploy did not trigger after PR #6 merged;
- Railway AI Agent was used during troubleshooting and returned `Agent usage limit reached`;
- Railway service config still reported a stale source commit SHA (`11943b...`);
- generic Railway Redeploy was deliberately avoided because it could rebuild an older deployment source snapshot.

**Current policy correction:** Railway AI Agent must no longer be treated as a normal deploy/fix path. A deterministic free/included Git/platform-native deploy route must be preferred. Any future use of a paid/quota AI Agent requires explicit prior user approval.

## PC state and queued sync

The Windows PC was without power at this snapshot. Executor/RDC offline was expected.

A fast-forward-only sync command already existed:

```text
git pull --ff-only
```

Do not report this sync as completed until the worker returns and the job result is observed.

## When the PC returns

Do not begin by editing source. Read current `START_HERE.md`, `docs/FREE_FIRST_POLICY.md`, `docs/HANDOFF.md`, then execute:

```text
docs/PRE_POWER_RETURN_CHECKLIST.md
```

Expected remaining work is live verification only unless current handoff states otherwise.

## Security and cost boundary

Approved filesystem scope remains:

```text
E:\AI\Bridge
```

Do not use RDC, shell, or other tools outside this root without explicit new human permission. Never store raw credentials, cookies, tokens, or private keys in Markdown. Never spend paid API/AI-Agent quota without explicit prior approval.
