# Phase 2 Windows boundary setup manifest

Status: **AUTHORIZED; BLOCKED on Windows administrator execution.** The user explicitly authorized creation of `BridgeAgentRestricted`, required ACL/process/network isolation and negative tests on 2026-09-08. The scope below remains narrow. No setup has been applied; this manifest is not evidence that Windows isolation works.

## Continuation preflight — 2026-09-08 13:09 UTC

- Current process identity: `Oliverkhang\OliverkhangPC`. WindowsPrincipal administrator check is false, and the administrator SID is absent from this process token. An administrator-capable execution context is required; conversational authorization has already been granted and must not be requested again.
- `Get-LocalUser -Name BridgeAgentRestricted` confirms the account is absent.
- Local HEAD and freshly queried GitHub main both equal `c352655c299d2c750cadbf5ee47642b843d8714c`.
- Root ACL still includes inherited Authenticated Users Modify and Users ReadAndExecute. No DACL, ownership, account, network rule, startup entry or live process was changed. There is consequently no system mutation to roll back from this continuation.
- Preflight evidence is retained in `runtime/phase2-admin-preflight-20260908/evidence.json`. It contains the original root SDDL and token capability results, not credentials. This is baseline evidence, not an ACL backup for future target directories; save each exact target's pre-change ACL before applying setup.
- `npm.cmd run lint` passes in the current session. No new native boundary or six-agent E2E proof exists. Resume Phase 2 in an administrator-capable execution context, preserve this manifest's restrictions, then implement and prove the boundary before advancing phases.

## Evidence and reason for the gate

The existing `scripts/cli-agent-worker.mjs` launched native CLI processes using the operator identity and inherited environment. It had no restricted-token launcher or owned Job Object. AGY used `--dangerously-skip-permissions`. The Phase 2 checkpoint removes that flag and stops this legacy entrypoint with exit 78 before credential bootstrap, HTTP claims, or native execution. There is no environment-variable bypass. An already-running process has not been stopped or upgraded by this source edit.

A read-only `Get-Acl -LiteralPath E:\AI\Bridge` inspection found inherited `NT AUTHORITY\Authenticated Users` Modify rights and `BUILTIN\Users` ReadAndExecute rights. A new ordinary account alone therefore does not prove control-state isolation. No outside-root files, browser profiles, account stores, or real secrets were inspected to test access.

The master plan §8.1 requires a coordinator-controlled immutable release; §8.2 requires restricted identity, filesystem and network enforcement; Phase 2 depends on the Phase 1 capability proof. A Job Object manages process groups and lifetime; security restrictions must also be applied to individual processes. See [Microsoft Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects) and [Restricted Tokens](https://learn.microsoft.com/en-us/windows/win32/secauthz/restricted-tokens).

## Proposed narrow setup scope for the Windows administrator

| Object | Intended change | Rollback |
|---|---|---|
| Local Windows account `BridgeAgentRestricted` | Dedicated non-administrator execution identity; no operator-account impersonation, elevation, or account-management rights. Account provisioning changes Windows account state outside the approved repository scope. | Stop only Bridge-owned children, revoke capabilities, disable this account; remove it only if created by this setup and no retained data depends on it. |
| `E:\AI\Bridge\runtime\runner-releases\<commit>` | Coordinator-owned source snapshot. Restricted agent may execute/read required binaries, but cannot change files, ownership, or DACLs. Do not inherit broad Modify grants. | Restore only saved DACLs for the exact created release directory; retain the snapshot for investigation. |
| `E:\AI\Bridge\runtime\runner-control` | Coordinator-only credentials, receipts, outbox and launcher configuration. Agent cannot read/write or change ownership/DACLs. | Revoke issued capabilities; restore saved DACLs for this directory. Do not delete receipts or expose secrets. |
| `E:\AI\Bridge\runtime\agent-tasks\<attempt>` | Per-attempt temp/cache and harmless fixtures, writable only for the assigned attempt. Project access added only for the canonical registered project and current lock. Protect Bridge `.git`, control state and credentials when Bridge itself is the project. | Revoke the attempt; remove its access grants using saved DACLs. Retain work and evidence. |
| Restricted token and Job Object launcher | Restrict access even where broad groups grant access; launch suspended, assign owned job, then resume. No breakaway, inherited privileged handles or unrestricted fallback. Restrict descendants too. Implementation and native denial proof remain outstanding. | Stop the owned job and disable the launcher; never restore unrestricted execution as recovery. |
| Network policy for the restricted execution identity | Administrator-controlled enforcement must cover native children and arbitrary shell subprocesses, allow only approved provider/tool traffic, and deny private/loopback/link-local/metadata traffic. Exact provider destinations and a compatible Windows enforcement mechanism still need validation. No machine-wide default-firewall change is approved or proposed. | Remove only uniquely named Bridge rules from the saved manifest after stopping children. Do not reset the machine firewall or import an entire unrelated policy. |
| Native subscription sign-in | If native CLI auth cannot work with isolated cache, the human signs in under the restricted identity. Do not copy cookies or the operator profile, or switch to paid API keys. Exact CLI-supported auth/cache paths must be verified before granting access. | Revoke the restricted identity's native session using provider controls; retain the operator's existing login unchanged. |

Before any apply, record resolved directory paths, exact SID, existing/new ownership and DACLs, named network policy objects, binary hashes, and the approved provider destinations. Keep backups inside coordinator-only control storage. There is deliberately no broad recursive ACL/reset command here: applying an untested account/firewall recipe would not satisfy the boundary.

## Required proof before dispatch can be enabled

1. Real child and grandchild can read/write only authorized fixtures; sibling/root-prefix, junction, symlink, ADS/device-path and cross-drive escapes fail.
2. The child cannot read coordinator credentials or alter release, control state, policy, ownership or DACLs. Use harmless sentinel fixtures, never real secret reads.
3. A modified npm script and arbitrary Node/PowerShell subprocess cannot bypass file or outbound-network restrictions.
4. Provider-native authentication works under the approved narrow scope, with exact model/native session evidence. Sol remains ChatGPT browser transport.
5. Parent crash, cancellation and timeout clean up the owned process tree; control receipts survive. No broad process-name kill.
6. Record hashes, identity, effective policy and fixture results. Operator authorization and a JSON `verified` flag are not proof of these properties.

Only after this setup and proof may the replacement runner implement an enabled route. Browser-session auth, runner/extension credential issuance, attempt capability fencing, native adapters and the later phases still need their own gates. No installer, system policy, account, startup registration, browser login or live runner was changed in this checkpoint.
# Current probe result — 2026-09-08

User PC/setup authorization is granted. Existing account is `BridgeAgent` (not the historical proposed name `BridgeAgentRestricted`). Existing protected release/control ACLs were reused. The restricted identity cannot read a control sentinel and can launch a copied native binary from the protected release directory. `WindowsJob.cs` + `windows-job-probe.ps1` prove suspended launch, assign-before-resume, no breakaway flags, and explicit descendant termination (4 active processes → 0).

**Boundary FAIL remains:** real `BridgeAgent` child can read/write a harmless sibling file outside `E:\AI\Bridge`. There is no proven shell egress restriction. Native AGY in this profile requests OAuth authentication. These failures block live coding dispatch. Job Object cleanup is only a process lifetime mechanism, not a filesystem/network sandbox. Do not replace measured denial tests with an administrator-applied JSON flag.

See [current implementation evidence](BRIDGE_IMPLEMENTATION_STATUS.md). The setup proposal below is historical and must be reconciled with the actual existing account/ACLs before any changes. Do not reset the account password or copy operator credentials. The existing DPAPI credential is read only by the coordinator for authorized child probes.
