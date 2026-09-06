# <PROJECT_NAME> Runbook

## Setup

1. <SETUP_STEP>

## Development

- Install: `<COMMAND>`
- Dev: `<COMMAND>`
- Typecheck/lint: `<COMMAND>`
- Test: `<COMMAND>`
- Build: `<COMMAND>`

## Deployment

1. <DEPLOY_STEP>

## Sync/update

1. <HOW_TO_SYNC_GITHUB_LOCAL_DEPLOYMENT>

## Restart / outage recovery

1. <RECOVERY_STEP>

## E2E verification

1. <E2E_STEP>

## Common failures

### <FAILURE>

Cause: <CAUSE>

Fix/diagnosis: <STEPS>

## Mandatory free-first operating rule

Follow the parent Bridge `docs/FREE_FIRST_POLICY.md`. Routine operations and deployment must prefer deterministic free/included paths and must not depend on paid/quota AI Agents or metered APIs. If the normal path fails and two targeted attempts do not resolve it, check this project/repository and trusted public repos/docs/internet before building more custom machinery. Stop and ask before any paid/quota fallback.

## Handoff before ending a session

Update `docs/HANDOFF.md` and `docs/ROADMAP.md`, record the latest verified commit/deployment/test state, and clearly mark anything not proven. Record any explicitly approved paid dependency, its quota/cost risk, and how to disable it.
