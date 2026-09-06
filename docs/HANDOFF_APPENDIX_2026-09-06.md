# Offline Preparation Appendix — 2026-09-06

Purpose: ensure that when the Windows PC has power again, the expected work is sync + verification only, not further source editing.

> **Mandatory current policy:** this historical appendix is subordinate to `docs/FREE_FIRST_POLICY.md`. Prefer free/included/browser/local/open-source/repository paths. Do not use a paid/quota API or provider AI Agent without explicit prior user approval. If work takes too long, search this repo first, then trusted public repos/docs/internet and reuse a compatible existing solution before rebuilding.

## Offline work completed in this branch

- Added `executorCwdForWorkspace()` routing helper.
- BridgeChatgpt's own executor jobs resolve to cwd `.` because the repository metadata and root `package.json` live at `E:\AI\Bridge` while app source lives under `Apps/BridgeChatgpt`.
- Independent managed projects continue to resolve to `Apps/<ProjectName>`.
- Invalid independent project paths outside `Apps/` are rejected before the job is queued.
- Added regression coverage for Bridge root cwd, independent project cwd, path normalization, and escape rejection.
- Added `docs/PRE_POWER_RETURN_CHECKLIST.md` so a replacement session has a deterministic live-test sequence.

## Expected remaining work requiring the physical PC/browser

Only live verification should remain unless current `docs/HANDOFF.md` says otherwise:

1. PC boots/logs in and background executor reconnects.
2. Queued `git pull --ff-only` brings the PC repo to latest GitHub `main`.
3. Bridge Git status/test/build run successfully from repo root.
4. A second project runs Git status from its own `Apps/<ProjectName>` directory using the same paired PC node.
5. ChatGPT Web wake/injection/result flow is tested with the real logged-in browser.
6. Google AI Studio wake/relay/result flow is tested with the real logged-in browser.
7. Optional Windows/browser autostart changes require separate explicit permission if they touch locations outside the approved Bridge root.

No raw credentials belong in this document. No paid/quota fallback is authorized merely because the normal path is inconvenient.
