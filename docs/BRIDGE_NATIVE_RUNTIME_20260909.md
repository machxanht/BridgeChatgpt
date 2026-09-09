# Native runtime continuation — 2026-09-09 UTC+7

## 03:07 UTC+7 — Google login persists; three fresh native model runs pass

The user's subsequent failure was not another missing authorization code: the CLI reported `Eligibility check failed` with HTTP 403. The proxy omitted `daily-cloudcode-pa.googleapis.com` (`/v1internal:loadCodeAssist`), then `lh3.googleusercontent.com` for the profile image. The local portal's exact-host allowlist now includes both. A bounded diagnostic records only proxy hostnames/allow decisions and timestamps, not URLs, request headers or credentials. Existing public-IP and matching TLS SNI checks remain.

A fresh ConPTY CLI invocation returned `BRIDGE_AUTH_OK`, `status: SUCCESS`, exit 0 and `input_delivered: false`. It reused the user's saved login. Three subsequent new normal headless adapter invocations inside BridgeAgent + AppContainer + OwnedJob all passed:

| Agent | Native model | Session | Result |
| --- | --- | --- | --- |
| Gemini | gemini-3.8-flash-high | d8d07e13-ee01-437a-807c-2b1535271797 | BRIDGE_NATIVE_OK |
| Sonnet | claude-sonnet-4-6 | 33b8a0d3-3554-48bb-960f-5db4d6425600 | BRIDGE_NATIVE_OK |
| Opus | claude-opus-4-6-thinking | 1b113833-a584-44a7-8040-6b9058059da1 | BRIDGE_NATIVE_OK |

All three had native/launcher exit 0 and confirmed job cleanup. Evidence: `runtime/runner-control/agy-auth-model-matrix.json`, 2026-09-08T20:07:10Z through 20:07:30Z. They use the normal native adapter and file-based NDJSON transport, not the authentication terminal. No new authorization code, fallback model or API key was supplied. This proves saved login works across fresh processes now; it does not yet prove token refresh after expiry or the native coding/resume/full E2E gates.

The portal distinguishes HTTP 403 and eligibility errors from input-code errors. Syntax validation and provider-proxy tests pass. Earlier login-pending statements below are historical; **do not ask the user to log in again**.

## 02:55 UTC+7 — Windows OAuth input fixed; real login pending

The user reported more than ten failed code submissions. The previous portal sent codes to a named stdin pipe; AGY only reported authentication timeout after 60 seconds. The earlier PIPE_OK diagnostic proved the pipe, not AGY's authentication input. The official [AGY changelog for 1.1.2](https://github.com/google-antigravity/antigravity-cli/blob/main/CHANGELOG.md) documents controlling-terminal input via CONIN$ on Windows.

A private AllocConsole failed under BridgeAgent. A private ConPTY succeeds without attaching to the operator console. `WindowsAppContainer.StartAuthConsole` supplies the pseudoconsole attribute alongside the existing AppContainer capability; ordinary execution retains CREATE_NO_WINDOW and file redirection. The terminal host remains inside the owned Job Object. NativeAuthConsole bounds captured output and redacts the submitted code, including split output chunks; the helper removes the code file after delivery.

Live receipt `runtime/runner-control/native-auth-input-proof.json`, timestamp `2026-09-08T19:55:21.060Z`: an intentionally invalid code reached Google and returned `invalid_grant / Malformed auth code`; stale-session, duplicate and foreign-origin requests were rejected; code redaction/removal and owned-job cleanup passed. **This proves input delivery, not successful real authentication.**

The portal has per-attempt session IDs, separate submitted/delivered states, specific provider/timeout/launcher errors and an approximate 60-second countdown from the observed OAuth URL. The existing local URL is retained; the user must refresh the page. Local lint/build and PowerShell 5 compilation pass. Confined Google login and subsequent new-process persistence still need verification; no main merge or deployment.

This is the current source/PC checkpoint on `codex/bridge-completion`. It supersedes earlier statements that administrator execution is unavailable, that no v2 extension/service loop exists, or that only a Job Object was implemented. **This is not a production/native-model E2E completion report.**

## Coding and internal IPC fixes — 2026-09-09 02:30 UTC+7

**Actual native file write/read now succeeds for both Codex Sol and Astra. This is still not the full nine-phase or production E2E gate.**

Codex 0.153.4 first failed while preparing its offline shell stubs: the AppContainer could not create `C:\Users\BridgeAgent\.sbx-denybin`. Trusted profile setup now creates the four fixed ssh/scp refusal scripts and grants the package read/execute only. The native workspace capability SID also needed a Modify ACE on the exact `runner-io-probe` task folder. Original task DACL: `runtime/runner-control/codex-task-acl-before.txt`. An additional exact native temp-capability ACE was applied; it did not fix PowerShell startup.

A deterministic nested `codex sandbox -P :workspace` probe writes and reads `BRIDGE_WRITE_OK` through cmd.exe. Native Sol then created `bridge-native-write-proof.txt` with apply_patch and read it using cmd after PowerShell failed. Native Astra used the updated adapter's global config overrides, created `astra-native-write-proof.txt` with apply_patch and read it via cmd with no tool failure. Both exited 0 and their OwnedJobs confirmed cleanup. Evidence: `codex-tools-probe-report.json`, `astra-tools-probe-report.json` and matching NDJSON under `runner-io-probe`. Model identity is explicit CLI route selection, not a separate signed provider receipt.

Private-desktop creation fails with CreateDesktopW error 5 in the nested boundary. The adapter explicitly selects the supported unelevated native backend, workspace-write, approval never, and the private-desktop compatibility setting. It now tells the native agent to select cmd.exe. Windows PowerShell 5 still fails with 80070005; a read-only copy of bundled PowerShell 7.6.5 in the diagnostic release gives a specific GetSaferPolicy/Access Denied error. No PowerShell policy bypass was added. The source cmd instruction was added after the Astra run, whose user prompt carried the same instruction; a full generic coding/continuation matrix remains open.

NativeTranscript now rejects exit-zero/final-answer streams when every completed file/command tool failed. A later successful tool retry is preserved. This detects the measured all-tools-failed case; it is not semantic proof of every requested task outcome.

### Applied network policy v2

The old six filters and Bridge LoopbackExempt entry were replaced at `2026-09-08T19:03:09.7004722Z`. The new eight filters allow same-package internal TCP IPC and a hard permit only for 127.0.0.1:43892 received by the exact `C:\Program Files\nodejs\node.exe` proxy. Direct/non-loopback egress, IPv6, native proxy-port listeners and foreign ingress remain denied. No Bridge loopback exemption remains. Sublayer `b73561e9-1239-4b20-96ce-c56bd2f8a340` has verified priority 0xF101; filter keys end a350–a357. Early migration attempts restored the old configuration when checks failed; the installed version passed. Windows assigned 0xF101 while the old 0xF100 sublayer coexisted; source now requests/verifies the distinct priority explicitly.

The final parent/child probe runs as **BridgeAgent + AppContainer + OwnedJob**. Both show proxy_connect/own_loopback/inside_write true, and direct_connect/foreign_loopback/outside_read/outside_write false. A wildcard bind can succeed, but host connections to its live listeners fail using both loopback and LAN addresses, in parent and child. Requiring wildcard bind itself to fail would also block ordinary outbound clients that explicitly bind an ephemeral wildcard endpoint; ingress is enforced at ALE RECEIVE instead. Cross-package AppContainer ingress has not separately been exercised. Final cleanup receipt: true at `2026-09-08T19:25:53.8344570Z`. Evidence: `ipc-boundary-report.json`, `ipc-owned-check.log`, `ipc-owned-cleanup.json`, `native-ipc-install-result.json`. Source verifier passed at `2026-09-08T19:18:08.5193608Z`; it checks filter values/flags, app ID, priority and absence of the exemption. The v1 installer must not be used as the current verifier.

The receive-side design follows Microsoft's [WFP filter contract](https://learn.microsoft.com/en-us/windows/win32/api/fwpmtypes/ns-fwpmtypes-fwpm_filter0) and the same-package loopback behavior measured by [Google Project Zero](https://projectzero.google/2021/08/understanding-network-access-windows-app.html), then tested on this machine. Diagnostic migration/fixtures and both native permission primitives are preserved under `pc-executor`. They are not a production service installer.

### Google authentication boundary and prepared local form

AGY now gets past its internal listener and reaches provider startup. It then logs `Failed to load stored token from keyring, falling back to file: Access is denied.` The existing successful BridgeAgent login is in Windows Credential Manager, which this AppContainer cannot read. This is new evidence for confined sign-in; do not repeat the original ordinary-account login or export the keyring credential.

A local authorization-code form is prepared by `runtime/runner-control/native-auth-portal.mjs`. Its URL is held only in protected `native-auth-portal-url.txt`; do not commit the generated capability. It opens a fresh native OAuth attempt on demand and sends the user's code to the native input pipe. Pipe I/O was validated with a fixed PIPE_OK fixture. The portal was inspected in the existing Codex in-app tab. No authorization code has been received and no confined/persisted Google session is proven. The initial unattended auth attempt timed out with native exit 1 and cleanup confirmed; the Start button can create a fresh link. Shell-based automatic browser opening was rejected by automatic approval policy with only “blocked by policy”; do not work around that rejection. Use the prepared in-app page or give the user its local URL.

Validation: all 30 isolated suites passed in `runtime/completion-validation-suite-vxcSdb`; updated adapter regressions and both new C# helper compilations also pass. Final typecheck and build pass. No main merge or Railway deployment. Production runner entrypoint/pinned provisioning, per-workspace permission lifecycle, unified legacy coordination, native session resume/full model matrix, installed browser extension/Sol DOM qualification and final A–L/fault/soak/release gates still remain. Do not describe Google login as the only remaining project work.

## First successful confined native chat — 2026-09-09 01:33 UTC+7 (historical)

The user applied `install-native-path-query.ps1`; the dated result reports installed=true at `2026-09-08T18:32:56.0813362Z`. This supersedes the unapplied candidate status below. Codex now passes CODEX_HOME canonicalization. Its next Git-directory check was satisfied by initializing a separate empty repository in the existing isolated `runtime/agent-tasks/runner-io-probe` directory.

Actual included-account native chat under BridgeAgent + AppContainer + OwnedJob + WFP/provider proxy succeeded twice: explicit CLI model selection `gpt-5.6-sol` and `gpt-6-astra`, each returned `BRIDGE_NATIVE_OK`, native exit_code=0, cleanup_confirmed=true. Preserved evidence: `runtime/runner-control/codex-native-first-success.json`, `astra-native-probe-report.json`; corresponding request manifests are in `runner-releases/runner-v2-development`. These prove requests and real answers through the selected CLI routes, not a separate provider-side model identity receipt or Bridge browser E2E. NDJSON contains thread/turn receipts but no independently signed model identity. `chatgpt.com` and `ab.chatgpt.com` were allowed; the observed `*.oaiusercontent.com` hosts were denied and were not needed for these simple answers.

Coding qualification is still FAIL. The original adapter invocation and a diagnostic with sandbox flags after `exec` both reported read-only without a file tool execution. A later diagnostic explicitly selected the documented `windows.sandbox="unelevated"` **inside the unchanged outer AppContainer boundary**. This enabled native file-tool attempts, but file writes failed and command startup returned `Access is denied (os error 5)`. The requested `bridge-native-write-proof.txt` does not exist. The process returned an honest inability answer, not task success. Evidence: `runtime/runner-control/codex-tools-probe-report.json`, `runner-io-probe/codex-tools-stdout.ndjson`, `codex-tools-stderr.txt`. The adapter source was not changed based on this unsuccessful diagnostic.

Parent/subprocess negative boundary probes still pass after the volume-query grants: outside read/write denied, arbitrary direct/localhost network denied, scoped proxy and intended directory write allowed. All qualification processes ended with cleanup receipts; no proxy or coding probe is left running. Remaining immediate issues: native coding/tool launch in the nested Windows boundary, AGY internal localhost IPC, and the previously documented production runner/extension/release gates. No deploy or full E2E claim.

## Canonicalization diagnosis after manual administrator setup

The user ran the direct ancestor metadata installer successfully at `2026-09-08T18:27:20.0981599Z`; `native-ancestor-metadata-result.json` now says installed=true. This supersedes the partial-rollout status below. Codex was retried and still failed before generation.

A real Win32 probe inside BridgeAgent + AppContainer opens `.codex` successfully, but `GetFinalPathNameByHandle` returns ERROR_ACCESS_DENIED for DOS/GUID volume names. NT volume names and names without a volume succeed for the same handles. Evidence: `runtime/agent-tasks/runner-io-probe/canonical-stdout.txt`; the field named `access` in its final version is the volume-name flag (0/1 fail, 2/4 succeed). This isolates the remaining failure to volume-name translation rather than login or opening the profile directory. It matches [Microsoft MXC issue #694](https://github.com/microsoft/mxc/issues/694).

Prepared, **not applied/qualified**, a narrow package-only query grant for the Object Manager directory `\GLOBAL??`, its C:/E:/MountPointManager symbolic links, and read access to the mount-manager device. Candidate helper: `runtime/runner-control/WindowsPathQueryAccess.cs`; installer: `install-native-path-query.ps1`. The C# helper compiles and can read all five existing security descriptors; no grants were applied by this candidate yet. Installer saves original descriptors before writes, prints a dated `native-path-query-result.json`, and requires an administrator token. After application, rerun the Win32 probe, actual Codex attempt and negative confinement tests before claiming a fix. Device/object ACL lifetime across reboot remains unqualified. AGY's blocked localhost IPC remains a separate issue.

## Post-login qualification — 2026-09-09 01:20 UTC+7

Both native sign-ins are complete. AGY's interactive UI reached its prompt under BridgeAgent with the included Google AI Pro account. A separate `agy models` process under BridgeAgent exited 0 and returned `gemini-3.8-flash-high`, `claude-sonnet-4-6`, and `claude-opus-4-6-thinking`. Evidence: `runtime/agent-tasks/agy-models-status.json` and `agy-models.txt`. Do not restart OAuth for the filesystem/network startup errors below.

Actual headless attempts under BridgeAgent + AppContainer + OwnedJob fail **before model generation**:

- AGY cannot listen on `127.0.0.1:0`: the installed blanket listen denial conflicts with native internal IPC. No proxy CONNECT was observed. Narrow internal IPC support must be designed and qualified; do not remove general localhost/network denial.
- Codex cannot canonicalize `C:\Users\BridgeAgent\.codex`: Access Denied, including with an extended Windows path. A confined PowerShell metadata probe can inspect the specific profile directories, but Codex still cannot start.
- Both owned launchers reported finished=true and cleanup_confirmed=true; native exit_code=1. Cleanup succeeded; no answer was generated.
- Protected reports/drivers: `runtime/runner-control/agy-native-probe-report.json`, `codex-native-probe-report.json`, `agy-live-probe.mjs`, `codex-live-probe.mjs`. Native stderr: `runtime/agent-tasks/runner-io-probe/*-stderr.txt`. No controller token, operator credential copy, paid API or fallback model was used.

Native profile grants were applied by their owner: package Modify/low integrity on BridgeAgent's `.gemini`, `.codex` and own Temp; non-inheritable RX on the native profile/AppData/Local ancestors; RX on the AGY release directory. Original descriptors: `runtime/runner-control/native-profile-owner-acl-before.json` and `native-profile-ancestor-acl-before.json`.

Ancestor provisioning is **partial**. Backup: `runtime/runner-control/native-ancestor-metadata-before.json`. Latest inspection found the non-inheritable package metadata ACE `0x1200a8` on `C:\`, `C:\Users`, `E:\`, `E:\AI`; `E:\AI\Bridge` still matched its original descriptor. The Set-Acl approach was stopped: do not use it on drive roots because it can walk descendants. New `WindowsDirectoryMetadata.cs` uses a direct handle descriptor update, retaining existing ACEs and adding metadata/traverse rights only. Actual fixture tests verify exact rights, idempotence and unchanged child ACLs. Final root rollout has not succeeded; the last elevation request returned cancellation. Do not treat old result JSON as current OS proof.

The existing parent/subprocess boundary probe was rerun after the grants: outside_read=false, outside_write=false, direct_connect=false, disallowed_loopback=false, can_listen=false, inside_write=true, proxy_connect=true. No qualification process remains active; network rules were not weakened.

Source fixes: durable successful attempt heartbeats preserve an already advertised runtime's presence during long turns; stale attempts cannot refresh presence or add model capabilities. Proxy diagnostics expose only bounded hostnames and allowlist decisions, and diagnostic failures cannot change enforcement. All 30 isolated entrypoints passed (`runtime/completion-validation-suite-Qlw2T4`). The later directory-metadata Windows regression and production build also passed. Latest CI and deployment remain separate gates. No production update occurred.

## Implemented and measured

- `runnerCore.ts`: durable-before-launch journal contract, lease/cancel handling, process-tree cleanup before completion, immutable outbox replay after lost acknowledgements, and an in-process fence when cleanup is unproven.
- `runnerService.ts`: HTTPS session/claim loop, single local coordinator listener, token renewal, persisted claim request IDs, native result recovery from original release manifests, bounded backoff, and no native-input replay after restart. Integration requires real `WindowsLaunchPolicy.authorize`, `readyAgents`, controller credential provisioning and workspace mappings; the service has not been enabled against production.
- `windowsNative.ts`, `native-owned-launch.ps1`, `native-child.ps1`: restricted `BridgeAgent` launcher, Job Object ownership, deadline/output limits, independent protected cleanup receipts, pinned AppContainer identity, exact Windows argv quoting and UTF-8 stdin/stdout. Actual Codex `--version` returned `codex-cli 0.153.4` under BridgeAgent + AppContainer + OwnedJob, cleanup=true. This is not a model generation.
- `WindowsAppContainer.cs`: package token with no general network capability; explicit filesystem grants are required. Actual parent **and subprocess** could write the allowed test directory but could not read or append the harmless outside canary.
- `WindowsNetworkPolicy.cs`: six persistent WFP filters scoped only to the Bridge package SID. IPv4 connections are constrained to TCP `127.0.0.1:43892`; IPv6 connections and listening are blocked. The package's loopback exception was added only after administrator verification of the exact filters. Other applications' network policy was not changed.
- `providerProxy.ts`: HTTPS CONNECT only, exact host allowlist, public IPv4 DNS validation with fixed resolved destination, bounded TLS ClientHello parsing, CONNECT/SNI match, ECH rejection, bounded sockets/timeouts. No TLS interception, provider API key or model substitution.
- Actual combined HTTPS test under **BridgeAgent + AppContainer + OwnedJob + WFP + proxy**: `example.com` through the proxy succeeded; a non-allowlisted host failed; direct HTTPS failed; launcher cleanup=true. This proves the tested network mechanism, not the complete provider endpoint allowlist or model availability.
- Extension manifest now points exclusively to `runtime-v2.js` / `popup-v2.html`. V2 uses browser-scoped sessions, a per-installation runtime identity, persisted claim/send/final state, exact Sol 5.6 preflight, scoped receipts and result recovery. Legacy worker files remain as historical tested code but are not the manifest entrypoint. No production Chrome installation/DOM qualification has succeeded yet.
- Server `/api/runtime/recover` reissues an attempt capability only to its current owner and transport. It never advances an epoch or replays native input. Claim request replay survives runtime-token renewal. Foreign-owner and committed-result recovery tests pass.

## Actual Windows policy and evidence

- Account: `BridgeAgent`, SID `S-1-5-21-2299166317-3866393011-3260234217-1005`.
- Package: `BridgeNative.boundary-v1`, SID `S-1-15-2-2031389295-489431135-2461900177-1913706768-3870177427-4052891927-2660065647`.
- WFP sublayer: `a32450f8-1239-4b20-96ce-c56bd2f8a340`; six filter keys end in `a350` through `a355`. Persistent, scoped package rules; proxy port 43892.
- Installation: `runtime/runner-control/network-policy-install.json`, timestamp `2026-09-08T17:26:34.3821714Z`, verified=true, loopback_exempt_before=false.
- ACL baseline for the initial two probe directories: `runtime/runner-control/container-probe-acl-before.json`.
- Filesystem/network parent+child evidence: `runtime/agent-tasks/container-probe-v1/stdout.txt`. Both report outside_read=false, outside_write=false, inside_write=true, proxy_connect=true, direct_connect=false, can_listen=false, loopback_connect=false (the disallowed localhost test port was listening).
- Combined native-identity HTTPS evidence: `runtime/agent-tasks/runner-io-probe/stdout.txt` and `result.json`; test coordinator `runtime/runner-control/proxy-live-probe.mjs`.
- The test package has grants on the named probe directories and ReadExecute on `runtime/runner-releases/codex-0.153.4`. **Production project/profile/per-attempt ACL provisioning remains to be installed and verified.** Do not grant broad access to the operator profile or control directory.
- WFP verification requires elevation on this PC; ordinary `FwpmEngineOpen0` returns Access Denied. Use the protected, reviewed administrator helper. A JSON `verified=true` value alone is not a runtime policy verifier.

## Validation

`npm run lint` and `npm run build` pass. All 30 package test/check entrypoints pass in the isolated runner: `runtime/completion-validation-suite-PhMYp3/validation.log`. New tests exercise actual Windows argument/encoding behavior, lost send/receipt/complete responses, no duplicate Send click, cleanup fencing, real TLS ClientHello generation, private-address rejection and SNI mismatch. CI additionally compiles all three Windows native classes. Later changes must be rechecked before delivery.

## Outstanding release gates

1. Install the production workspace/profile/per-attempt ACL grants and implement the elevation-backed policy verifier/auth capability callbacks for the service entrypoint. Keep all protected release/control files out of model write scope.
2. Resolve the existing legacy executor's separate JSON coordination or prevent its execution while native workspace ownership is active. Do not claim unified legacy/native locking yet.
3. Complete normal isolated-identity provider sign-in. Last actual Codex `login status` exited 1 / not logged in. A login window was started, but successful authentication has not been observed. No operator credential or browser-cookie copy was performed.
4. Qualify AGY/Codex native tools, exact model identity, sessions and provider host allowlist under the installed sandbox. AppContainer/network probes are not native model E2E proof.
5. Install and test the v2 extension against an authenticated ChatGPT Sol 5.6 browser session. The earlier native Chrome automation attempt stopped because the tool could not determine its URL sufficiently to apply policy. Do not retry that same blocked action blindly.
6. Run real browser → Bridge → native → persisted final → browser tests, cancel/crash/restart/fault cases and soak, then merge/deploy and verify the running deployment SHA. No new production deployment is claimed.

## Policy verification and rollback

Use the reviewed `pc-executor/install-windows-confinement.ps1` from an immutable release under an administrator token. `-Mode Verify` checks the six actual filters and the package loopback exception. `-Mode Rollback` requires the installation manifest, removes the added exception first, then removes only the six verified Bridge filter objects and Bridge sublayer. Stop Bridge-owned native work before rollback. Retain original ACL manifests, outbox and evidence. Do not delete or rewrite unrelated firewall rules or change host-wide defaults.

## Native sign-in correction

The user completed Codex device authorization. A fresh isolated-identity status probe confirms identity BridgeAgent, HOME C:\Users\BridgeAgent, CODEX_HOME C:\Users\BridgeAgent\.codex, codex_authenticated=true (runtime/agent-tasks/native-profile-check.json). AGY initially failed because Start-Process -Credential retained the operator HOME. native-environment.ps1 now derives the home directory from the actual token SID/ProfileList, resets profile/cache variables and clears inherited API credentials. native-child.ps1 uses it, and a corrected AGY login window was started separately. Windows native IO regression passes. AGY authentication and model E2E are still unverified.
