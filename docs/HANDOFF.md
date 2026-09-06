# BridgeChatgpt Handoff

> Primary replacement-session document. Read this after `START_HERE.md`. Update it after every substantial architecture, deployment, security, cost/quota, or live-state change.

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
- **FREE / lowest-cost operation is the top architecture priority.**
- **No paid/quota API, token-metered AI API, provider AI Agent, or paid automation may be used without explicit prior user approval.** An available API key/account/credit/tool is not permission to spend.
- Prefer browser/subscription UI, local PC execution, existing tools, repository code, ordinary included platform controls, Git/GitHub, open-source/self-hosted software, and free/included paths.
- Before building from scratch, search the current repo. If implementation/troubleshooting is taking too long, search trusted public repos/docs/internet and reuse a maintained compatible solution when practical.
- Routine Railway deployment must not depend on Railway AI Agent. Railway AI Agent previously consumed its separate quota during troubleshooting; future use requires explicit approval. Build a deterministic free/included deploy path instead.

Canonical policy: `docs/FREE_FIRST_POLICY.md`.

## Canonical production state before final offline-prep PR #6

GitHub `main` at that point:

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

Later GitHub work advanced `main` beyond that Railway deployment. Before any production claim, re-read current GitHub `main` and Railway deployment metadata rather than relying on the historical SHA above.

## Final offline-prep implementation

PR `#6` implemented the last planned source changes before PC power return:

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

The subsequent free-first policy work lives on branch `docs/free-first-policy` until merged. It adds `docs/FREE_FIRST_POLICY.md` and propagates the mandatory policy to every tracked Markdown document/template.

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

## Cost / quota state

Default allowed paid/quota dependencies: **none** unless explicitly approved by the human.

Current known issue:

- Railway AI Agent separate usage quota was exhausted during troubleshooting/deployment attempts. This does not mean the Bridge service itself is down; it means the AI Agent path must not be treated as routine infrastructure.
- Do not increase or consume that quota automatically.
- Replace routine AI-agent-assisted deploy with a deterministic free/included Git/platform-native path before considering deployment architecture complete.

If any future paid/quota dependency is explicitly approved, record here: service, purpose, one-time vs recurring, expected cost/quota, free alternative, and disable/removal procedure.

## Remaining work

No planned source edit should require the powered-off PC except bugs discovered by live testing. Remaining intended work:

1. Merge and CI-verify the free-first policy branch.
2. Establish/verify a deterministic routine Railway deployment path that does not require Railway AI Agent or another paid AI API.
3. When PC power returns, confirm background executor reconnects without manual source edits.
4. Confirm queued `git pull --ff-only` sync completes and local `HEAD` matches GitHub `main`.
5. Bridge Git status/test/build succeed from repo root `.`.
6. A second real project proves same-node multi-project routing from `Apps/<ProjectName>`.
7. New-project template seeding is live-proven without overwriting existing docs.
8. ChatGPT Web wake/injection/scoped-PC/result E2E is tested.
9. Google AI Studio wake/relay/result E2E is tested.
10. Actual evidence is recorded in this file and `docs/ROADMAP.md`.

Use `docs/PRE_POWER_RETURN_CHECKLIST.md` as the authoritative live-test sequence.

## Intentionally not auto-installed

Browser/executor startup mechanisms that require writing Windows user/system locations outside `E:\AI\Bridge` need explicit narrow permission first. Do not use RDC to bypass this rule.

## Security and cost reminder

Never put raw Bridge/Railway/executor tokens, passwords, cookies, private keys, or browser credentials in Markdown. Do not use RDC outside `E:\AI\Bridge` without explicit permission. Do not spend API/AI-Agent quota or money without explicit prior approval.

## Fast Chat fix — 2026-09-06

Focused fix on chat routing, shared DB completion, MCP, relay, wake and primary chat panel:
- BRIDGE_CHAT_V1 review updates normalize to completed. task_review preserves the answer and cannot append review notes.
- Auto-review excludes chat and debate. Coding tasks retain review/test policy.
- Chat defaults to one available ChatGPT target; explicit group intent alone enables discussion.
- Primary feed shows human messages and canonical completed answers, hiding orchestration logs and legacy envelopes.
- Wake carries the full original question, requests Vietnamese/direct completion, and skips Fast Chat review handoff.
- Browser Wake has a 2-second awake polling path with the existing alarm fallback; UI refresh is 1 second. Installed PC extension update and actual dispatch latency are not yet proven.
- Targeted tests, npm run lint, npm test, npm run build passed locally. Test runner uses node --import tsx (avoids unnecessary CLI IPC socket).
- Production deploy and real-agent E2E are pending at this commit. Do not infer PASS from unit tests.
- PC E:\AI\Bridge has pre-existing uncommitted changes; this fix uses a separate checkout and does not overwrite them.
