# <PROJECT_NAME> — Free-First / No-Paid-API Policy

This project inherits the Bridge free-first policy. This file is mandatory operating guidance for every agent/session working on the project.

## Core rule

Keep the project free whenever practical, or as close to free as possible. Do not add, enable, call, or depend on an external paid API, token-metered AI API, provider AI Agent, paid automation, paid connector, or quota-consuming service unless the user explicitly approves it **before** use.

An available API key, environment variable, connected account, credit balance, quota, or technical capability is not permission to spend.

## Preferred order

Use these first when they can satisfy the task:

1. existing project/repository implementation;
2. browser/web UI included in subscriptions the user already has;
3. local PC execution and already-installed tools;
4. Git/GitHub and ordinary included platform controls;
5. open-source/self-hosted software;
6. trusted maintained public repository code that can be safely/licensably integrated;
7. other free/included paths.

Do not silently replace a browser/local/included path with a metered API.

## Reuse before rebuild

Before building a capability from scratch, search this project/repository first. If implementation or troubleshooting starts taking materially longer than expected, search trusted public repositories, official docs, and the internet for an existing maintained compatible solution. Prefer minimal safe integration over rewriting the same capability.

## Paid/quota fallback

If the free path is blocked or materially slower, stop and ask before switching. State:

- the service/API/agent;
- why the free path is insufficient;
- expected cost/quota when knowable;
- whether cost is one-time or recurring;
- how to disable/remove it;
- the free alternative and trade-off.

No explicit approval = no paid/quota use.

## Documentation

Record any explicitly approved paid/quota dependency in `docs/HANDOFF.md`, including purpose, cost/quota risk, free alternative, and removal path. Never store raw secrets in Markdown.
