# <PROJECT_NAME> Architecture

## Purpose

<WHAT_THE_SYSTEM_DOES>

## Components

```text
<COMPONENT_DIAGRAM>
```

## Repository layout

```text
<IMPORTANT_FOLDERS_AND_PURPOSES>
```

## Data/control flow

<HOW_REQUESTS_DATA_AND_JOBS_MOVE>

## External services

- <SERVICE> — <PURPOSE>

## Persistence

<WHAT_STATE_MUST_SURVIVE_RESTARTS>

## Important invariants

- <RULE_FUTURE_AGENTS_SHOULD_NOT_CASUALLY_BREAK>

## Architectural decisions

- <DECISION> — <WHY>

## Mandatory free-first architecture rule

Architecture must follow the parent Bridge `docs/FREE_FIRST_POLICY.md`. Prefer free/included/local/browser/open-source/repository components. Do not introduce a paid/quota API, token-metered AI backend, or provider AI Agent without explicit prior user approval. Before inventing a new component, search the project/repository and then trusted public repos/docs/internet for a maintained compatible implementation that can be reused with minimal scope.
