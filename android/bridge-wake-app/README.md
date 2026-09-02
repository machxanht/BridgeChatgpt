# Bridge Wake Android

All-in-one tablet companion for Bridge.

- 🟣 Bridge dashboard WebView
- 🟢 ChatGPT WebView
- 🔵 Google AI Studio WebView
- ⚡ Wake engine polls Bridge `/api/resource-registry/wake-queue` every 45 seconds
- Routes by the exact ChatGPT conversation URL / AI Studio app URL already stored in Bridge
- Does not overwrite a non-empty draft and retries busy sessions later
- Foreground service keeps the app process available while the user leaves the app running

## First run

1. Install the APK.
2. Open Bridge Wake once.
3. Sign in to ChatGPT and AI Studio in their tabs if the embedded sessions are not already authenticated.
4. Keep `● WAKE ON` enabled by leaving the foreground service running.

The Bridge URL is preconfigured as `https://bridge-ai-mission-control.ai.studio/`.

## Important Android/WebView limitation

Google or OpenAI can change or restrict embedded WebView sign-in/UI flows. Bridge Wake has an `↗ Mở ngoài` fallback for navigation, but automatic prompt injection only works inside the embedded WebViews. The wake queue and URL routing remain independent of the UI selector implementation.
