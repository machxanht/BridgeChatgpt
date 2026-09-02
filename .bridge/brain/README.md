# Bridge Project Brain

Project Brain is shared project context. It is deliberately separate from any individual ChatGPT chat, AI Studio tab, account, or runtime instance.

## Join protocol

A new agent/session joining this repository should:

1. Read `.bridge/brain/PROJECT_STATE.json`.
2. Read the current Bridge task/batch state for the target workspace.
3. Treat durable entries (`goal`, `decision`, `architecture`, `blocker`, `fact`, `handoff`) as shared team context.
4. Keep temporary reasoning and experiments in session-local scratch; do not write raw chain-of-thought or full chat transcripts into Project Brain.
5. Before handing work to another session, record only the durable delta: decisions, files affected, tests/results, blockers, and next action.

## Memory scopes

- `goal`: current project outcome or milestone.
- `decision`: a decision future sessions must respect.
- `architecture`: stable system structure or invariant.
- `blocker`: unresolved issue that can stop or redirect work.
- `fact`: durable project fact worth reusing.
- `handoff`: concise continuation packet from one session/agent to another.

## Source of truth

GitHub is the durable source-of-truth snapshot. Bridge runtime may keep newer runtime memory in `data/project-brain.json`; the repo snapshot is the portable bootstrap that other ChatGPT sessions and synced workspaces can read without replaying another conversation.

## Concurrency rule

Do not make every agent overwrite a giant shared transcript. Prefer small scoped memory entries and append/merge semantics. Project task state remains separate from Project Brain.
