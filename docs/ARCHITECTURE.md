# Bridge Architecture

## Purpose

Bridge is a multi-project control plane that lets the user operate projects from a tablet while a Windows PC performs local filesystem/Git/test/build work. Natural-language agents such as ChatGPT Web and Google AI Studio Web can be bound per project and woken through a browser extension.

## High-level topology

```text
                    ┌─────────────────────────────┐
                    │           Tablet            │
                    │ Bridge UI / PC Control/chat │
                    └──────────────┬──────────────┘
                                   │ HTTPS
                                   ▼
                    ┌─────────────────────────────┐
                    │           Railway           │
                    │ Bridge server/control plane │
                    │                             │
                    │ - project registry          │
                    │ - tasks/messages            │
                    │ - executor jobs             │
                    │ - wake queue                │
                    │ - Studio relay              │
                    │ - persistent SQLite/state   │
                    └───────┬───────────┬─────────┘
                            │           │
                   executor│           │wake/task relay
                            │           │
                            ▼           ▼
             ┌────────────────────┐   ┌─────────────────────┐
             │   Windows PC       │   │ Browser agent pages │
             │                    │   │                     │
             │ Local Executor     │   │ ChatGPT Web         │
             │ E:\AI\Bridge       │   │ Google AI Studio    │
             │                    │   │                     │
             │ Apps/<Project>     │   │ Bridge Wake ext.    │
             └────────────────────┘   └─────────────────────┘
                            │
                            ▼
                    Git / test / build
```

## Repository and PC layout

The Bridge repository is itself located at the approved PC root:

```text
E:\AI\Bridge
```

The project shelf is:

```text
Apps/
├── BridgeChatgpt/          # Bridge source code
├── LearningKhmer/          # example independent project
├── OukChatrang/            # example independent project
└── ...
```

Every non-Bridge project under `Apps/*` is expected to be an independent nested Git repository. The Bridge repository ignores these folders so adding a project does not pollute Bridge's own working tree.

## Major source modules

```text
Apps/BridgeChatgpt/
├── src/                    # tablet/web UI
├── server/                 # Railway backend/control plane
├── pc-executor/            # Windows polling worker
├── browser-wake/           # Chrome/Edge extension
├── android-wake/           # Android companion code
├── tests/                  # regression/integration tests
├── server.ts               # backend entrypoint
├── vite.config.ts
└── tsconfig.json
```

## Project registry model

Each project workspace records:

- `workspace_id`
- `project_id`
- `project_name`
- repository URL
- default branch
- `local_path` — always under `Apps/`
- execution target (`pc` or `studio`)
- bound ChatGPT/Studio resources

Project creation reserves a deterministic readable local path:

```text
Apps/<ProjectName>
```

When an online PC executor is available, Bridge can queue a clone/setup job into that path.

## PC executor model

### Machine-scoped pairing

A physical PC is paired once. The existing pairing record retains the workspace/project where pairing originally happened only for backward compatibility/audit.

The durable identity is the `node_id`, derived from machine identity + approved root.

A machine-scoped node can execute jobs belonging to different Bridge projects. Each job still retains its real `workspace_id` and `project_id` for history.

### Project isolation

Project isolation is not achieved by creating a new PC token for every project. It is achieved by combining:

1. a specific assigned `node_id`;
2. the workspace/project identity on the job;
3. controller-side forcing of job `cwd` to workspace `local_path`;
4. executor-side `safeProjectPath()` validation against the approved root;
5. an executable allowlist for command actions.

This allows one PC to serve many projects without losing filesystem boundaries.

## Browser Wake model

The Chrome/Edge extension:

1. polls `GET /api/resource-registry/wake-queue`;
2. finds or opens the target ChatGPT/AI Studio tab from its registered resource URL;
3. checks for busy/draft state;
4. injects the queued prompt;
5. clicks the send control (or uses an Enter fallback);
6. records local delivery state to avoid rapid duplicates.

The selected direction is browser-only. ChatGPT Desktop integration is not part of the current roadmap.

## Chat path

For a natural-language PC task, the intended flow is:

```text
Tablet Bridge Chat
        ↓
Railway creates bound task/message
        ↓
Bridge Wake opens/wakes bound ChatGPT/Studio page
        ↓
Agent interprets task
        ↓
Bridge queues scoped executor work
        ↓
Windows PC executes inside Apps/<Project>
        ↓
Result returns to Railway/UI
```

A task is not considered E2E proven until the entire relevant chain has been observed live.

## Persistence

Railway uses persistent data mounted under `/app/data`. SQLite and registry/executor state must survive deployment restarts. Never replace persistence with ephemeral container-local state unless explicitly migrating it.

## Deployment model

Production is deployed from GitHub to Railway. A successful GitHub merge is not enough to claim live deployment. Always verify the Railway deployment metadata contains the intended commit hash.

Routine deploy/recovery architecture must not depend on a provider AI Agent. Deterministic free/included Git/platform controls are preferred; a paid/quota AI Agent is a last-resort path requiring explicit prior user approval.

## Free-first architecture invariant

`docs/FREE_FIRST_POLICY.md` is part of the architecture contract. Bridge should avoid external paid API dependencies and token-metered AI backends when browser/subscription UI, local PC execution, repository code, open-source/self-hosted components, or other free/included paths can satisfy the requirement. Before adding a new subsystem, search this repository first and, when custom implementation or troubleshooting starts dragging, search trusted public repos/docs/internet for an existing maintained compatible solution.

## Design invariants

Future changes should preserve these invariants unless explicitly redesigned:

- One project = one readable `Apps/<ProjectName>` folder.
- One physical PC = one paired executor identity.
- One PC may serve many projects.
- No job may escape the approved Bridge filesystem root.
- Browser is the selected ChatGPT/Studio wake mechanism.
- Railway is the central control plane; the PC is the execution machine.
- GitHub + handoff docs are the durable recovery source when chat context disappears.
- Free/included execution is preferred; no paid/quota API or provider AI Agent without explicit prior user approval.
