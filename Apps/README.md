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
- For a new PC-target project, Bridge queues a safe `git clone` into that folder when an online PC executor is available.
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
