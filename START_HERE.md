# START HERE — BridgeChatgpt

If you are a new ChatGPT/AI Studio/agent session with little or no chat history, **start here instead of guessing**.

## Read in this order

1. `AGENTS.md` — operating contract and security boundary.
2. `docs/FREE_FIRST_POLICY.md` — mandatory cost/quota/reuse policy.
3. `docs/HANDOFF.md` — exact current state, last known good points, unfinished work.
4. `docs/ARCHITECTURE.md` — how Railway, PC, tablet, browser wake, ChatGPT and Studio fit together.
5. `docs/SECURITY.md` — what the agent is and is not allowed to touch.
6. `docs/RUNBOOK.md` — normal operation, deployment and recovery commands/verification.
7. `docs/ROADMAP.md` — remaining work and completion criteria.
8. `docs/PROJECT_STANDARD.md` — mandatory convention for every future project.

## Canonical repository layout

```text
E:\AI\Bridge\
├── Apps\
│   ├── BridgeChatgpt\        # this Bridge application
│   └── <ProjectName>\        # independent future project repositories
├── runtime\                  # Bridge runtime/command bus
├── artifacts\                # generated artifacts
├── docs\                     # Bridge handoff/operations documentation
├── AGENTS.md
└── START_HERE.md
```

GitHub repository: `machxanht/BridgeChatgpt`

Production Bridge URL: `https://bridgechatgpt-production.up.railway.app`

## Core operating facts

- Railway is the always-on Bridge control plane.
- The Windows PC is the execution machine, not Railway.
- One paired PC executor is intended to serve all projects under the approved Bridge root.
- Each project has a registered local path `Apps/<ProjectName>`.
- Tablet is the normal control UI.
- ChatGPT Web and Google AI Studio Web are optional natural-language agents bound by project resource URL.
- Bridge Wake is the browser extension responsible for opening the correct bound page and injecting a queued prompt.
- ChatGPT Desktop is intentionally out of scope; browser is the chosen path.

## Security boundary

The currently approved local filesystem root is:

```text
E:\AI\Bridge
```

Do not browse or operate outside that root without explicit new human authorization. See `docs/SECURITY.md`.

## FREE-first / no-paid-API boundary

Free or lowest-cost operation is a first-class requirement. No agent may add, enable, or call a paid/quota API, token-metered AI API, provider AI Agent, or paid automation without explicit prior user approval. Prefer browser/subscription UI, local PC, existing repository code, ordinary included platform controls, Git/GitHub, open-source/self-hosted solutions, and other free/included paths. If work or troubleshooting starts taking too long, search this repository first, then trusted public repositories/docs/internet for an existing compatible implementation before building more custom machinery. See `docs/FREE_FIRST_POLICY.md`.

## Source-of-truth rule

Never assume the latest chat message equals live state. Before claiming completion:

- verify GitHub branch/commit;
- verify CI;
- verify Railway deployment commit hash when deployment matters;
- verify PC/browser/agent live state when the feature depends on them.

## If the previous chat session disappeared

Do **not** ask the user to reconstruct the whole project from memory. Read the documents above, inspect GitHub `main`, then compare live Railway state with `docs/HANDOFF.md`. Continue from the first item marked unfinished or blocked.
