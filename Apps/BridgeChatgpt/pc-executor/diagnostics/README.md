# Windows native qualification helpers

These are the preserved, PC-specific diagnostics used on `E:\AI\Bridge`, not the production runner entrypoint. They use the protected installation under `runtime/runner-control`, `runtime/runner-releases`, the existing `BridgeAgent` profile and its DPAPI credential. Do not enable a service from these files or execute them from a model-writable project directory.

## Applied network migration

The installed policy is `WindowsNetworkPolicyIpc.cs`, with no Bridge loopback exemption. `verify-windows-ipc.ps1` verifies exact filters, proxy executable, sublayer priority and absence of that exemption. The original `install-windows-confinement.ps1` describes v1 and will correctly reject the migrated state.

The diagnostic migration copies the reviewed IPC C# helper to `runtime/runner-control/WindowsNetworkPolicyIpc.cs` before running `install-native-ipc.ps1` as administrator. It requires the exact old policy; it installs the new filters first, removes the old loopback exemption, then removes the old filters. Positive/negative probe failure restores the prior policy. It is not an idempotent production installer: after successful migration use the read-only verifier instead of rerunning it.

`ipc-check.mjs` runs the fixed native fixture through `ipc-native-check.ps1`, `WindowsJob.cs`, and the release-installed `ipc-native-child.ps1`. Install the child and `ipc-probe.ps1` in the existing protected `container-probe-v1` release. The controller and parent/grandchild fixtures coordinate using a new run ID so stale files cannot satisfy a check. The default fixture owns a harmless Node proxy-port listener; `--existing-proxy` instead tests an already running, trusted provider proxy on port 43892.

The measured invariant is denial of foreign network access, not failure of `bind(0.0.0.0)`: Windows can allow a wildcard bind and still reject foreign traffic at ALE RECEIVE. The fixture opens a live wildcard listener in both parent and child, then confirms host-loopback and host-LAN-address connections fail. It separately verifies own-package loopback and the scoped proxy succeed; arbitrary localhost, direct egress and outside-canary reads/writes fail. The enclosing Job Object must confirm cleanup.

## Native Google sign-in diagnostic

`native-auth-portal.mjs` offers a short-lived local browser form with an unpredictable session capability, strict Host/Origin/header checks and bounded requests. The submitted authorization code goes only to the native CLI input pipe and is removed after cleanup. It does not read/export credentials from Windows Credential Manager, copy the operator's profile, or use an API key.

Install `native-auth-owned.ps1` in protected runner-control and `native-confined-auth.ps1` beside the pinned native environment/AppContainer helpers in `runner-v2-development`. The latter must have the pipe's package read ACE: the anonymous reader inherited by the AppContainer needs access to the named-pipe object. Its input stream was verified with a fixed `PIPE_OK` fixture. The owner process anchors the CLI in a kill-on-close Job Object.

The portal has a 60-minute lifetime; each native authentication attempt is bounded. The initial Google sign-in in ordinary BridgeAgent is already complete, but the AppContainer cannot read Windows Credential Manager. **Confined Google sign-in and persistence remain unqualified until the user supplies the Google authorization code and a fresh confined CLI process succeeds.** A displayed OAuth link or a successful form POST is not authentication proof.

See `docs/BRIDGE_NATIVE_RUNTIME_20260909.md` for the measured results and remaining production gates. Diagnostic scripts and source imports are not a substitute for a pinned, protected production release.
