# Apps

`Apps/` is the single home for local projects managed by Bridge.

## Convention

```text
Apps/
├── BridgeChatgpt/          # Bridge itself
├── <Project-A>/           # future project
├── <Project-B>/           # future project
└── ...
```

Rules:

- Every new Bridge project gets a readable local path: `Apps/<ProjectName>`.
- Project paths must stay under `Apps/`.
- Every new project, whether its execution target is PC or Studio, is queued for a safe `git clone` into its `Apps/<ProjectName>` folder whenever an online PC executor is available.
- If the PC is offline, the project keeps its `Apps/<ProjectName>` path and waits for PC setup instead of being placed elsewhere.
- Runtime state does not belong here; it lives under `runtime/` or persisted `data/`.
- Build/test artifacts do not belong here; they live under `artifacts/` or are ignored.

## BridgeChatgpt layout

```text
Apps/BridgeChatgpt/
├── src/               # web/tablet UI
├── public/            # static web assets
├── server/            # Railway control plane/backend
├── pc-executor/       # Windows worker
├── browser-wake/      # Chrome/Edge wake extension
├── android-wake/      # Android companion
├── tests/             # Bridge tests
├── server.ts          # server entrypoint
├── index.html         # web entrypoint
├── tsconfig.json
├── vite.config.ts
└── metadata.json
```
