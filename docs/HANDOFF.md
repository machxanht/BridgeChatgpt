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


## Release result — 2026-09-06 17:28 UTC

- Fix commit: 541e4147caff75669d522e3aef455a0001de07c0; PR #18 merged as b085fe3e2a61e0d236aa7b70c45d84e495fa1487.
- GitHub Bridge CI run 34048566977 SUCCESS (includes typecheck, all tests, build, extension package and production startup smoke).
- Deployment BLOCKED: ordinary Railway redeploy produced deployment d379c0bc-114d-42d2-ae7a-b48f217621b4 SUCCESS but its commitHash is 13f6f640719f812c915fc3a62564e4dc7d720bdf, not the merged fix. Production therefore still has old behavior.
- Current Railway connector does not expose changing service source or deploying latest GitHub commit on the existing service. Its create_deployment tool creates a NEW service (not appropriate); redeploy reuses the old snapshot. Do not repeat redeploy expecting new source.
- Railway CLI is unavailable on the connected Windows PC. No re-login, re-pair, browser profile reset, or Railway AI Agent was used.
- Production browser was opened successfully and old TASK/review metadata was observed. Three real-agent E2E cases for the fix are NOT PROVEN because the fix is not deployed. PC extension 2-second poll is also NOT PROVEN installed/live.
- Next necessary step: deploy the existing Railway service from b085fe3 (or its documentation-only successor), verify actual deployment commitHash, then submit the three specified real chat cases and record answers/latency. Do not rerun the repo audit.


## Deployment resolved — 2026-09-06 17:41 UTC

Supersedes the deployment blocker above. Railway CLI 5.49.2 installed at E:\AI\Bridge\runtime\railway-cli; whoami verified Media Khang (khangmedia.com@gmail.com) after user authorization. Clean clone at E:\AI\Bridge\runtime\release-fastchat-18 was e0f1ae16c57e3ad2c0a1f7327957374b679406a3, directly descending from fix b085fe3. CLI up uploaded this checkout to the EXISTING service/project/environment. Deployment 918d0ced-ed0b-440c-87d3-3fa9eff259cb is SUCCESS. CLI upload metadata has no commitHash; provenance is the clean checkout and successful upload, with production UI visibly showing the new Auto/composer/feed behavior. Do not claim Railway reported a Git commitHash.

Production E2E submitted through actual browser UI: TASK-12 Astra question -> chatgpt pending; TASK-13 Railway question -> chatgpt pending; TASK-14 explicit multi-agent -> gemini assigned. Server wake queue contains TASK-12 ChatGPT direct-completion prompt and TASK-14 Studio debate prompt. All three still lack answers at observation time. No claim/MCP/Studio-relay requests in the inspected deployment HTTP log window. Wake polling observed at 17:39:42 and 17:40:42 UTC (roughly 60 seconds; additional 17:40:51 request was our diagnostic read). Thus real-agent answer/language/debate completion remains NOT PROVEN; installed wake transport is the next focused investigation, not repository audit or redeploy. Existing PC checkout and bindings were not reset.

Routine deploy now: invoke runtime\railway-cli\node_modules\.bin\railway.cmd up from a clean, verified source checkout with explicit project 664cfde0-1227-4403-8757-f957f7b5d1de, service 12d9ceee-f56b-4c18-a8b0-243df2a55fd9, environment 3149b2cc-806d-48c8-a40e-bfcee3eea6ee, --detach. Use no AI Agent and do not rebuild old snapshot via generic redeploy.

## Direct return transport fix — 2026-09-06

Live follow-up found TASK-14 reached Studio review, while TASK-12/13 remained pending. Wake delivery and answer return are separate: normal ChatGPT sessions may lack the named task_update tool, and the existing GitHub bus supports review but not direct update. Added a narrow PC helper at Apps/BridgeChatgpt/scripts/complete-chat.mjs using the already authenticated Railway CLI to submit the exact final answer directly to Bridge. No GitHub commit/poll, paid AI API, or review is needed for this fallback. Credentials remain in the helper process. Fast Chat and debate-final prompts document the helper; changed chat event version allows a stalled pending delivery to receive corrected instructions once.

Helper installed on approved PC path and live read-only check of TASK-12 passed. Node helper tests cover exact UTF-8 payload, coding exclusion, cancelled tasks, already-completed tasks and check-only behavior. npm run lint, npm test, npm run build passed. End-to-end agent-written completion still awaits deployment of these prompt changes; do not mark it PASS. Browser wake traffic from Windows Chrome remains about 60 seconds apart, so the installed polling improvement is not yet proven active.

## Live direct return and send confirmation — 2026-09-06 17:52 UTC

PR #19 merged as 9400a69; clean PC checkout uploaded via CLI to deployment c221ac34-2412-4aa3-a7a0-8c0c24fe6da6 SUCCESS. TASK-12 received a real ChatGPT answer at 17:51:20 UTC through GET/PATCH direct return. Production browser displayed a direct Vietnamese Astra answer with no task/review wrapper. This proves real ChatGPT return/language/feed for this case; content accuracy about model availability is not part of this transport test. TASK-13 and final debate TASK-14 remain pending at this observation.

Browser Wake 0.1.3 fixes two concrete injector defects: a click is no longer treated as successful delivery until the composer clears, and an exact unchanged Bridge prompt left from a failed send can retry without overwriting a different user draft. VM execution tests exercise the actual injector for successful send, failed click, same-prompt retry, user-draft preservation and busy protection. Full lint/tests/build PASS. Extension source on PC can be updated safely, but reload/activation in the user's running Chrome is not yet proven through available browser access.


## Release checkpoint — 2026-09-06 17:56 UTC

PR #19 (9400a69) and PR #20 (b3824b245ac8108ea3b586b2e6856ef01b1a0d10) merged after complete GitHub CI PASS: runs 34049768662 and 34049965621. Latest clean PC checkout at b3824b2 uploaded via Railway CLI; deployment eaf97ecd-2549-492e-909d-65e003aa7dc4 SUCCESS. CLI upload metadata omits commitHash; clean source/upload provenance recorded separately.

PC helper complete-chat.mjs installed and read-only authenticated checks PASS. Real ChatGPT TASK-12 completed at 17:51:20 via direct GET/PATCH and appeared verbatim in Vietnamese without task/review wrapper. TASK-13 still pending, TASK-14 Studio result in review awaiting ChatGPT final; not full E2E PASS. Do not create more duplicate test tasks.

Wake service-worker.js and manifest 0.1.3 copied to E:\AI\Bridge\Apps\BridgeChatgpt\browser-wake only after verifying no conflicting user changes (worker matched our earlier copied SHA256 6026BE59AC64D9CA64DFB16B4FAC0699776D2182E7DD0A26246D3982F81558EC; manifest unchanged from local HEAD). Syntax check PASS. The running Chrome extension has not been proven reloaded. Available browser automation controls only the cloud browser, not the PC's logged-in Chrome. Required next action: reload Bridge Wake in chrome://extensions on that PC browser, preserve profiles/bindings/logins, then observe TASK-13 and TASK-14 and actual poll cadence. No further repo audit or redeploy is needed just to activate the extension. No guarantee this step alone resolves all live delivery issues; verify before claiming success.


## Live E2E resolved — 2026-09-06 18:07 UTC

Supersedes pending/reload checkpoints above. User reloaded Bridge Wake 0.1.3. Production HTTP logs show actual wake requests approximately every 2 seconds from 17:57 UTC. Do not ask for another reload, login, pairing or binding.

All three existing E2E conversations completed: TASK-12 Astra Vietnamese direct answer; TASK-13 Railway Vietnamese direct answer (visible at 01:02 UTC+7); TASK-14 Studio input plus ChatGPT final synthesis (visible at 01:05 UTC+7). Live browser observed all three answers without task/review wrappers. Helper read-only checks confirmed TASK-13 and TASK-14 completed. Do not create duplicate acceptance tasks. These tests prove routing/return/language; they do not establish steady-state end-to-end latency or validate claims about model availability.

PR #21 merged as 2467fde74f291cd420b5323b714870fdc487bc87. BridgeMiniStatus no longer exposes task IDs, review state, invented progress percentages or PC executor status. It also no longer polls task/executor endpoints. npm run lint, npm test, npm run build PASS; GitHub CI 34050644182 SUCCESS. Clean PC checkout at this SHA uploaded to Railway deployment 56ac7ca5-2b83-4e6d-bcc0-fe1d364ac4fb; building at this checkpoint. Verify SUCCESS and live status bar before claiming final deployment verified.
