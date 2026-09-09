# Bridge Security and Permission Boundary

## Phase 2 checkpoint — 2026-09-08 (local, incomplete)

Browser headers no longer prove identity. Secure browser sessions require a separate configured password, CSRF and exact Origin for mutations. Missing shared auth configuration fails closed, including executor REST/MCP. Session logout/expiry/restart and password/origin rotation revoke access. Query-string controller tokens are rejected.

This does not establish least-privilege native execution. The legacy CLI entrypoint is quarantined before bootstrap; no currently running worker was changed. Runner/extension/attempt capabilities, restricted Windows token/identity, protected coordinator/release ACLs, child environment filtering and network enforcement remain outstanding. Root ACL inspection found broad inherited group access; cwd and a newly created user are insufficient proof. See [BRIDGE_WINDOWS_BOUNDARY_SETUP.md](BRIDGE_WINDOWS_BOUNDARY_SETUP.md) for scope, rollback and required real-child negative evidence. Do not enable dispatch through a configuration assertion or restore skip-all to bypass this gate.

## Principle

Technical capability does not imply permission. Every agent, connector, executor, remote-desktop tool, browser automation path, or human-assisted workflow must stay within the scope explicitly approved by the user.

The same rule applies to spending: an available API key, provider AI Agent, credit balance, connected account, or quota does not imply permission to consume it.

## Current approved local root

```text
E:\AI\Bridge
```

Normal Bridge work may read, write, search, diff, test, build, and run approved commands only within this root and its approved project folders.

## Project locations

Projects live under:

```text
E:\AI\Bridge\Apps\<ProjectName>
```

Each project's registered `local_path` must start with `Apps/`.

## PC Executor boundary

The Local Executor enforces project-root containment using path resolution. Relative paths and job working directories that resolve outside the configured root must be rejected.

Command execution is additionally limited by an executable allowlist. Current design uses direct process spawning (`shell: false`) rather than arbitrary shell command strings.

### Machine-scoped pairing

A PC pair token belongs to a specific `node_id`. It may serve multiple Bridge projects, but this does **not** grant unrestricted filesystem access. Cross-project execution remains limited by the same approved root and per-job project `cwd`.

## Remote Desktop Commander

Remote Desktop Commander may technically expose broader machine access. That does not change the allowed scope.

Rules:

- Do not browse/search/read/write unrelated folders outside the approved Bridge root.
- Do not use terminal commands to bypass directory restrictions.
- Before ordinary RDC use, its directory and command restrictions should be checked/enforced when the device is online.
- If a required operation genuinely needs another path, obtain explicit narrow permission first.

## Browser automation

Bridge Wake may interact with ChatGPT Web and Google AI Studio Web pages needed for the bound project.

Do not:

- copy or extract login cookies;
- scrape unrelated browser history/profile data;
- copy credentials from another browser profile;
- inspect unrelated tabs or user data beyond what is needed for the bound task.

The preferred Bridge browser profile should store its profile data inside the approved Bridge root whenever practical.

## Paid/quota service permission boundary

`docs/FREE_FIRST_POLICY.md` is mandatory.

Do not add, enable, call, or rely on any external paid API, token-metered AI API, provider AI Agent, paid automation, or quota-consuming service without explicit prior user approval.

Examples requiring approval before use:

- Railway AI Agent when it consumes separate AI-agent quota;
- OpenAI/Anthropic/Gemini or other metered LLM API calls;
- paid automation/agent platforms;
- a new paid connector or hosted service with usage-based billing.

Prefer browser/subscription UI, local PC execution, existing repository code, ordinary included platform controls, Git/GitHub, open-source/self-hosted software, and other free/included paths. If implementation/troubleshooting is dragging, search the current repo first, then trusted public repositories/docs/internet for an existing maintained solution before considering a paid dependency.

If a paid/quota path appears necessary, stop and obtain approval after disclosing what will be consumed, expected cost/quota when knowable, why free alternatives are insufficient, and how to disable/remove the dependency.

Internal Bridge REST/HTTP protocol calls are allowed as plumbing; they must not be used as a loophole to introduce a billable external dependency.

## Secrets

Never commit secrets to Git or Markdown.

Examples of forbidden documentation content:

- Railway/API tokens
- Bridge MCP/executor raw tokens
- passwords/PINs
- browser cookies/session tokens
- private keys
- recovery codes

Documentation may state **where** a secret is configured and its variable name, but never its value.

## Git safety

Operations that can discard data need special care:

- `git reset --hard`
- `git clean -fdx`
- force push
- deleting branches with unmerged work
- recursive filesystem deletion

Before such operations, inspect current status/diff and obtain explicit task-specific approval when user data or uncommitted work could be lost.

## Project creation

Creating a project under `Apps/<ProjectName>` is within the approved root. New projects must not be placed elsewhere by default.

Nested project repos are ignored by Bridge's parent repository so their files are not accidentally staged or committed into BridgeChatgpt.

## Windows startup / system configuration

Changes to Windows Startup, Task Scheduler, registry, system folders, browser installation folders, or user profile directories are outside ordinary project-root file operations. Implementations may prepare scripts/configuration inside the Bridge root, but installing them into system/user locations requires explicit permission unless that scope has already been specifically approved.

## Destructive-operation checklist

Before any destructive action:

1. Confirm the exact target path.
2. Confirm it is inside approved scope.
3. Inspect Git status/diff where applicable.
4. Confirm backups/version history are adequate.
5. Use the narrowest possible command.
6. Never infer permission from a tool being technically capable of the action.

## Incident recovery

If an agent discovers it has operated outside filesystem scope **or consumed unapproved paid/quota resources**, stop further unauthorized actions, record what was accessed/changed/consumed, and report it clearly. Do not attempt broad cleanup that could cause additional damage or spend more quota.
# Current runtime boundary finding — 2026-09-08

`BridgeAgent` is an actual separate local Windows identity and the owned Job Object mechanism has passed explicit descendant cleanup. It is **not yet a sufficient sandbox**: a real child read/wrote a harmless outside-root sentinel. Per-process filesystem and outbound-network policy remain unimplemented/unproven, and the replacement dispatcher must stay disabled. User PC authorization is already granted; this is a technical isolation failure. See [measured evidence and remaining gates](BRIDGE_IMPLEMENTATION_STATUS.md).

Controller tokens are not child environment variables. Runner/browser/attempt credentials are signed and bounded; attempt tokens refer to the issuing runtime token so revoking the runtime also rejects descendants. Revocations are persisted. Cancellation/lease expiry revokes result commit but holds the writer fence until owner cleanup; an offline heartbeat is not proof a subprocess stopped. Legacy generic task mutation/claim cannot bypass the V2 attempt contract. Legacy executor jobs still require integration with the common lock before both execution paths can run together.
