# Free-First / API-Last / No-Surprise-Spend Policy

This policy is mandatory for Bridge and every project managed by Bridge. It overrides any older guidance that would cause unnecessary API dependency, paid API usage, AI-agent quota usage, duplicated implementation, avoidable vendor lock-in, or needless reinvention.

## 1. Primary objective

Keep Bridge and managed projects **free whenever practical, or as close to free as possible**. Cost minimization and reuse are first-class architecture requirements, not afterthoughts.

## 2. API-last rule — applies even to free APIs

External APIs are a **last-choice integration path**, not the default.

If the same task can reasonably be done with a browser/UI, existing connected tool, local CLI/program, local PC executor, existing repository code, Git/GitHub workflow, ordinary platform control, open-source/self-hosted tool, or another capability the user already has, use that path instead of adding/calling an external API.

This API-last rule applies even when an API has a free tier. The reasons are to avoid quota surprises, rate limits, credentials, vendor lock-in, extra failure modes, and unnecessary dependencies.

An external API may be proposed only when the existing non-API/tool/repository paths cannot reasonably satisfy the task. If it also consumes money, credits, tokens, or separate quota, explicit prior user approval is mandatory.

Do not build a new API dependency merely because it is technically convenient.

## 3. No paid/quota API without explicit approval

Do **not** add, enable, call, or depend on an external paid API, token-metered AI API, provider AI Agent, paid automation service, paid connector, metered LLM endpoint, or quota-consuming service on the user's behalf unless the user explicitly approves it **before** use.

This includes provider AI agents such as Railway AI Agent when their use consumes a separate AI quota or billable allowance.

Never assume that an available API key, environment variable, connected account, credit balance, or technical capability is permission to spend quota or money.

## 4. Prefer existing included/free paths

Use these before an external API whenever they can reasonably complete the task:

- browser/web UI already included in a subscription the user already has;
- ChatGPT Web or Google AI Studio Web instead of metered LLM API calls;
- the local Windows PC executor;
- existing connected tools that do not create a new paid/API dependency;
- Git/GitHub repository and CI operations;
- Railway's ordinary non-AI service controls when included in the existing plan;
- local CLI/programs already installed;
- open-source/self-hosted software;
- code already present in this repository or another compatible repository;
- free/included platform features.

Bridge runtime must not silently introduce an external API or paid AI dependency when an existing tool/path can do the same job.

## 5. Reuse before rebuild

Before building a capability from scratch, and whenever troubleshooting starts taking materially longer than expected:

1. Search the current repository for an existing implementation.
2. Search trusted public repositories, official docs, and the internet for an existing maintained solution.
3. Prefer reusing, adapting, or integrating an existing safe/licensed/compatible implementation over rewriting the same capability.
4. Keep the imported scope minimal; do not pull a huge framework for one tiny feature.
5. Run the project's required quality/security checks after integration.

The goal is **fast path, not reinvention**.

## 6. Time-budget rule

For a small task, do not let troubleshooting grow into an open-ended investigation. If the obvious implementation/fix path fails and a second targeted attempt does not resolve it, check the repository and public ecosystem before continuing custom work.

If the preferred browser/tool/local/repository route is blocked, stop and compare existing alternatives before inventing a new API integration. If a paid/quota route appears materially easier, do not silently switch to it; ask first.

## 7. Approval requirements for any paid/quota path

Before requesting approval, state:

- exactly what service/API/agent would be used;
- why the existing non-API/free/included path is insufficient;
- expected cost or quota consumption when knowable;
- whether the dependency is one-time or recurring;
- how to remove/disable it later;
- the free/non-API alternative and its trade-off.

No approval = no paid/quota use.

## 8. Internal protocol clarification

Bridge may use its own REST/HTTP endpoints and ordinary protocol calls as internal implementation plumbing. This does **not** authorize introducing an external API dependency. Internal Bridge protocol traffic is distinct from choosing a third-party API when an existing browser/tool/local/repository path already exists.

## 9. Deployment rule

Routine deployment must not depend on a provider AI Agent or newly introduced external API. Prefer deterministic Git/CI/platform-native deployment paths that are free/included and reproducible. Provider AI Agents are troubleshooting tools of last resort and require explicit approval if they consume separate quota.

## 10. Documentation rule

Every project created from `Apps/_TEMPLATE/` inherits this policy. Handoffs must record any explicitly approved external API or paid dependency, its purpose, current usage/cost/quota risk, why an existing tool/non-API path was insufficient, and how to disable it.

If a project can remove an API/paid dependency in favor of an existing tool, browser, local, repository, open-source, or free/included path without materially harming required functionality, prefer the simpler free path.
