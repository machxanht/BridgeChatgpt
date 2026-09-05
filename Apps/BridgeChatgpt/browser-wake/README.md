# Bridge Wake Chrome Extension

Bridge Wake turns Bridge's URL routing registry into a browser-side wake layer:

`Bridge task/review -> wake queue -> exact ChatGPT conversation or AI Studio app URL -> inject wake prompt -> agent continues work`

## Install in desktop Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select the `chrome-extension/bridge-wake` folder.
5. Pin **Bridge Wake** to the toolbar.
6. Keep the normal ChatGPT and AI Studio accounts logged in in that Chrome profile.

The extension defaults to `https://bridge-ai-mission-control.ai.studio/` and checks once per minute. It can create a background Bridge tab automatically if one is not already open.

## How it decides whom to wake

Bridge's Resource Registry maps:

- Git repository -> project/workspace
- AI Studio URL -> Studio `app_id`
- ChatGPT URL -> ChatGPT `conversation_id`

The authenticated same-origin endpoint `/api/resource-registry/wake-queue` returns only actionable wake events:

- a pending/assigned task bound to a specific URL target;
- a Studio result waiting for ChatGPT review;
- a Studio blocker that needs ChatGPT attention.

The extension keeps delivered `event_id` values in `chrome.storage.local`, so the same unchanged event is not sent repeatedly. A configurable redelivery delay retries stale work later.

## Safety / reliability behavior

- It does not bypass login, subscription quotas, or platform permissions.
- It never wakes a target just because a timer fired; Bridge must report actionable work.
- It refuses to overwrite a non-empty ChatGPT/Studio draft.
- It skips a page that appears to be generating a response already.
- It does not Publish from AI Studio; the wake prompt explicitly forbids Publish unless the user asks.
- UI automation depends on ChatGPT/AI Studio DOM controls. If either product changes its composer/send controls, the selector logic may need an update.
- `chrome.alarms` does not wake a sleeping computer. The browser and machine must be awake.

## Multiple Chrome profiles

An extension instance can only control tabs inside the Chrome profile where it is installed. If ChatGPT and AI Studio are deliberately split across separate Chrome profiles, install Bridge Wake in each profile or keep the targets you want automated in one profile.
