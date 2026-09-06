# Bridge Security and Permission Boundary

## Principle

Technical capability does not imply permission. Every agent, connector, executor, remote-desktop tool, browser automation path, or human-assisted workflow must stay within the scope explicitly approved by the user.

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

If an agent discovers it has operated outside scope, stop further out-of-scope actions, record what was accessed/changed, and report it clearly. Do not attempt broad cleanup that could cause additional damage.
