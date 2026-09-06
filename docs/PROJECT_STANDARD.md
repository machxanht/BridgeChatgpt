# Mandatory Project Standard

This standard applies to every project managed by Bridge.

## 1. Project location

Every project must have one readable folder under:

```text
E:\AI\Bridge\Apps\<ProjectName>
```

Do not scatter projects across unrelated drives/folders unless the human explicitly approves a new Bridge root.

## 2. Repository independence

Each `Apps/<ProjectName>` may be its own Git repository. The parent Bridge repository must ignore unrelated `Apps/*` project repos so their source is never accidentally committed into BridgeChatgpt.

`Apps/BridgeChatgpt` is the exception: it is the Bridge application and is tracked by the parent Bridge repository.

## 3. Required documentation

Every project must contain:

```text
START_HERE.md
docs/HANDOFF.md
docs/ARCHITECTURE.md
docs/RUNBOOK.md
docs/SECURITY.md
docs/ROADMAP.md
```

Use `Apps/_TEMPLATE/` as the starting point.

A project is not considered properly onboarded until these files exist and contain project-specific information rather than placeholder text.

## 4. START_HERE.md requirements

Must answer:

- What is this project?
- Where is the repo?
- What branch is canonical?
- What local path does Bridge use?
- Which document should a replacement agent read next?
- What is the highest-priority unfinished item?

Keep it short enough to scan quickly.

## 5. HANDOFF.md requirements

Must be the most useful replacement-session document and include:

- exact current state;
- latest known good commit;
- live deployment/environment IDs if applicable;
- completed milestones;
- work currently in progress;
- unfinished items;
- blockers requiring human action;
- exact next recommended step;
- known inconsistencies between GitHub/local/deployed state;
- last verification time/timezone when meaningful;
- any explicitly approved paid/quota dependency, why it exists, expected cost/quota risk, and how to disable/remove it.

Never mark an item PASS unless it was actually proven.

## 6. ARCHITECTURE.md requirements

Must document:

- major components;
- data/control flow;
- folder/module boundaries;
- external services;
- persistence;
- important invariants;
- architectural decisions that future agents should not casually reverse.

## 7. RUNBOOK.md requirements

Must document operational procedures such as:

- install/setup;
- dev/test/build commands;
- deploy procedure;
- sync/update procedure;
- common failures;
- recovery after restart/outage;
- E2E verification steps.

Routine deployment should be deterministic and free/included; do not make a provider AI Agent the normal deployment mechanism.

## 8. SECURITY.md requirements

Must document:

- approved filesystem scope;
- secret handling;
- destructive-operation restrictions;
- external service boundaries;
- paid/quota service boundaries;
- any project-specific safety constraints.

Do not store raw secrets.

## 9. ROADMAP.md requirements

Use explicit status markers:

```text
✅ PASS / proven
🟢 implemented, live verification may still be needed
🟡 partial / in progress
🔴 blocked / broken
⬜ not started
```

Each unfinished item should state the next acceptance test or completion criterion.

## 10. New-project onboarding checklist

When Bridge creates or clones a new project:

1. Ensure local path is `Apps/<ProjectName>`.
2. Ensure its repo is independent from Bridge's parent Git repo.
3. Copy `Apps/_TEMPLATE/` docs into the new project.
4. Replace placeholders with actual project details.
5. Commit the documentation in the project's own repo.
6. Register correct repo URL/default branch in Bridge.
7. Bind ChatGPT/Studio resource URLs if used.
8. Run baseline tests/build.
9. Record baseline result in `docs/HANDOFF.md`.
10. Record the free/included execution/deployment path and verify there is no unapproved paid/quota dependency.

## 11. Session handoff rule

After a substantial code, infrastructure, deployment, security, or architecture change, update the project's handoff documents in the same work session.

If code and documentation disagree, treat that as unfinished work.

## 12. Multi-project executor rule

Do not pair the same physical PC separately for each project. A single machine-scoped executor serves approved projects under the Bridge root; jobs are isolated by project `local_path`/`cwd`.

## 13. Git discipline

- Prefer focused branches/PRs for structural changes.
- Do not overwrite another project's nested repo from the parent Bridge repo.
- Do not use force reset as normal sync.
- Preserve uncommitted user work.

## 14. Completion standard

Implementation, deployment, and E2E verification are separate states. Documentation must say which one is actually complete.

## 15. FREE-first / no-paid-API standard — mandatory

Every Bridge-managed project inherits `docs/FREE_FIRST_POLICY.md`.

- Free or lowest-cost operation is the default architecture requirement.
- Do not add, enable, call, or depend on paid/quota APIs, token-metered AI APIs, provider AI Agents, paid automation, or similar metered services without explicit prior user approval.
- Existing API keys, credits, environment variables, connected accounts, or technical access never imply permission to spend.
- Prefer browser/subscription UI, local PC execution, existing tools, repository code, ordinary included platform controls, Git/GitHub, open-source/self-hosted software, and free/included services.
- Before building a capability from scratch, search the project and parent Bridge repositories. If implementation or troubleshooting is taking materially too long, search trusted public repositories, official docs, and the internet for an existing maintained compatible solution and prefer reuse/integration when safe and appropriately licensed.
- If the free path is blocked or materially slower, stop and present options. State the paid/quota option, why it is needed, expected cost/quota when knowable, and the free alternative. No approval means do not use it.
- Internal REST/HTTP plumbing is allowed, but it must not silently create an external paid dependency.
