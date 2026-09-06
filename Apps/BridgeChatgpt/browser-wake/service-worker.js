const ALARM_NAME = 'bridge-wake-cycle';
const CURRENT_BRIDGE_URL = 'https://bridgechatgpt-production.up.railway.app/';
const LEGACY_BRIDGE_URL = 'https://bridge-ai-mission-control.ai.studio/';
const DEFAULTS = {
  enabled: true,
  bridgeUrl: CURRENT_BRIDGE_URL,
  settingsVersion: 3,
  intervalMinutes: 0.5,
  redeliveryMinutes: 1,
  focusOnWake: false,
  deliveredEvents: {},
  lastRunAt: null,
  lastWakeCount: 0,
  lastError: '',
  lastLog: [],
};

let running = false;
const targetOpenAttempts = new Map();
const TARGET_OPEN_RETRY_MS = 60_000;

async function settings() {
  const raw = await chrome.storage.local.get(null);
  const config = { ...DEFAULTS, ...raw };
  const patch = {};
  if (Number(raw.settingsVersion || 0) < 3) {
    patch.settingsVersion = 3;
    patch.deliveredEvents = {};
    patch.intervalMinutes = 0.5;
    patch.redeliveryMinutes = 1;
  }
  if (!config.bridgeUrl || config.bridgeUrl === LEGACY_BRIDGE_URL) patch.bridgeUrl = CURRENT_BRIDGE_URL;
  if (Object.keys(patch).length) {
    Object.assign(config, patch);
    await chrome.storage.local.set(patch);
  }
  return config;
}
async function appendLog(message) {
  const state = await chrome.storage.local.get({ lastLog: [] });
  const next = [{ at: new Date().toISOString(), message }, ...(state.lastLog || [])].slice(0, 20);
  await chrome.storage.local.set({ lastLog: next });
}

async function resetAlarm() {
  const config = await settings();
  await chrome.alarms.clear(ALARM_NAME);
  if (!config.enabled) return;
  const periodInMinutes = Math.max(0.5, Number(config.intervalMinutes) || 1);
  await chrome.alarms.create(ALARM_NAME, { delayInMinutes: 0.1, periodInMinutes });
}

function normalizedOrigin(raw) {
  try { return new URL(raw).origin; } catch { return new URL(CURRENT_BRIDGE_URL).origin; }
}

async function waitForTabComplete(tabId, timeoutMs = 30000) {
  try { const existing = await chrome.tabs.get(tabId); if (existing.status === 'complete') return existing; } catch { return null; }
  return new Promise(resolve => {
    let finished = false;
    const timer = setTimeout(() => finish(null), timeoutMs);
    const listener = (updatedTabId, changeInfo, tab) => { if (updatedTabId === tabId && changeInfo.status === 'complete') finish(tab); };
    function finish(value) { if (finished) return; finished = true; clearTimeout(timer); chrome.tabs.onUpdated.removeListener(listener); resolve(value); }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function ensureBridgeTab(bridgeUrl) {
  const origin = normalizedOrigin(bridgeUrl);
  const tabs = await chrome.tabs.query({});
  let tab = tabs.find(item => item.url && item.url.startsWith(origin));
  if (!tab) tab = await chrome.tabs.create({ url: bridgeUrl, active: false });
  if (!tab.id) throw new Error('Could not open Bridge tab');
  return (await waitForTabComplete(tab.id)) || tab;
}

function targetTabMatches(tab, event) {
  if (!tab.url) return false;
  try {
    const url = new URL(tab.url); const host = url.hostname.toLowerCase();
    if (event.provider === 'chatgpt') {
      if (host !== 'chatgpt.com' && host !== 'chat.openai.com') return false;
      return url.pathname.includes(`/c/${event.resource_id}`) || url.pathname.includes(event.resource_id);
    }
    if (host !== 'aistudio.google.com') return false;
    return url.pathname.includes(`/apps/${event.resource_id}`) || url.pathname.includes(event.resource_id);
  } catch { return false; }
}

async function ensureTargetTab(event, focusOnWake) {
  const tabs = await chrome.tabs.query({});
  let tab = tabs.find(item => targetTabMatches(item, event));
  let created = false;
  if (!tab) {
    const lastAttempt = Number(targetOpenAttempts.get(event.resource_id) || 0);
    if (Date.now() - lastAttempt < TARGET_OPEN_RETRY_MS) return null;
    targetOpenAttempts.set(event.resource_id, Date.now());
    tab = await chrome.tabs.create({ url: event.resource_url, active: Boolean(focusOnWake) });
    created = true;
  }
  if (!tab.id) throw new Error(`Could not open target ${event.resource_id}`);
  if (focusOnWake) {
    await chrome.tabs.update(tab.id, { active: true });
    if (typeof tab.windowId === 'number') try { await chrome.windows.update(tab.windowId, { focused: true }); } catch {}
  }
  const finalTab = (await waitForTabComplete(tab.id)) || await chrome.tabs.get(tab.id).catch(() => null);
  if (!finalTab || !targetTabMatches(finalTab, event)) {
    if (created && finalTab?.id) try { await chrome.tabs.remove(finalTab.id); } catch {}
    return null;
  }
  targetOpenAttempts.delete(event.resource_id);
  return finalTab;
}

async function pollBridgeWakeQueue(bridgeTabId) {
  const results = await chrome.scripting.executeScript({ target: { tabId: bridgeTabId }, world: 'MAIN', func: async () => {
    try {
      const response = await fetch('/api/resource-registry/wake-queue', { method: 'GET', credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
      const data = await response.json().catch(() => ({})); return { ok: response.ok, status: response.status, data };
    } catch (error) { return { ok: false, status: 0, error: String(error) }; }
  }});
  const result = results?.[0]?.result;
  if (!result?.ok) throw new Error(result?.data?.error || result?.error || `Bridge wake queue HTTP ${result?.status || 'unknown'}`);
  return Array.isArray(result.data?.events) ? result.data.events : [];
}

async function injectPrompt(tabId, prompt) {
  const results = await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', args: [prompt], func: async text => {
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    const visible = element => { if (!element) return false; const style = window.getComputedStyle(element); const rect = element.getBoundingClientRect(); return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0; };
    const descriptor = element => [element.getAttribute?.('aria-label') || '', element.getAttribute?.('title') || '', element.getAttribute?.('data-testid') || '', element.textContent || ''].join(' ').trim();
    const busyButton = [...document.querySelectorAll('button')].find(button => visible(button) && !button.disabled && /stop generating|stop response|cancel response|dừng tạo|dừng phản hồi|stop generation/i.test(descriptor(button)));
    if (busyButton) return { ok: false, reason: 'busy' };
    const selectors = ['#prompt-textarea','textarea[placeholder]','textarea','[contenteditable="true"][role="textbox"]','[contenteditable="true"]'];
    let composer = null;
    for (const selector of selectors) { composer = [...document.querySelectorAll(selector)].find(element => visible(element) && !element.disabled && !element.readOnly) || null; if (composer) break; }
    if (!composer) return { ok: false, reason: 'composer-not-found' };
    const currentValue = 'value' in composer ? String(composer.value || '') : String(composer.textContent || '');
    if (currentValue.trim() && currentValue.trim() !== text.trim()) return { ok: false, reason: 'draft-present' };
    composer.focus();
    if (composer instanceof HTMLTextAreaElement) { const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set; if (setter) setter.call(composer, text); else composer.value = text; composer.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text })); composer.dispatchEvent(new Event('change', { bubbles: true })); }
    else if (composer instanceof HTMLInputElement) { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set; if (setter) setter.call(composer, text); else composer.value = text; composer.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text })); composer.dispatchEvent(new Event('change', { bubbles: true })); }
    else { try { document.execCommand('selectAll', false); const inserted = document.execCommand('insertText', false, text); if (!inserted) composer.textContent = text; } catch { composer.textContent = text; } composer.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text })); }
    await sleep(500);
    const preferredSelectors = ['button[data-testid="send-button"]','button[aria-label*="Send"]','button[aria-label*="send"]','button[aria-label*="Gửi"]','button[title*="Send"]','button[type="submit"]'];
    const scope = composer.closest('form') || composer.parentElement?.parentElement?.parentElement || document;
    let sendButton = null;
    for (const selector of preferredSelectors) { sendButton = [...scope.querySelectorAll(selector)].find(button => visible(button) && !button.disabled) || null; if (sendButton) break; }
    if (!sendButton) sendButton = [...scope.querySelectorAll('button')].find(button => visible(button) && !button.disabled && /send message|send prompt|submit prompt|send|submit|gửi|arrow_upward/i.test(descriptor(button))) || null;
    if (sendButton) { sendButton.click(); await sleep(400); const remaining = 'value' in composer ? String(composer.value || '') : String(composer.textContent || ''); return !remaining.trim() ? { ok: true, method: 'button' } : { ok: false, reason: 'send-not-confirmed' }; }
    for (const type of ['keydown','keypress','keyup']) composer.dispatchEvent(new KeyboardEvent(type, { key:'Enter', code:'Enter', keyCode:13, which:13, bubbles:true, cancelable:true }));
    await sleep(700); const afterValue = 'value' in composer ? String(composer.value || '') : String(composer.textContent || '');
    return !afterValue.trim() ? { ok: true, method: 'enter' } : { ok: false, reason: 'send-control-not-found' };
  }});
  return results?.[0]?.result || { ok: false, reason: 'script-no-result' };
}

async function runWakeCycle(trigger = 'alarm') {
  if (running) return { ok: false, reason: 'already-running' }; running = true; let wakeCount = 0;
  try {
    const config = await settings(); if (!config.enabled && trigger !== 'manual') return { ok: false, reason: 'disabled' };
    const bridgeTab = await ensureBridgeTab(config.bridgeUrl); if (!bridgeTab.id) throw new Error('Bridge tab has no id');
    const events = await pollBridgeWakeQueue(bridgeTab.id); const now = Date.now(); const redeliveryMs = Math.max(1, Number(config.redeliveryMinutes) || 10) * 60000; const delivered = { ...(config.deliveredEvents || {}) };
    for (const [key, timestamp] of Object.entries(delivered)) if (now - Number(timestamp) > 7 * 24 * 60 * 60 * 1000) delete delivered[key];
    for (const event of events.slice(0,10)) {
      const lastDelivered = Number(delivered[event.event_id] || 0); if (lastDelivered && now - lastDelivered < redeliveryMs) continue;
      const tab = await ensureTargetTab(event, config.focusOnWake); if (!tab?.id) { await appendLog(`Skipped ${event.resource_id} for ${event.task_id}: target-unavailable`); continue; } const result = await injectPrompt(tab.id, event.prompt);
      if (result?.ok) { delivered[event.event_id] = Date.now(); wakeCount += 1; await appendLog(`Woke ${event.provider === 'chatgpt' ? 'ChatGPT' : 'AI Studio'} ${event.resource_id} for ${event.task_id} (${event.reason})`); }
      else await appendLog(`Skipped ${event.resource_id} for ${event.task_id}: ${result?.reason || 'unknown'}`);
    }
    await chrome.storage.local.set({ deliveredEvents: delivered, lastRunAt: new Date().toISOString(), lastWakeCount: wakeCount, lastError: '' });
    await chrome.action.setBadgeText({ text: wakeCount ? String(wakeCount) : '' }); return { ok: true, wakeCount, eventCount: events.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error); await chrome.storage.local.set({ lastRunAt: new Date().toISOString(), lastWakeCount: wakeCount, lastError: message }); await appendLog(`Error: ${message}`); return { ok: false, error: message };
  } finally { running = false; }
}

chrome.runtime.onInstalled.addListener(async () => { const existing = await chrome.storage.local.get(Object.keys(DEFAULTS)); const patch = {}; for (const [key,value] of Object.entries(DEFAULTS)) if (existing[key] === undefined) patch[key] = value; if (!existing.bridgeUrl || existing.bridgeUrl === LEGACY_BRIDGE_URL) patch.bridgeUrl = CURRENT_BRIDGE_URL; if (Object.keys(patch).length) await chrome.storage.local.set(patch); await resetAlarm(); });
chrome.runtime.onStartup.addListener(() => void resetAlarm());
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === ALARM_NAME) void runWakeCycle('alarm'); });
setInterval(() => void runWakeCycle('chat-poll'), 2000);
chrome.storage.onChanged.addListener((changes, areaName) => { if (areaName === 'local' && (changes.enabled || changes.intervalMinutes)) void resetAlarm(); });
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'BRIDGE_WAKE_NOW') { runWakeCycle('manual').then(sendResponse); return true; }
  if (message?.type === 'BRIDGE_WAKE_RESET_DELIVERED') { chrome.storage.local.set({ deliveredEvents: {} }).then(() => sendResponse({ ok: true })); return true; }
  return false;
});
