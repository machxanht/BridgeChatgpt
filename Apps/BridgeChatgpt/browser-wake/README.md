# ChatGPT Standard — Bridge Wake 2.1.0

This extension connects Bridge to the default ChatGPT web selection in your existing browser profile. It does not use an API key or Codex. The ChatGPT account's limits still apply; Bridge cannot promise a particular underlying model or quota cost.

## Install or update on the PC (no administrator PowerShell)

1. Open Chrome: chrome://extensions (Edge: edge://extensions).
2. Enable Developer mode.
3. Choose Load unpacked, then select E:\AI\Bridge\Apps\BridgeChatgpt\browser-wake.
4. If Bridge Wake already points at this folder, click its Reload button instead. Verify version 2.1.0.
5. In the SAME browser profile, open https://bridgechatgpt-production.up.railway.app/ and https://chatgpt.com/ and sign in to both.
6. On ChatGPT choose the default ChatGPT option. Named Thinking/Pro choices are not used by this route.
7. Open the Bridge Wake extension popup. Enable receiving Bridge chats and click Check now.
8. In Bridge select ChatGPT Standard. Wait for it to be online, then send one short request.

The PC and browser must remain awake. You can then operate Bridge from the tablet. The Codex in-app browser cannot host this Chrome extension.

## Account and model boundaries

Change ChatGPT accounts on chatgpt.com in this browser profile while no request is running. Bridge account labels do not switch browser cookies. A chat uses its bound native conversation; use a new Bridge conversation after changing accounts.

Readiness requires a visible default ChatGPT selection. A stale answer's model slug or a cached model catalogue cannot prove the next selected model. Unknown selection stays offline with an actionable popup error.

## Reliability

Bridge session CSRF is fetched on the Bridge origin and passed with the capability request. Provider pages never receive Bridge credentials. The extension preserves its enabled setting across updates. Each prompt has a durable send journal; a disconnect after a click observes the original send rather than sending twice. Final answers require matching native message receipts. Successful fixture checks do not constitute live E2E evidence.
