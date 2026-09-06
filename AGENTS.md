# AGENTS.md — Bridge Operating Contract

This file is mandatory reading for every ChatGPT, Google AI Studio, Gemini, Codex, human operator, or other agent that works on this repository.

## 0. Start here — no exceptions

Before making changes, read these files in order:

1. `START_HERE.md`
2. `docs/HANDOFF.md`
3. `docs/ARCHITECTURE.md`
4. `docs/SECURITY.md`
5. `docs/RUNBOOK.md`
6. `docs/ROADMAP.md`
7. `docs/PROJECT_STANDARD.md`
8. `docs/FREE_FIRST_POLICY.md`

Do not reconstruct project state from chat memory alone. GitHub `main` + the handoff documents are the durable source of truth. When live infrastructure can be checked, verify it before claiming that something is online, deployed, synced, or completed.

## 1. Current Bridge model

Bridge is a control plane for multiple independent projects stored on the Windows PC under:

```text
E:\AI\Bridge\Apps\<ProjectName>
```

`Apps/BridgeChatgpt` is the Bridge application itself. Other `Apps/<ProjectName>` folders are independent nested repositories and are intentionally ignored by the Bridge repository.

The major components are:

- **Railway** — always-on Bridge server/control plane, persistent state, task routing, project registry.
- **Windows PC** — execution machine. One paired PC executor serves all approved projects under the Bridge root.
- **Tablet** — main operator UI.
- **ChatGPT Web / Google AI Studio Web** — optional natural-language agents, bound per project by resource URL.
- **Bridge Wake browser extension** — opens/binds the correct browser tabs and injects queued prompts.
- **GitHub** — durable source, review/CI, and optional command bus.

## 2. Filesystem and security boundary

The approved Bridge root is currently:

```text
E:\AI\Bridge
```

Agents must not read, search, write, delete, move, or execute filesystem-affecting operations outside approved Bridge roots unless the human explicitly grants a new scope.

Rules:

- `Apps/<ProjectName>` is the only normal home for projects.
- Project jobs must execute with `cwd` equal to that project's registered `local_path`.
- The PC executor must reject paths that escape its approved root.
- Do not use broad recursive delete/reset/clean operations without task-specific authorization.
- Do not copy browser cookies, credentials, secrets, or unrelated user files.
- Technical capability never implies permission.

See `docs/SECURITY.md` for the complete policy.

## 3. Multi-project PC executor rule

A physical PC is paired once. It is **not** re-paired per project.

Node pairing metadata may retain the workspace/project that originally created the token for backward compatibility, but authorization is machine-scoped by `node_id`. Project isolation is achieved by:

1. assigning the job to a specific PC node;
2. retaining the job's real `workspace_id` and `project_id`;
3. forcing the job `cwd` to the workspace `local_path` (`Apps/<ProjectName>`);
4. enforcing the executor root boundary on the PC.

Any future change that reintroduces “one PC token per project” is a regression unless explicitly approved.

## 4. Project documentation standard

Every project must have durable Markdown handoff documentation. New projects should copy the structure from `Apps/_TEMPLATE/`.

Minimum required documents:

```text
<project>/
├── START_HERE.md
└── docs/
    ├── HANDOFF.md
    ├── ARCHITECTURE.md
    ├── RUNBOOK.md
    ├── SECURITY.md
    └── ROADMAP.md
```

The documents must contain enough information for a new agent with no prior chat context to continue safely.

### Required handoff content

At minimum record:

- project goal and current architecture;
- exact repository/branch and latest known good commit;
- live environments and deployment identifiers where relevant;
- local project path;
- completed work;
- unfinished work and blockers;
- test/build/deploy commands;
- recovery procedure;
- security/permission boundaries;
- known dangerous operations or irreversible steps;
- next recommended action.

Never put raw secrets, tokens, passwords, cookies, API keys, or private credentials in Markdown.

## 5. End-of-session rule

Before ending a substantial work session or handing work to another agent:

1. Verify the actual Git diff/state.
2. Run the relevant typecheck/tests/build.
3. Update `docs/HANDOFF.md` with what changed.
4. Update `docs/ROADMAP.md` statuses.
5. Update `START_HERE.md` only when the canonical entrypoint/state changes.
6. Record exact commit/deployment IDs when they are known.
7. Clearly mark anything that is **not proven**.
8. Push/merge documentation with the code it describes whenever possible.

A task is not “done” merely because source code exists. If the feature requires Railway, PC, browser, Studio, or ChatGPT integration, live proof must be recorded before marking E2E complete.

## 6. Git and deployment rules

- Prefer a feature branch + CI + pull request for structural changes.
- Do not claim Railway is on the latest source until the deployment `commitHash` is verified.
- Avoid force pushes unless recovering a documented branch-state problem and the human has approved the recovery.
- Do not rely on stale Railway source metadata; use deployment metadata for the actually running commit.
- Keep the Bridge root clean: nested projects under `Apps/*` are independent repos and must remain ignored by the Bridge repo.

## 7. Agent roles

Roles are capabilities, not hard-coded product identities.

### ChatGPT / reviewer / architect

May analyze architecture, review diffs, create tasks, coordinate work, and — when authorized tools allow it — make scoped repository changes. It must respect the same filesystem and documentation rules as every other agent.

### AI Studio / coding agent

May implement assigned work, test it, and report results. It must read the handoff before editing and must not assume it owns the PC filesystem.

### PC executor

Executes only supported, scoped actions inside its approved root. It is an execution worker, not a natural-language agent.

## 8. Communication quality

When reporting status, separate:

- **PASS / proven live**
- **implemented but not live-proven**
- **not done**
- **blocked / requires human action**

Do not hide uncertainty behind “done”. Do not repeatedly re-test already proven steps unless a new change could have invalidated them.

## 9. Recovery entrypoint

If chat context is lost, do this first:

```text
Read START_HERE.md → docs/HANDOFF.md → docs/ROADMAP.md
```

Then verify GitHub `main` and live Railway deployment before changing anything.

## 10. FREE-first / no-paid-API rule — mandatory

`docs/FREE_FIRST_POLICY.md` is a hard operating constraint for every agent and project.

- Default to free/included/local/browser/open-source/repository solutions.
- Do not add, enable, or call a paid API, token-metered AI API, provider AI Agent, paid automation, or quota-consuming service without explicit prior user approval.
- Availability of an API key, credit balance, environment variable, connected account, or tool does **not** equal permission to spend quota or money.
- Prefer ChatGPT Web / AI Studio Web / local PC / GitHub / ordinary Railway controls / existing tools over metered AI APIs when they can do the job.
- Railway AI Agent is not a routine deploy path and must not be used just because it is available.
- Before building from scratch, search this repo. If work/troubleshooting is dragging, search trusted public repos/docs/internet and reuse a maintained compatible solution when practical.
- If the free path is blocked or materially slower, stop and ask. State the paid option, expected cost/quota, why it is needed, and the free alternative.
- Internal Bridge REST/HTTP plumbing is allowed, but it must not silently create an external paid API dependency.

No explicit approval = no paid/quota path.
