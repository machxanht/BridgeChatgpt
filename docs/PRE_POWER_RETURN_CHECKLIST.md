# PC Power Return Checklist

This file is the final checklist for the first session after the Windows PC has power again.

## Rule

No architecture or source-code changes should be required during this checklist. If a code change is required, record the unexpected issue in `docs/HANDOFF.md` before changing anything.

## Expected canonical state before PC power returns

- GitHub `main` contains the latest Bridge executor routing fix.
- Railway production runs the exact latest `main` commit and reports `SUCCESS`.
- Persistent SQLite loads from `/app/data/bridge.sqlite`.
- A GitHub command-bus `git pull --ff-only` sync command exists for the Bridge PC repo.
- Bridge own executor jobs use cwd `.` (the approved `E:\AI\Bridge` repo root).
- Other managed projects use cwd `Apps/<ProjectName>`.
- One paired PC node is reusable across projects without re-pairing.

## When PC power returns

1. Allow Windows to boot and log in if required.
2. Do not manually edit Bridge files.
3. Confirm the background Bridge executor reconnects to Railway.
4. Confirm the queued fast-forward sync completes; otherwise use the existing PC Control safe sync action.
5. Confirm Bridge repo `git status` is clean and `HEAD` matches GitHub `main`.
6. From tablet PC Control run harmless Bridge checks:
   - Git status
   - Tests
   - Build
7. Create/select a second project and run a harmless Git status there. Confirm it runs under `Apps/<ProjectName>` using the same PC node without pairing again.
8. Run the ChatGPT Web browser wake E2E against the bound conversation.
9. Run the Google AI Studio browser wake/relay E2E against the bound Studio app.
10. Record actual PASS/FAIL evidence in `docs/HANDOFF.md` and `docs/ROADMAP.md`.

## Security boundary

All executor filesystem work remains inside the approved root `E:\AI\Bridge`. Do not use RDC or shell commands to browse outside it without explicit human permission.
