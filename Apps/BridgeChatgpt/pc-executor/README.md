# Bridge Local Executor (PC)

## Recommended: pair from the Bridge web app

1. Open the normal Bridge web URL on PC or tablet.
2. Select **PC** for the project.
3. In **System Details → Local Executor**, press **Connect PC**.
4. Copy the generated PowerShell setup command and run it on the Windows PC.
5. Choose the exact project root folder (for example `D:\\AIProjects\\MyApp` or `F:\\Work\\ProjectA`).
6. Choose whether that PC worker may write files and/or run allowlisted commands.

The pairing code is single-use and expires. The resulting PC credential is scoped to one Bridge workspace/project and the worker itself is locked to the chosen local root folder. The normal UI remains the single Bridge web app; the local process is only the background executor.


Bridge Local Executor turns a Windows/macOS/Linux computer into a project-scoped worker for Bridge.

The worker makes **outbound HTTPS polling requests** to Bridge. You do not need to expose a port, configure router port-forwarding, or run a public tunnel. The local web app only binds to `127.0.0.1` by default.

## What v1 can do

- register one PC node against a Bridge workspace/project
- show PC online/offline state inside Bridge
- list/read files inside the configured project root
- optional file writes (off by default)
- read-only `git status` and `git diff`
- optional `npm test`, `npm run build`, and allowlisted argv commands (off by default)
- upload stdout/stderr/results back to Bridge
- keep a local audit log at `~/.bridge-executor/audit.jsonl`
- expose a local control panel at `http://127.0.0.1:4588`

## Start

From the Bridge repository:

```bash
npm install
npm run executor:dev
```

Open:

```text
http://127.0.0.1:4588
```

Fill in:

- Bridge URL (for example `https://bridge-ai-mission-control.ai.studio`)
- executor token
- Bridge workspace ID
- project ID
- local project folder
- PC/node name

Then click **Save & connect**.

## Bridge environment

Prefer a dedicated token on the Bridge server:

```env
BRIDGE_EXECUTOR_TOKEN=replace-with-a-long-random-secret
```

The PC web app stores its local configuration in:

```text
~/.bridge-executor/config.json
```

The configuration file is created with user-only permissions where supported.

`BRIDGE_MCP_TOKEN` is also accepted by the executor routes for Bridge agents, but the PC worker should normally use `BRIDGE_EXECUTOR_TOKEN`.

## Security model

The v1 worker is deliberately constrained:

- every built-in filesystem action resolves paths under the configured project root
- `../` traversal outside the project root is rejected
- file writes are disabled until explicitly enabled in the PC control panel
- command/test/build execution is disabled until explicitly enabled; once enabled, project scripts are trusted code and are not an OS sandbox
- `command.run` receives an argv array and uses `shell: false`
- command executables are allowlisted
- large file reads, payloads, and output are capped
- the local control panel binds to loopback only by default

This is an executor, not a replacement for Bridge routing. Bridge remains the task/session/project controller; the PC node is the worker that performs local actions.

---

## Mandatory free-first rule

The PC executor is the preferred execution path when it avoids metered cloud/API work. Follow `docs/FREE_FIRST_POLICY.md`: no paid or quota-consuming API/AI Agent without explicit prior user approval. Reuse local tools and existing repository capabilities first. If work starts taking too long, check this repo and trusted public repositories/docs/internet for a maintained compatible solution before adding a new paid service or rebuilding functionality from scratch.
