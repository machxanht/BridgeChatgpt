const DEFAULTS = {
  enabled: true,
  bridgeUrl: 'https://bridge-ai-mission-control.ai.studio/',
  intervalMinutes: 1,
  redeliveryMinutes: 10,
  focusOnWake: false,
  lastRunAt: null,
  lastWakeCount: 0,
  lastError: '',
  lastLog: [],
};

const $ = id => document.getElementById(id);

function formatTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

async function load() {
  const state = await chrome.storage.local.get(DEFAULTS);
  $('enabled').checked = Boolean(state.enabled);
  $('bridgeUrl').value = state.bridgeUrl || DEFAULTS.bridgeUrl;
  $('intervalMinutes').value = String(state.intervalMinutes ?? 1);
  $('redeliveryMinutes').value = String(state.redeliveryMinutes ?? 10);
  $('focusOnWake').checked = Boolean(state.focusOnWake);
  $('lastRunAt').textContent = formatTime(state.lastRunAt);
  $('lastWakeCount').textContent = String(state.lastWakeCount || 0);
  $('lastError').textContent = state.lastError || 'Không';
  $('lastError').className = state.lastError ? 'bad' : 'good';
  $('statePill').textContent = state.enabled ? '● ĐANG THEO DÕI' : '○ ĐANG TẮT';
  $('statePill').style.opacity = state.enabled ? '1' : '.55';

  const log = $('log');
  log.innerHTML = '';
  for (const item of state.lastLog || []) {
    const div = document.createElement('div');
    div.className = 'logitem';
    div.textContent = `${formatTime(item.at)} · ${item.message}`;
    log.appendChild(div);
  }
  if (!(state.lastLog || []).length) {
    const div = document.createElement('div');
    div.className = 'logitem';
    div.textContent = 'Chưa có wake event.';
    log.appendChild(div);
  }
}

async function saveSettings() {
  await chrome.storage.local.set({
    enabled: $('enabled').checked,
    bridgeUrl: $('bridgeUrl').value.trim() || DEFAULTS.bridgeUrl,
    intervalMinutes: Number($('intervalMinutes').value) || 1,
    redeliveryMinutes: Number($('redeliveryMinutes').value) || 10,
    focusOnWake: $('focusOnWake').checked,
  });
  await load();
}

for (const id of ['enabled', 'intervalMinutes', 'redeliveryMinutes', 'focusOnWake']) {
  $(id).addEventListener('change', saveSettings);
}
$('bridgeUrl').addEventListener('change', saveSettings);

$('wakeNow').addEventListener('click', async () => {
  const button = $('wakeNow');
  button.disabled = true;
  button.textContent = '⏳ ĐANG KIỂM TRA...';
  try {
    await saveSettings();
    await chrome.runtime.sendMessage({ type: 'BRIDGE_WAKE_NOW' });
  } finally {
    button.disabled = false;
    button.textContent = '⚡ KIỂM TRA NGAY';
    await load();
  }
});

$('resetDelivered').addEventListener('click', async () => {
  const button = $('resetDelivered');
  button.disabled = true;
  try {
    await chrome.runtime.sendMessage({ type: 'BRIDGE_WAKE_RESET_DELIVERED' });
  } finally {
    button.disabled = false;
    await load();
  }
});

chrome.storage.onChanged.addListener((_changes, areaName) => {
  if (areaName === 'local') void load();
});

void load();
