# Windows developer-tool execution fix

The installed 41ace5e runner's extra Codex restricted token is incompatible with this machine's developer tools. Under BridgeAgent plus AppContainer, nested `cmd` can read a batch file but exits 1 before executing it; Node prints its version but JavaScript aborts 134 at `ncrypto::CSPRNG`. The same operations succeed without that extra token, while the Bridge AppContainer remains active. A tiny native API probe showed BCrypt and RtlGenRandom succeed but legacy CryptAcquireContext returns access denied. The exact internal Windows registry operation has not been identified; no registry/certificate permissions were broadened.

## Change and security contract

Only the installed Windows Codex/Astra launcher, after its existing OS-policy, executable and workspace authorization, opts into `bridge-appcontainer-v1`. This supplies the CLI's command-scoped `sandbox_mode="danger-full-access"` with approval never, because Windows confinement is supplied externally by Bridge. The inner Codex restriction is removed; the restricted Windows account, AppContainer, WFP, protected manifests, active-project ACL lifecycle, one-writer coordination and OwnedJob cleanup remain mandatory. Generic adapter consumers still use workspace-write. AGY and browser policies are unchanged.

The protected request carries the boundary marker. `native-child.ps1` refuses the marker or that CLI setting unless the exact Bridge AppContainer is selected; it cannot use its ordinary unconfined fallback. Failed authorization or mismatched package/SID prevents preparing the execution task. Both fresh and resumed Codex/Astra turns receive the command-scoped setting. No user/global Codex config is modified.

## Live offline evidence

`runtime/agent-tasks/run-3e9967b579a243a88c7a7dbb21eb5663` ran the tracked `verify-native-tools.cjs` under the existing BridgeAgent/AppContainer/OwnedJob in SequentialB, with exit 0 and cleanup confirmed:

- npm test spawned Node and passed add/subtract assertions plus crypto.randomBytes.
- Git status succeeded.
- Project CommonJS loading succeeded independently of the parent Bridge package.
- Both parent and descendant were denied inactive-project and controller-file reads, inactive-project/controller/release writes, and direct public networking.
- Output contains JS_CRYPTO_TEST_OK, PARENT_BOUNDARY_OK, CHILD_BOUNDARY_OK, BRIDGE_NATIVE_TOOLS_OK.

The earlier focused probe `run-55b0e1974044470ebbc259dd4f594ce4` also passed npm scripts, Git and parent boundaries. All diagnostic invocations used fresh attempt identities and confirmed cleanup. No model generation, login, elevation or service restart was used. Existing AppContainer networking policy was not edited.

Node child_process calls with captured named-pipe stdio can hang in this AppContainer; test subprocesses use inherited handles and bounded timeouts. This is a remaining platform limitation, not proof that every arbitrary build framework works. The adapter instruction explains the compatible invocation pattern.

## Validation and installation state

Adapter tests cover ordinary defaults, fresh/resumed external execution, prompt remaining on stdin, rejection of AGY external mode, and failed OS/container authorization. Real Windows IO tests cover argument encoding and rejection of missing/mismatched confinement markers. Typecheck, runner build, verifier syntax and probe syntax passed.

At this checkpoint production runner is still 41ace5e. The new adapter/helper build must be installed using the existing Administrator `verify-managed-projects.ps1` entrypoint, which now runs the AppContainer tool/parent/child proof in A/B/A. Live model turns were intentionally not repeated. Authenticated visual UI proof remains incomplete because the available automation browser has a separate login session; do not ask the user to repeat login.

Related upstream report: https://github.com/openai/codex/issues/17451 documents the same Node symptom, but is not evidence that a particular upstream fix exists.
