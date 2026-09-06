# Free-First / No-Paid-API Policy

This policy is mandatory for Bridge and every project managed by Bridge. It overrides any older guidance that would cause unnecessary paid API usage, AI-agent quota usage, duplicated implementation, or avoidable vendor lock-in.

## 1. Primary objective

Keep Bridge and managed projects **free whenever practical, or as close to free as possible**. Cost minimization is a first-class architecture requirement, not an afterthought.

## 2. No paid/quota API without explicit approval

Do **not** add, enable, call, or depend on an external paid API, token-metered AI API, provider AI Agent, paid automation service, paid connector, metered LLM endpoint, or quota-consuming service on the user's behalf unless the user explicitly approves it **before** use.

This includes provider AI agents such as Railway AI Agent when their use consumes a separate AI quota or billable allowance.

Never assume that an available API key, environment variable, connected account, credit balance, or technical capability is permission to spend quota or money.

## 3. Prefer existing included/free paths

If the task can be completed with any of the following, use them before a paid API:

- browser/web UI already included in a subscription the user already has;
- ChatGPT Web or Google AI Studio Web instead of metered LLM API calls;
- the local Windows PC executor;
- existing connected tools that do not create a new paid dependency;
- Git/GitHub repository operations;
- Railway's ordinary non-AI service controls when included in the existing plan;
- local CLI/programs already installed;
- open-source/self-hosted software;
- code already present in this repository or another compatible repository;
- free/included platform features.

Bridge runtime must not silently introduce a paid AI/API dependency.

## 4. Reuse before rebuild

Before building a capability from scratch, and whenever troubleshooting starts taking materially longer than expected:

1. Search the current repository for an existing implementation.
2. Search trusted public repositories, official docs, and the internet for an existing maintained solution.
3. Prefer reusing, adapting, or integrating an existing safe/licensed/compatible implementation over rewriting the same capability.
4. Keep the imported scope minimal; do not pull a huge framework for one tiny feature.
5. Run the project's required quality/security checks after integration.

The goal is **fast path, not reinvention**.

## 5. Time-budget rule

For a small task, do not let troubleshooting grow into an open-ended investigation. If the obvious implementation/fix path fails and a second targeted attempt does not resolve it, check the repository and public ecosystem before continuing custom work.

If the free route is blocked or would take materially longer than another route, stop and present the options instead of silently switching to a paid/quota path.

## 6. Approval requirements for any paid/quota path

Before requesting approval, state:

- exactly what service/API/agent would be used;
- why the free/included path is insufficient;
- expected cost or quota consumption when knowable;
- whether the dependency is one-time or recurring;
- how to remove/disable it later;
- the free alternative and its trade-off.

No approval = no paid/quota use.

## 7. Internal protocol clarification

Bridge may use its own REST/HTTP endpoints and ordinary protocol calls as implementation plumbing. Those internal calls are not permission to introduce an external paid API dependency. Any external service that can create separate billing, token usage, credits usage, or AI-agent quota remains subject to this policy.

## 8. Deployment rule

Routine deployment must not depend on a provider AI Agent. Prefer deterministic Git/CI/platform-native deployment paths that are free/included and reproducible. Provider AI Agents are troubleshooting tools of last resort and require explicit approval if they consume separate quota.

## 9. Documentation rule

Every project created from `Apps/_TEMPLATE/` inherits this policy. Handoffs must record any explicitly approved paid dependency, its purpose, current usage/cost risk, and how to disable it.

If a project can remove a paid dependency in favor of a free/included path without materially harming required functionality, prefer the free path.
