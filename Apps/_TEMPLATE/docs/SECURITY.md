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

If an out-of-scope or secret-handling mistake occurs, stop, record what happened, report it clearly, and avoid broad cleanup that could increase damage.
