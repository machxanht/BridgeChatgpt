# Native runtime continuation — 2026-09-09 UTC+7

This is the current source/PC checkpoint on `codex/bridge-completion`. It supersedes earlier statements that administrator execution is unavailable, that no v2 extension/service loop exists, or that only a Job Object was implemented. **This is not a production/native-model E2E completion report.**

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
