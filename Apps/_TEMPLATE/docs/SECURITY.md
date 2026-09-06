# <PROJECT_NAME> Security

## Approved filesystem scope

```text
<APPROVED_PATH>
```

Do not operate outside this scope without explicit new permission.

## Secrets

- Never commit raw tokens, passwords, cookies, private keys, or recovery codes.
- Document variable names/secret locations only, not values.

## External services

- <SERVICE> — <ALLOWED_ACCESS_AND_BOUNDARY>

## Paid/quota service boundary

This project inherits the parent Bridge `docs/FREE_FIRST_POLICY.md`. An API key, connected account, provider AI Agent, available credit, or technical capability is not permission to spend money/quota. Do not enable or call a paid/quota external API or AI Agent without explicit prior user approval. Prefer free/included/local/browser/open-source/repository paths and search for existing implementations before adding a new external dependency.

## Destructive operations

Before delete/reset/clean/force actions:

1. inspect exact target;
2. verify approved scope;
3. inspect Git state;
4. confirm data-loss risk;
5. use the narrowest possible operation.

## Project-specific restrictions

- <RESTRICTION>

## Incident handling

If an out-of-scope, unauthorized paid/quota-use, or secret-handling mistake occurs, stop, record what happened, report it clearly, and avoid broad cleanup that could increase damage.
