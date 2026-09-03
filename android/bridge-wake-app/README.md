# Bridge Wake Android

Tablet companion for Bridge using the device's real Chrome session.

- 🟣 Bridge pairing happens in a tiny hidden Bridge-only WebView.
- 🟢 ChatGPT always opens in real Google Chrome.
- 🔵 Google AI Studio always opens in real Google Chrome.
- 🔐 Accessibility is restricted to the `com.android.chrome` package.
- ⚡ Foreground Wake Service polls the scoped `/api/android-wake/queue` endpoint every 45 seconds.
- 🔑 The APK receives a read-only signed Android wake token from Bridge; it never stores the main `BRIDGE_MCP_TOKEN`.
- 🎯 Wake routing uses the exact ChatGPT conversation URL / AI Studio app URL already registered in Bridge.
- ✍️ Accessibility avoids Chrome's address bar, refuses to overwrite a non-empty prompt draft, fills the Bridge prompt, then clicks Send when it can identify the send control.

## First run

1. Install the APK and open **Bridge Wake** once.
2. Tap **BẬT ACCESSIBILITY** and enable `Bridge Wake — Chrome only`.
3. Tap **MỞ CHATGPT TRONG CHROME** and sign in normally if needed.
4. Tap **MỞ AI STUDIO TRONG CHROME** and sign in normally if needed.
5. Leave **WAKE ON** enabled.

The Bridge endpoint is preconfigured as `https://bridge-ai-mission-control.ai.studio/`.

## Account separation

ChatGPT and Google AI Studio stay independent. Bridge Wake does not merge accounts, copy authentication cookies between services, or receive the Google/ChatGPT passwords. The two services remain authenticated by Chrome under their own domains; Bridge only routes a task to the matching stored URL.

## Android limitations

Android can restrict background activity launches depending on OS/vendor settings. The foreground service and Accessibility service improve reliability, but battery optimization may still need to be disabled for Bridge Wake on some tablets. ChatGPT/AI Studio can also change their accessibility tree or send controls; those selectors may require future updates without changing the Bridge wake protocol.
