# Offline Ready Gate

This branch is intended to be the last source-code change before the Windows PC returns to service.

> Mandatory policy: `docs/FREE_FIRST_POLICY.md` applies to this gate. Railway/provider AI Agent usage is not an acceptable routine shortcut. Deployment/recovery must prefer deterministic free/included paths; no paid/quota API or AI Agent without explicit prior user approval. If a gate is taking too long, search the repo and trusted public repos/docs/internet for an existing compatible solution before building more custom machinery.

It is not considered complete until:

- GitHub CI passes typecheck, tests, build, Bridge Wake packaging, and production startup smoke.
- The branch is merged into `main`.
- Railway production deploys the exact merged `main` SHA successfully through an approved deterministic free/included path.
- `docs/HANDOFF.md` is updated to point replacement sessions to `docs/PRE_POWER_RETURN_CHECKLIST.md`.

After those gates pass, the next PC session should perform sync and live verification only.
