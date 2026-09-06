# Offline Ready Gate

This branch is intended to be the last source-code change before the Windows PC returns to service.

It is not considered complete until:

- GitHub CI passes typecheck, tests, build, Bridge Wake packaging, and production startup smoke.
- The branch is merged into `main`.
- Railway production deploys the exact merged `main` SHA successfully.
- `docs/HANDOFF.md` is updated to point replacement sessions to `docs/PRE_POWER_RETURN_CHECKLIST.md`.

After those gates pass, the next PC session should perform sync and live verification only.
