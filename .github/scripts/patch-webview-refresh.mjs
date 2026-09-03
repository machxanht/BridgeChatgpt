import fs from 'node:fs';

function replaceOnce(path, before, after) {
  const source = fs.readFileSync(path, 'utf8');
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${path}: expected 1 marker, found ${count}: ${before.slice(0, 80)}`);
  fs.writeFileSync(path, source.replace(before, after), 'utf8');
}

const main = 'android/bridge-wake-app/app/src/main/java/com/bridge/wake/MainActivity.java';
replaceOnce(main,
  '    private WebView dashboardWeb;\n',
  '    private WebView dashboardWeb;\n    private long lastDashboardReloadAt = 0L;\n'
);
replaceOnce(main,
  '        dashboardWeb.loadUrl(BRIDGE_URL);\n        handler.post(refreshUiLoop);',
  '        reloadBridgeDashboard(false);\n        handler.post(refreshUiLoop);'
);
replaceOnce(main,
  '        if (preferences.getBoolean("wake_enabled", true)) {\n            startWakeService();\n        }\n    }\n\n    @Override\n    protected void onDestroy()',
  '        if (preferences.getBoolean("wake_enabled", true)) {\n            startWakeService();\n        }\n        String currentUrl = dashboardWeb == null ? null : dashboardWeb.getUrl();\n        if (currentUrl != null && currentUrl.startsWith(BRIDGE_URL)) reloadBridgeDashboard(false);\n    }\n\n    @Override\n    protected void onDestroy()'
);
replaceOnce(main,
  '        home.setOnClickListener(v -> dashboardWeb.loadUrl(BRIDGE_URL));',
  '        home.setOnClickListener(v -> reloadBridgeDashboard(true));'
);
replaceOnce(main,
  '        settings.setLoadWithOverviewMode(false);\n',
  '        settings.setLoadWithOverviewMode(false);\n        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);\n'
);
replaceOnce(main,
  '    private void requestPairToken() {',
  `    private void reloadBridgeDashboard(boolean force) {\n        if (dashboardWeb == null) return;\n        long now = System.currentTimeMillis();\n        if (!force && now - lastDashboardReloadAt < 1500L) return;\n        lastDashboardReloadAt = now;\n        dashboardWeb.stopLoading();\n        dashboardWeb.getSettings().setCacheMode(WebSettings.LOAD_NO_CACHE);\n        if (force) dashboardWeb.clearCache(true);\n        dashboardWeb.loadUrl(BRIDGE_URL + "?bridge_reload=" + now);\n    }\n\n    private void requestPairToken() {`
);

const gradle = 'android/bridge-wake-app/app/build.gradle';
let build = fs.readFileSync(gradle, 'utf8');
const codeMatch = build.match(/versionCode\s+(\d+)/);
const nameMatch = build.match(/versionName\s+"([^"]+)"/);
if (!codeMatch || !nameMatch) throw new Error('Android version markers missing');
const nextCode = Math.max(Number(codeMatch[1]) + 1, 15);
build = build.replace(/versionCode\s+\d+/, `versionCode ${nextCode}`);
build = build.replace(/versionName\s+"[^"]+"/, 'versionName "0.5.1"');
fs.writeFileSync(gradle, build, 'utf8');
console.log(`Patched WebView reload + no-cache; Android 0.5.1 code ${nextCode}`);
