// MV3 owns the capability and durable send journal. Provider pages receive only
// prompt/DOM commands; they never receive a Bridge credential.
const ORIGIN = 'https://bridgechatgpt-production.up.railway.app';
const VERSION = '2.0.0';
let running = false;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, '0')).join('');
async function api(route, token, body) {
  const response = await fetch(`${ORIGIN}/api/runtime${route}`, {method: 'POST',
    headers: {'Content-Type': 'application/json', Authorization: `Bearer ${token}`},
    body: JSON.stringify(body), signal: AbortSignal.timeout(25000)});
  if (response.status === 204) return null;
  if (!response.ok) throw Object.assign(new Error(`Bridge ${route}: HTTP ${response.status}`), {status: response.status});
  return response.json();
}
async function credential() {
  const stored = await chrome.storage.session.get(['capability', 'expires']);
  if (stored.capability && stored.expires > Date.now() + 60000) return stored.capability;
  const tabs = await chrome.tabs.query({url: `${ORIGIN}/*`});
  if (!tabs.length) throw new Error('Mở Bridge và đăng nhập trước khi bật extension.');
  const identity = await chrome.storage.local.get(['runtimeSubjectV2']);
  const subject = identity.runtimeSubjectV2 || `bridge-extension-v2-${crypto.randomUUID()}`;
  await chrome.storage.local.set({runtimeSubjectV2: subject});
  const result = await chrome.scripting.executeScript({target: {tabId: tabs[0].id}, world: 'MAIN', func: async runtimeSubject => {
    const response = await fetch('/api/runtime/browser/session', {method: 'POST', credentials: 'same-origin',
      headers: {'Content-Type': 'application/json'}, body: JSON.stringify({subject: runtimeSubject})});
    if (!response.ok) return null;
    return response.json();
  }, args: [subject]});
  const grant = result[0]?.result;
  if (!grant?.token) throw new Error('Phiên Bridge hết hạn. Hãy đăng nhập lại Bridge.');
  await chrome.storage.session.set({capability: grant.token, expires: Date.now() + grant.expires_in_ms});
  return grant.token;
}
async function page(tabId, action, content) {
  let results;
  try { results = await chrome.scripting.executeScript({target: {tabId}, func: (operation, prompt) => {
    if (location.origin !== 'https://chatgpt.com') throw new Error('Unexpected provider origin');
    const model = document.querySelector('[data-testid="model-switcher-dropdown-button"]')?.textContent?.trim() || '';
    const exactModel = /\bSol\s*5\.6\b|\b5\.6\s*Sol\b/i.test(model);
    const stopping = document.querySelector('[data-testid="stop-button"]');
    const messages = [...document.querySelectorAll('[data-message-id][data-message-author-role]')].map(element => ({
      id: element.getAttribute('data-message-id'), role: element.getAttribute('data-message-author-role'),
      text: (element.querySelector('.markdown') || element).innerText?.trim() || '',
      complete: !!element.closest('article')?.querySelector('[data-testid="copy-turn-action-button"]'),
    }));
    const session = location.pathname.match(/^\/c\/([a-zA-Z0-9-]+)$/)?.[1] || null;
    if (operation === 'stop') { stopping?.click(); return {stopping: !!stopping}; }
    if (operation === 'send') {
      if (!exactModel) throw new Error(`Chọn đúng Sol 5.6 trước khi gửi (hiện tại: ${model || 'không xác định'}).`);
      if (stopping) throw new Error('ChatGPT is already generating');
      const composer = document.querySelector('#prompt-textarea');
      if (!composer || composer.innerText.trim()) throw new Error('Composer missing or contains an unsent draft');
      composer.focus();
      if (composer instanceof HTMLTextAreaElement) {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(composer, prompt);
        composer.dispatchEvent(new Event('input', {bubbles: true}));
      } else {
        document.execCommand('insertText', false, prompt);
      }
      const actual = composer instanceof HTMLTextAreaElement ? composer.value : composer.innerText;
      if (actual.replace(/\r\n/g, '\n') !== prompt.replace(/\r\n/g, '\n')) throw new Error('Composer did not preserve the exact prompt');
      const send = document.querySelector('[data-testid="send-button"]');
      if (!send || send.disabled) throw new Error('Send button is not ready');
      send.click(); // Exactly one click. A missing receipt must never cause another click.
    }
    return {exactModel, model, session, messages, generating: !!stopping};
  }, args: [action, content || '']});
  } catch (error) { throw Object.assign(error, {fatal: action !== 'send'}); }
  return results[0]?.result;
}
async function persist(active) { await chrome.storage.local.set({activeV2: active}); }
async function receipt(active, stage, fields = {}) {
  await api('/attempt/receipt', active.turn.attempt_token, {stage, ...fields});
  active.stage = stage;
  await persist(active);
}
async function processTurn(active, token) {
  const turn = active.turn;
  if (active.final) {
    if (active.stage !== 'answer_observed') await receipt(active, 'answer_observed', {
      native_assistant_id: active.final.assistantId, answer_hash: active.final.hash,
      native_user_id: active.userId, native_session_id: active.final.session});
    const result = await api('/attempt/complete', turn.attempt_token, {answer: active.final.answer,
      native_session_id: active.final.session, execution_complete: true});
    if (result.hash !== active.final.hash) throw new Error('Bridge final acknowledgement mismatch');
    await persist(null);
    return;
  }
  if (!active.tabId) {
    const url = turn.native_session_id ? `https://chatgpt.com/c/${encodeURIComponent(turn.native_session_id)}` : 'https://chatgpt.com/';
    const tab = await chrome.tabs.create({url, active: false});
    active.tabId = tab.id;
    await persist(active);
  }
  let lastBeat = 0;
  while (Date.now() < Date.parse(turn.deadline_at)) {
    if (Date.now() - lastBeat >= 10000) {
      await api('/attempt/heartbeat', turn.attempt_token, {});
      lastBeat = Date.now();
    }
    const tab = await chrome.tabs.get(active.tabId);
    if (tab.status !== 'complete') { await sleep(1000); continue; }
    const state = await page(active.tabId, 'inspect');
    if (turn.native_session_id && state.session !== turn.native_session_id) throw new Error('Native conversation mismatch');
    if (!active.stage) await receipt(active, 'claimed');
    if (active.stage === 'claimed') {
      if (!state.exactModel) throw new Error('ChatGPT chưa chọn đúng Sol 5.6; không gửi sang model khác.');
      if (state.generating) throw new Error('Native conversation is busy');
      active.before = state.messages.map(message => message.id);
      await receipt(active, 'preparing');
    }
    if (active.stage === 'preparing') {
      // Persist send_started locally BEFORE requesting the server receipt. A crash
      // anywhere after this point resumes observation only, never re-injection.
      active.stage = 'send_started';
      await persist(active);
      await api('/attempt/receipt', turn.attempt_token, {stage: 'send_started'});
      await page(active.tabId, 'send', turn.content);
    }
    const fresh = state.messages.filter(message => !active.before.includes(message.id));
    const users = fresh.filter(message => message.role === 'user');
    if (users.length > 1) throw new Error('Native conversation changed concurrently');
    const user = users[0];
    if (user && user.text !== turn.content.trim()) throw new Error('Native user receipt differs from claimed prompt');
    if (active.stage === 'send_started' && user && state.session) {
      active.userId = user.id;
      active.session = state.session;
      await receipt(active, 'sent', {native_user_id: user.id, native_session_id: state.session});
    }
    if (active.stage === 'sent' && !state.generating) {
      const index = state.messages.findIndex(message => message.id === active.userId);
      const answer = state.messages.slice(index + 1).find(message => message.role === 'assistant');
      if (answer?.complete && answer.text && state.session === active.session) {
        const answerHash = await hash(answer.text);
        active.final = {answer: answer.text, hash: answerHash, session: active.session, assistantId: answer.id};
        await persist(active);
        return processTurn(active, token);
      }
    }
    await sleep(2000);
  }
  throw Object.assign(new Error('Native browser deadline reached; prompt will not be sent again'), {fatal: true});
}
async function tick() {
  if (running) return;
  running = true;
  let active, token;
  try {
    await chrome.storage.local.setAccessLevel({accessLevel: 'TRUSTED_CONTEXTS'});
    const state = await chrome.storage.local.get(['enabledV2', 'activeV2', 'claimRequestV2']);
    if (!state.enabledV2 && !state.activeV2) return;
    token = await credential();
    active = state.activeV2;
    if (active) {
      const recovered = await api('/recover', token, {attempt_id: active.turn.attempt_id});
      active.turn = recovered.turn;
      await persist(active);
      if (['failed', 'cancelled'].includes(recovered.status)) {
        if (active.final) {
          await chrome.storage.local.set({[`retained-final-${active.turn.attempt_id}`]: active.final});
          await api('/cleanup', token, {attempt_id: active.turn.attempt_id, processes_stopped: true});
          await persist(null);
          throw new Error('Lượt đã kết thúc trên Bridge; đáp án native được giữ trong extension để kiểm tra.');
        }
        throw Object.assign(new Error('Lượt native đã bị hủy hoặc hết lease.'), {fatal: true});
      }
    }
    if (!active) {
      const providerTabs = await chrome.tabs.query({url: 'https://chatgpt.com/*'});
      let ready = false;
      for (const tab of providerTabs) {
        const observed = await page(tab.id, 'inspect');
        if (observed.exactModel && !observed.generating) { ready = true; break; }
      }
      if (!ready) throw new Error('Mở ChatGPT, đăng nhập và chọn Sol 5.6 để nhận lượt chat.');
      await api('/browser/heartbeat', token, {version: VERSION});
      const requestId = state.claimRequestV2 || crypto.randomUUID();
      await chrome.storage.local.set({claimRequestV2: requestId});
      const claim = await api('/claim', token, {agent_ids: ['chatgpt'], request_id: requestId, wait_ms: 20000});
      if (!claim) return;
      active = {turn: claim.turn};
      await persist(active);
      await chrome.storage.local.remove('claimRequestV2');
    }
    await processTurn(active, token);
    await chrome.storage.local.set({lastError: '', lastRunAt: new Date().toISOString()});
  } catch (error) {
    await chrome.storage.local.set({lastError: String(error.message || error), lastRunAt: new Date().toISOString()});
    // Network ambiguity retains the journal. A persisted final only retries
    // completion. Failures before final retain their fence until stop is proven.
    if (active && !active.final && (error.fatal || [400, 401, 403, 409].includes(error.status))) {
      try {
        if (active.tabId && ['send_started', 'sent', 'answer_observed'].includes(active.stage)) {
          await page(active.tabId, 'stop');
          await sleep(1000);
          const observed = await page(active.tabId, 'inspect');
          if (observed.generating) return;
        }
        await api('/attempt/fail', active.turn.attempt_token, {code: 'browser_interrupted'}).catch(() => {});
        await api('/cleanup', token, {attempt_id: active.turn.attempt_id, processes_stopped: true});
        await persist(null);
      } catch { /* Keep the fence and show the error; no blind cleanup. */ }
    }
  } finally { running = false; }
}
chrome.runtime.onInstalled.addListener(async () => {
  await chrome.alarms.create('bridge-v2', {periodInMinutes: 0.5});
  await chrome.storage.local.set({enabledV2: false});
});
chrome.runtime.onStartup.addListener(() => chrome.alarms.create('bridge-v2', {periodInMinutes: 0.5}));
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'bridge-v2') void tick(); });
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || sender.tab) return;
  if (message.type === 'bridge-v2-run') { void tick(); respond({ok: true}); }
});
