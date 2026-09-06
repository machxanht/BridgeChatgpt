# <PROJECT_NAME> — Free-First / API-Last Policy

This project inherits the Bridge free-first/API-last policy. This file is mandatory operating guidance for every agent/session working on the project.

## Core rule

Keep the project free whenever practical, or as close to free as possible.

External APIs are a **last-choice path even when they have a free tier**. If the same task can reasonably be done with an existing browser/UI, connected tool, local CLI/program, local PC execution, Git/GitHub workflow, repository code, ordinary included platform control, open-source/self-hosted software, or another capability the user already has, use that instead of adding/calling an external API.

Do not add, enable, call, or depend on an external paid API, token-metered AI API, provider AI Agent, paid automation, paid connector, or quota-consuming service unless the user explicitly approves it **before** use.

An available API key, environment variable, connected account, credit balance, quota, or technical capability is not permission to use/spend it.

## Preferred order

Use these first when they can satisfy the task:

1. existing project/repository implementation;
2. browser/web UI included in subscriptions the user already has;
3. existing connected tool or local CLI/program;
4. local PC execution;
5. Git/GitHub and ordinary included platform controls;
6. open-source/self-hosted software;
7. trusted maintained public repository code that can be safely/licensably integrated;
8. other free/included paths;
9. external API only when the above cannot reasonably satisfy the requirement.

Do not silently replace an existing browser/tool/local/included path with an API merely because the API is convenient.

## Reuse before rebuild

Before building a capability from scratch, search this project/repository first. If implementation or troubleshooting starts taking materially longer than expected, search trusted public repositories, official docs, and the internet for an existing maintained compatible solution. Prefer minimal safe integration over rewriting the same capability.

## API / paid-quota fallback

If existing non-API paths are genuinely insufficient, explain why before introducing a new external API dependency. If the API/service also consumes money, credits, tokens, or separate quota, explicit prior user approval is mandatory.

Before a paid/quota fallback, state:

- the service/API/agent;
- why existing non-API/free paths are insufficient;
- expected cost/quota when knowable;
- whether cost is one-time or recurring;
- how to disable/remove it;
- the non-API/free alternative and trade-off.

No explicit approval = no paid/quota use.

## Documentation

Record any explicitly approved external API or paid/quota dependency in `docs/HANDOFF.md`, including purpose, why existing tools were insufficient, cost/quota risk, free/non-API alternative, and removal path. Never store raw secrets in Markdown.
