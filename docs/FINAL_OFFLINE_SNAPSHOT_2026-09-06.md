# Final Offline Snapshot — 2026-09-06

This is the durable checkpoint to use if the current ChatGPT session disappears before the Windows PC returns.

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

No additional planned source-code edits remain before the PC returns.

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

## Railway production — current blocker

Latest proven Railway deployment remains:

```text
Deployment: ecd68879-3976-40ed-84a5-a10c3f9cb38f
Commit:     e9ded0194b0c790598919e1a11f819a056b88565
Status:     SUCCESS
```

Persistent database startup was proven from:

```text
/app/data/bridge.sqlite
```

The final source baseline `07e421...` has NOT yet been proven deployed to Railway.

Reason:

- automatic Railway deploy did not trigger after PR #6 merged;
- the Railway AI agent was asked to deploy exact commit `07e421...` but returned `Agent usage limit reached`;
- Railway service config still reports a stale source commit SHA (`11943b...`);
- do not use generic Railway Redeploy for this purpose: Railway documents Redeploy as rebuilding a deployment from that deployment's original source code, which can reproduce an older source snapshot.

Safe action when Railway exact-deploy capability is available again:

1. deploy the exact latest GitHub source/main commit through a mechanism that explicitly accepts the desired commit SHA;
2. do not change variables, volume, domain, healthcheck, restart policy, or start command;
3. verify Railway deployment status is SUCCESS;
4. verify deployment metadata `commitHash` equals the intended GitHub commit before starting final PC E2E tests.

## PC state and queued sync

The Windows PC is currently without power. Executor/RDC offline is expected.

A fast-forward-only sync command already exists:

```text
git pull --ff-only
```

Do not report this sync as completed until the worker returns and the job result is observed.

## When the PC returns

Do not begin by editing source. Read and execute:

```text
docs/PRE_POWER_RETURN_CHECKLIST.md
```

Expected remaining work is live verification only:

1. executor reconnect;
2. queued Git sync and local HEAD verification;
3. Bridge Git status/test/build from cwd `.`;
4. second-project shared-node + `Apps/<ProjectName>` cwd proof;
5. new-project template seed proof without overwrite;
6. ChatGPT Web wake/injection/scoped-PC/result E2E;
7. AI Studio wake/relay/result E2E;
8. record actual PASS/FAIL evidence in HANDOFF/ROADMAP.

Only modify source if a live test reveals an unexpected defect.

## Security boundary

Approved filesystem scope remains:

```text
E:\AI\Bridge
```

Do not use RDC, shell, or other tools outside this root without explicit new human permission. Never store raw credentials, cookies, tokens, or private keys in Markdown.
