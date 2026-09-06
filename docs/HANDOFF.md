# BridgeChatgpt Handoff

> Primary replacement-session document. Update it after every substantial architecture, deployment, security, or live-state change.

## Snapshot

Date: 2026-09-06 (UTC+7)

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

## Human decisions that must be preserved

- Use **ChatGPT Web/browser integration**. ChatGPT Desktop automation is intentionally out of scope.
- Every project belongs under `Apps/<ProjectName>`.
- Durable Markdown handoff documentation is mandatory so another chat/agent can replace the current one without asking the user to reconstruct project history.
- The same documentation standard applies to all future projects.
- Agents, RDC, executor jobs, and browser automation must stay within approved Bridge scope unless the human explicitly grants a new scope.

## Canonical GitHub state

PR #4 (`feat: durable handoff docs and shared multi-project PC executor`) passed full Bridge CI and was squash-merged.

Latest verified code baseline before this finalization commit:

```text
84d77dc0f5ab30b74481acaf3801b14b636cc6d2
```

That squash commit contains both:

- the previously deployed `Apps/<ProjectName>` creation fix; and
- the new machine-scoped multi-project PC executor + durable handoff documentation system.

A previous inconsistency where GitHub `main` had regressed behind Railway was therefore repaired. Always re-check GitHub `main` rather than assuming this SHA remains current after future work.

## CI proof

GitHub Actions run:

```text
34014539715
```

Result: **PASS**

Verified steps:

- Typecheck ✅
- Tests ✅
- Build ✅
- Bridge Wake package ✅
- Bridge Wake artifact upload ✅
- Production startup smoke test ✅

## Railway state

Before the finalization commit/deploy, Railway production was still verified `SUCCESS` on:

```text
b6a1d0812aba8aa54681adc783c377da904992c1
```

Production deployment at that point:

```text
c1d60835-85fe-415c-994e-fbaeb0d1c23d
```

Persistent data had previously been proven to load from:

```text
/app/data/bridge.sqlite
```

The next operational step is to deploy the exact final GitHub `main` commit after this handoff/sync finalization is merged, then verify Railway `SUCCESS` using deployment `commitHash`.

## PC state

The user reported that the PC lost power from approximately **07:00 UTC+7 on 2026-09-06**.

Therefore, until power returns:

- executor offline is expected;
- RDC offline is expected;
- no executor register/claim traffic is expected;
- queued PC work must remain pending rather than being reported as completed.

Do not diagnose this as a Bridge server failure.

## Completed implementation

### Apps project organization

- Bridge source is under `Apps/BridgeChatgpt`.
- Every new project registers `Apps/<ProjectName>` as its local path.
- Project creation for both PC and Studio targets can queue a clone into the Apps shelf.
- Independent nested `Apps/*` project repositories are ignored by the Bridge parent Git repository.

### One PC executor for all projects

Implemented and CI-tested:

- PC pairing is treated as machine-scoped by `node_id`.
- Original pairing workspace/project remains only as backward-compatible metadata/audit context.
- The same PC node can be assigned jobs belonging to another workspace/project without re-pairing.
- Project snapshots expose the same PC node while keeping each project's job history filtered.
- Controller-created executor jobs force `cwd` to the active workspace's registered `local_path`.
- PC-side path resolution still rejects cwd/file paths that escape the approved executor root.
- Regression test proves a node originally registered to Project A can claim a Project B job explicitly assigned to the same node.

### Browser agent path

Bridge Wake code can:

- poll the Railway wake queue;
- find/open the correct ChatGPT/AI Studio resource tab;
- inject a prompt when the composer is safe;
- attempt to send it;
- avoid rapid duplicate delivery.

Browser integration remains the selected direction.

### Durable replacement-session documentation

Canonical docs now include:

- `START_HERE.md`
- `AGENTS.md`
- `docs/HANDOFF.md`
- `docs/ARCHITECTURE.md`
- `docs/RUNBOOK.md`
- `docs/RECOVERY.md`
- `docs/SECURITY.md`
- `docs/ROADMAP.md`
- `docs/PROJECT_STANDARD.md`

Future-project templates live under `Apps/_TEMPLATE/`.

## Still NOT live-proven

Do not mark these PASS yet:

- final GitHub commit synced to the powered-off PC;
- one real second project using the same PC executor without re-pairing;
- executor returning automatically after real power restore + Windows login;
- Bridge browser automatically reopening after Windows reboot;
- full ChatGPT Web E2E: tablet → wake ChatGPT → agent → scoped PC action → result;
- full Google AI Studio E2E;
- automatic template seeding into a newly cloned project's own repository.

## PC sync plan

A GitHub command-bus sync command is being added with this handoff finalization. It queues:

```text
git pull --ff-only
```

for the existing default Bridge workspace/project. Because the PC is off, the executor job may be created by Railway but cannot complete until the PC worker returns.

After power returns, verify the result rather than assuming it ran.

## Exact next actions

1. Merge the handoff/roadmap/sync finalization into `main`.
2. Deploy **that exact final `main` SHA** to Railway without changing variables, domain, volume, healthcheck, restart policy, or start command.
3. Verify Railway `SUCCESS` + exact `commitHash`.
4. Confirm the PC sync command was accepted/queued; leave it pending while the PC has no power.
5. When the PC returns, confirm executor register/claim traffic and the queued fast-forward pull completes.
6. Create/use a second real project and run a harmless project-scoped action to prove one PC serves both projects without re-pairing.
7. Prove executor startup after power return/login.
8. Bind and test ChatGPT Web E2E.
9. Bind and test AI Studio E2E.
10. Only with explicit new permission, decide whether browser autostart may be installed into Windows user/system startup locations.

## Security reminder

Never put raw Bridge/Railway/executor tokens, passwords, cookies, private keys, or browser credentials in Markdown. Do not use RDC or any other tool to operate outside `E:\AI\Bridge` without explicit permission.
