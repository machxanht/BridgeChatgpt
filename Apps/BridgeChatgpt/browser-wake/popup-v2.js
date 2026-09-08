const enabled = document.getElementById('enabled');
async function render() {
  const state = await chrome.storage.local.get(['enabledV2', 'lastError', 'activeV2']);
  enabled.checked = !!state.enabledV2;
  document.getElementById('status').textContent = state.lastError || (state.activeV2 ? 'Đang xử lý một lượt chat.' : 'Chưa có lượt đang chạy.');
}
enabled.addEventListener('change', async () => {
  await chrome.storage.local.set({enabledV2: enabled.checked});
  if (enabled.checked) await chrome.runtime.sendMessage({type: 'bridge-v2-run'});
  await render();
});
document.getElementById('run').addEventListener('click', () => chrome.runtime.sendMessage({type: 'bridge-v2-run'}));
chrome.storage.onChanged.addListener(render);
void render();
