# Bridge implementation execution record

## Current continuation — 2026-09-09 UTC+7

See [native runtime checkpoint](BRIDGE_NATIVE_RUNTIME_20260909.md) for the current source and live Windows evidence. AppContainer filesystem denial and package-scoped WFP/proxy confinement now pass the documented real parent/subprocess and HTTPS probes. Administrator execution works. Runner service/recovery and v2 extension source are implemented, but production policy provisioning, native sign-in/model qualification, legacy coordination, browser installation and release E2E remain unfinished. **No production-ready or deployed-native claim is made.** Older contradictory statements below are historical.


## Current checkpoint — 2026-09-08 23:40 UTC+7

Delivery: implementation checkpoint commit `5d3a98e344e39d309db91d61367f9b70ac6c6e07` is pushed on `codex/bridge-completion`. [Draft PR #27](https://github.com/machxanht/BridgeChatgpt/pull/27) is open and explicitly not qualified to merge/deploy. CI was in progress when this delivery record was written; local/native results below must not be mistaken for a GitHub CI result. Tracked source is committed; pre-existing untracked runtime notes/answer files are preserved and excluded from the commit.

This section supersedes the historical continuation below. The user authorized implementation of all nine phases and use of the PC. There is no outstanding scope-approval question. Work is on `codex/bridge-completion`, based on `c352655c299d2c750cadbf5ee47642b843d8714c`; live `git ls-remote origin refs/heads/main` confirmed that baseline during this checkpoint. **The nine-phase objective is NOT complete and this candidate is NOT qualified for production.**

| Phase | Current evidence | Remaining release gate |
| --- | --- | --- |
| 1 — capabilities | Installed AGY 1.1.27 and Codex 0.153.4 help inspected. AGY `/model` confirms `gemini-3.8-flash-high`. Explicit Codex global sandbox/cwd + `exec resume --help` accepted. | Full native contracts/model entitlements, coding/useful return matrix remain unproven. |
| 2 — security | Fail-closed general/executor auth; browser password/session/CSRF; scoped runner/browser/attempt tokens; persisted revocations including attempt descendants. `BridgeAgent` exists. Control-directory sentinel read denied. | **FAIL: real BridgeAgent child can read AND write harmless sibling file outside Bridge.** Restricted token/filesystem and shell network boundary remain absent. AGY login under this identity requires OAuth. |
| 3 — conversation | Dedicated conversation/turn/attempt/message/event tables; durable atomic user+task+event; client-message idempotency/conflict; validated workspace/project and exact agent routes; paged history. | Legacy-history migration, long-history qualification, full native session recovery and contract-level HTTP release tests remain. |
| 4 — ownership | Atomic claims; replay same claim request after lost response; lease/deadline fencing; one shared canonical-checkout writer lock; cancelled/expired/failed work retains fence until owner cleanup. V2 cannot be claimed/completed through legacy task paths. | Legacy executor JSON-store claims still need to join shared coordination; read concurrency and browser delegated/reentrant work remain. Do not run both execution systems as though unified. |
| 5 — runner | Native argv/NDJSON parsers, exact session/model checks for AGY, Codex final-file contract, durable hash-checked result outbox; owned Windows Job Object launches suspended and kills descendants. | **Replacement dispatcher is not implemented/enabled.** Windows boundary and provider auth block production launch. Codex native model trace, asynchronous supervisor, recovery integration and adapter native E2E remain. |
| 6 — Sol browser | Backend browser capability/receipt scaffolding exists. Browser inspected via CUA shows only generic ChatGPT choice, not Sol 5.6. | V2 extension driver, exact model/session/message reconciliation, scoped executor binding and installed-extension qualification are not implemented. Legacy extension still contains the old consumer; server legacy queue remains disabled. |
| 7 — chat UX | Active entrypoint is the conversation chat: six explicit agents, exact labels/icons/times, Markdown/GFM/code, history pagination, SSE state, send/cancel, copy, reconnect state, selection retained after reload. Desktop and 390px fixture checks passed. | Native final answers A–L, richer error/retry/draft behavior, long-history/mobile soak, per-turn model switching, project management and optional quota UX remain unqualified. |
| 8 — reliability/performance | Removed legacy dashboard hot-path polling from active entrypoint; idle claim polls avoid DB exports; recovery sweep retains fences; SSE reconnect/cursor; separate readiness endpoint; draining on SIGTERM stops new turns/claims. | DB/event-loop timing metrics, load/SLO evidence, supervised PC boot and process-crash recovery, Railway volume/single-replica/start-command migration remain. |
| 9 — release | Local typecheck/build and isolated regression suites passed at checkpoints; no native A–L claims. | Windows/network negative proofs, provider login/model evidence, extension E2E, crash/timeout/restart fault matrix, 30-minute idle and two-hour soak, CI and deployed/runner/extension SHA alignment remain. **No deploy or merge.** |

### Reproducible evidence from this checkpoint

Final source regression run: `runtime/completion-validation-suite-itemfY/validation.log`, all 26 entrypoints PASS, including injected DB rename failure, ordered browser/native-message receipts, and partial outbox-ack recovery. Typecheck and production build PASS. Final restricted native probe: `runtime/agent-tasks/native-2be45345d8c6403c83c9fa36d73825f1`: authentication_required=true, deadline reached, cleanup_confirmed=true. `sandbox_unsupported=false` only means that error text was not emitted before login; it is **not** proof of Windows sandbox support. CI now uses the committed lockfile and isolated suites on both Ubuntu and Windows, and compiles the Windows lifetime primitive on Windows. CI results remain separate from local/native evidence.

- `npm run lint`: PASS. `npm run build`: PASS; final UI bundle approximately 369 kB / 114 kB gzip. This is build size, not latency evidence.
- `npm run test:isolated`: all 26 package test/check entrypoints PASS at `runtime/completion-validation-suite-QRWd07/validation.log`. A final rerun after the qs dependency repair is recorded below when complete. Harness creates a fresh copy/DB under runtime and does not open production data.
- New `chatRuntime.test.ts`: atomic duplicate create; conflicting retry; invalid workspace; competing claims; root lock across agents; recovering lost claim response; exact final idempotency; late completion rejection; cancel/lease fencing; foreign cleanup denial; parent token revocation; child environment allowlist.
- New `nativeAdapters.test.ts`: prompts remain stdin rather than shell arguments; exact model and explicit session selection; malformed/incomplete/failed/duplicate native final rejection; durable result survives a reopened outbox; different result and wrong acknowledgement hash rejected. These are fixture contracts, **not real native generation**.
- `windows-boundary-probe.ps1`: `Oliverkhang\BridgeAgent`, control sentinel read=false, workspace path visible=true. Visibility of a path is not executable permission; the original AGY profile binary was actually denied on launch.
- Copied only the AGY executable into `runtime/runner-releases/agy-1.1.27/agy.exe`, an existing coordinator-controlled ReadExecute release directory. SHA256 `D3BAE6895069231C169F427C99527D1F556951E9C43488F45E8B040FBF3011ED`. No credential/profile copy.
- `windows-job-probe.ps1`: actual restricted-identity parent plus descendants. Job active process count 4 → 0; `cleanup_confirmed=true`. Evidence `runtime/agent-tasks/job-fbd7e0bce5164999afad46c272958d61/result.json`. This proves explicit job termination, not full parent-crash/boot qualification or filesystem/network isolation.
- Negative filesystem fixture: `runtime/agent-tasks/external-b1228eaffa604c97b91f87d019cce15f/result.json`: outside_read=true, outside_write=true. Harmless retained fixture `E:\AI\Bridge-boundary-6e32dc0579e24019afd981caf6318ae7.txt`. No real secret was read to test this. **Required denial failed.**
- Restricted native AGY launch from release requires authentication. Initial probe timed out while awaiting OAuth, later exited 1; those owned processes were checked absent. The revised probe uses OwnedJob deadline/cleanup and prints only sanitized capability flags, not auth URLs/codes.
- In-app ChatGPT model picker exposed only generic ChatGPT / Plus upsell. No Sol 5.6 model proof, no prompt sent there, no model substitution. No controllable Chrome/Edge surface was exposed by CUA in this session.
- Local browser fixture `runtime/completion-validation-ui-aLxvhS`: actual chat API/DB plus a loopback-only test auth adapter and explicitly labelled synthetic assistant result. Observed Markdown, code/table/list, correct label/time, send→pending→cancel, SSE, reload preserving conversation, desktop and 390px layout. **This does not test production browser auth or provider E2E.** Fixture server and temporary browser tabs were closed after validation.
- `npm audit` after repair: 0 vulnerabilities. Express's pinned qs was overridden to 6.16.0; body-parser updated compatibly. No major framework upgrade or paid API dependency.
- No legacy `cli-agent-worker.mjs` node process was present in the final process inventory. New entrypoint remains quarantined (exit 78); never treat an environment `verified=true` flag as an OS proof.

### Safe continuation

Fix the demonstrated Phase 2 filesystem escape and implement real subprocess network enforcement under an administrator-capable, scoped setup. Current account + Job Object alone is insufficient. Complete normal provider sign-in under the isolated identity without copying the operator's credentials. Then integrate the tested outbox/adapters with the owned launcher and unified executor lock, and implement/qualify the browser extension against an available Sol 5.6 session. Only after these gates can native A–L, fault injection/soak and promotion occur. Do not deploy this partial candidate simply because unit tests are green.

The older reports below are retained as history; their absent-account, git-write-denied, and phases-not-started statements do not describe the current checkout.

## Continuation — 2026-09-08 13:09 UTC

The user has now authorized the narrow Windows boundary setup. The current process token has no enabled administrator role and no administrator SID; the restricted account is absent. Administrator-capable execution is the current user-only blocker. No account, ACL, process or network policy was changed. Existing source changes and runtime answer files are preserved. Fresh GitHub main/local HEAD comparison matches `c352655c299d2c750cadbf5ee47642b843d8714c`; `npm.cmd run lint` PASS. Evidence and unchanged root SDDL: `runtime/phase2-admin-preflight-20260908/evidence.json`. No commit/deploy, native generation or new E2E proof. The earlier missing-authorization and GitHub-read limitations below are historical; do not re-request the already-granted Windows scope. Phase 2 must pass before Phase 3 starts.

Updated 2026-09-08 (UTC+7). Local-only work in `E:\AI\Bridge`; **no push, deploy, live runner restart, account change or paid/native generation call**.

Baseline local HEAD: `c352655` (Phase 1 wake-test fixes over `6700fca`). The supplied master plan and three existing runtime answer files were already untracked and are preserved. A read-only `git ls-remote` failed with Schannel `SEC_E_NO_CREDENTIALS`; current GitHub/main was not independently reverified in this session. User reports the checkout is synced. No current deployment claim is made.

**Commits created: none.** The requested local commit was attempted after validation, but `git add` failed with `Unable to create 'E:/AI/Bridge/.git/index.lock': Permission denied`. This tool environment exposes `.git` as read-only and prohibits permission escalation. All checkpoint source/tests/docs remain uncommitted in the shared working tree. Intended commit message: `fix(security): checkpoint Phase 2 auth and quarantine unscoped CLI`. The parent must stage only checkpoint files, preserving the pre-existing untracked master plan and three answer files.

| Phase | Status | Checkpoint / remaining gate |
|---|---|---|
| 2 | **PARTIAL; BLOCKED on Windows boundary setup** | Browser session/CSRF and fail-closed auth checkpoint implemented. Restricted OS identity/ACL/network/native-child proof cannot be installed under current repository-only authorization. Runner/extension/attempt-scoped credentials and bounded rotation are still not implemented. |
| 3 | NOT STARTED | Depends on Phase 2. Durable migration, routing and conversation work outstanding. |
| 4 | NOT STARTED | Unified claims, leases, locks and fencing outstanding. |
| 5 | NOT STARTED | Native adapters, async runner, Job Object, outbox and Windows gates outstanding. |
| 6 | NOT STARTED | Sol protocol-v2 browser transport outstanding; legacy wake remains disabled. |
| 7 | NOT STARTED | Conversation UX outstanding; only the prerequisite sign-in gate changed. |
| 8 | NOT STARTED | Performance, restart and observability work outstanding. |
| 9 | NOT STARTED | Release qualification and A–L live gates outstanding. No E2E PASS. |

## Phase 2 checkpoint

- Removed User-Agent/Fetch-Metadata identity bypass and URL master tokens. Missing general/Studio/executor REST/executor MCP auth configuration fails closed; machine-scoped pairing remains intact.
- Added separate browser password sign-in, opaque in-memory sessions, HttpOnly/Secure/SameSite=Strict host-only cookie, eight-hour expiry, CSRF + exact Origin on mutations, logout and credential-rotation revocation. Session responses are no-store; login rate and session capacity are bounded.
- Added dashboard sign-in and shared same-origin CSRF transport; CORS uses explicit configured origins. Browser passwords never use the master controller token.
- Disabled the legacy CLI worker before credential bootstrap, task claim or native execution, with exit 78. Removed its skip-permissions flag. No environment override enables it. This is a security quarantine, **not** an implemented replacement runner. An existing running process is unchanged.
- Prepared [Windows setup and rollback manifest](BRIDGE_WINDOWS_BOUNDARY_SETUP.md). Read-only root ACL evidence shows inherited Authenticated Users Modify rights; new-user creation alone is insufficient isolation. The OS/native capability gate is not passed.

## Validation

- `npm.cmd run lint`: PASS.
- `npm.cmd run build`: PASS (Vite + server bundle).
- Production bundle startup/static UI/fail-closed task and executor HTTP smoke: PASS using a fresh isolated DB at `runtime/phase2-smoke-O3d0zP`; startup log retained there. No external worker enabled.
- New local HTTP tests: authenticated mutation reaches a local test consumer; forged headers/query tokens, wrong origin/CSRF, logout/rotation revocation, missing configuration and executor REST/MCP open mode rejected. PASS, **not native E2E**.
- Actual legacy worker startup test: exits 78 before bootstrap even with a purported verification env flag; no credential output. PASS, **not sandbox proof**.
- Every package `test` entrypoint: PASS in an isolated repository copy below `runtime`, with TypeScript entrypoints bundled by existing esbuild before running Node. Full bridge suite reports 21/21. No live database used.
- Final isolated-suite log: `runtime/phase2-validation-4xVVEX/validation.log`. Temporary copies and harnesses are ignored by Git; original untracked answer files are untouched.
- Direct `node --import tsx` is **blocked by the tool sandbox**: Node 24.19.0 `os.userInfo()` reports `uv_os_get_passwd ENOMEM` during tsx initialization. Do not describe the fallback as an unmodified `npm test` PASS. Parent/CI must run the standard command in a compatible environment.
- Windows native boundary tests, browser visual sign-in verification, installed extension, provider model/tool tests, deployed auth and A–L: NOT PROVEN.

## Continuation

The parent must review and commit the uncommitted checkpoint from a Git-writable session, and arrange the narrow Windows account/policy setup described in the manifest. Do not promote this checkpoint as a working CLI release: new launches are intentionally disabled. Do not restart the old worker expecting a functional replacement. Configure browser sign-in before any eventual deployment, as documented in RUNBOOK. Complete remaining Phase 2 scoped identities and Windows proofs before proceeding sequentially to Phase 3. Production promotion remains the parent's responsibility.
