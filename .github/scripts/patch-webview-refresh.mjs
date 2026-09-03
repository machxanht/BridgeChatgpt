import fs from 'node:fs';

function replaceOnce(path, before, after) {
  const source = fs.readFileSync(path, 'utf8');
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${path}: expected 1 marker, found ${count}: ${before.slice(0, 100)}`);
  fs.writeFileSync(path, source.replace(before, after), 'utf8');
}

function replaceBetween(path, startMarker, endMarker, replacement) {
  const source = fs.readFileSync(path, 'utf8');
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`${path}: start marker missing: ${startMarker.slice(0, 100)}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(`${path}: end marker missing: ${endMarker.slice(0, 100)}`);
  fs.writeFileSync(path, source.slice(0, start) + replacement + source.slice(end), 'utf8');
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

const accessibility = 'android/bridge-wake-app/app/src/main/java/com/bridge/wake/BridgeAccessibilityService.java';
replaceOnce(accessibility,
  '    private static final long RECOVERY_REFRESH_GAP_MS = 10_000L;\n    private static final int MAX_HARD_REFRESHES = 2;\n',
  '    private static final long RECOVERY_ACTION_MIN_DELAY_MS = 3_000L;\n    private static final long RECOVERY_ACTION_MAX_DELAY_MS = 5_000L;\n    private static final int MAX_RETRIES_PER_REFRESH = 3;\n    private static final int MAX_HARD_REFRESHES = 2;\n'
);
replaceOnce(accessibility,
  '    private static final String STATE_WAITING_RESULT = "WAITING_RESULT";\n    private static final String STATE_RECOVER_REFRESH = "RECOVER_REFRESH";\n',
  '    private static final String STATE_WAITING_RESULT = "WAITING_RESULT";\n    private static final String STATE_RECOVER_RETRY = "RECOVER_RETRY";\n    private static final String STATE_RECOVER_REFRESH = "RECOVER_REFRESH";\n'
);
replaceOnce(accessibility,
  '            .putLong("recovery_last_refresh_at", lastRefreshAt)\n            .remove("pending_event")',
  '            .putLong("recovery_last_refresh_at", lastRefreshAt)\n            .putInt("recovery_retry_count", 0)\n            .putLong("recovery_last_retry_at", 0L)\n            .remove("recovery_next_action_at")\n            .remove("pending_event")'
);

const recoveryMethod = `    private void processPostSendRecovery(AccessibilityNodeInfo root, long now) {\n        android.content.SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);\n        String raw = prefs.getString("recovery_event", "");\n        long until = prefs.getLong("recovery_until", 0L);\n        if (raw == null || raw.isEmpty()) return;\n        if (until <= 0L || now > until) {\n            clearRecovery("window-expired");\n            return;\n        }\n\n        boolean internalError = treeContains(root, "an internal error occurred")\n            || treeContains(root, "internal error occurred")\n            || treeContains(root, "there was an unexpected error")\n            || treeContains(root, "something went wrong");\n        boolean cancelled = treeContains(root, "canceled") || treeContains(root, "cancelled");\n        if (!internalError && !cancelled) {\n            if (STATE_RECOVER_RETRY.equals(prefs.getString("automation_state", ""))\n                || STATE_RECOVER_REFRESH.equals(prefs.getString("automation_state", ""))) {\n                String taskId = "";\n                try { taskId = new JSONObject(raw).optString("task_id", ""); } catch (Exception ignored) { }\n                setAutomationState(STATE_WAITING_RESULT, taskId);\n            }\n            return;\n        }\n\n        JSONObject pending;\n        try {\n            pending = new JSONObject(raw);\n        } catch (Exception error) {\n            WakeState.log(this, "⚠ Recovery task parse lỗi: " + error.getMessage());\n            clearRecovery("parse-error");\n            return;\n        }\n\n        String taskId = pending.optString("task_id", "");\n        int refreshes = prefs.getInt("recovery_refresh_count", 0);\n        int retries = prefs.getInt("recovery_retry_count", 0);\n        long nextActionAt = prefs.getLong("recovery_next_action_at", 0L);\n\n        if (nextActionAt <= 0L) {\n            long delay = nextRecoveryDelayMs();\n            prefs.edit().putLong("recovery_next_action_at", now + delay).apply();\n            setAutomationState(STATE_RECOVER_RETRY, taskId);\n            WakeState.log(this, "⏳ Studio lỗi · đợi " + delay + "ms trước recovery · " + taskId);\n            scheduleRecoveryCheck(delay);\n            return;\n        }\n        if (now < nextActionAt) return;\n\n        if (retries < MAX_RETRIES_PER_REFRESH) {\n            AccessibilityNodeInfo retry = findStudioRetryButton(root);\n            boolean clicked = retry != null && retry.performAction(AccessibilityNodeInfo.ACTION_CLICK);\n            if (clicked) {\n                int nextRetry = retries + 1;\n                long delay = nextRecoveryDelayMs();\n                prefs.edit()\n                    .putInt("recovery_retry_count", nextRetry)\n                    .putLong("recovery_last_retry_at", now)\n                    .putLong("recovery_next_action_at", now + delay)\n                    .apply();\n                setAutomationState(STATE_RECOVER_RETRY, taskId);\n                WakeState.log(this, "↻ Studio Retry " + nextRetry + "/" + MAX_RETRIES_PER_REFRESH\n                    + " · chờ " + delay + "ms trước kiểm tra lại · " + taskId);\n                scheduleRecoveryCheck(delay);\n                return;\n            }\n            WakeState.log(this, "⏳ Không bấm được Retry · chuyển sang reload sau khoảng chờ hiện tại · " + taskId);\n        }\n\n        if (refreshes >= MAX_HARD_REFRESHES) {\n            setAutomationState(STATE_BLOCKED, taskId);\n            requestRecoveryBlocked(raw, refreshes, "studio-internal-error-retry-refresh-circuit-breaker");\n            WakeState.log(this, "⛔ Studio vẫn lỗi sau Retry/Reload có giới hạn · mark blocked · " + taskId);\n            clearRecovery("circuit-breaker");\n            return;\n        }\n\n        AccessibilityNodeInfo refresh = findChromeRefreshButton(root);\n        boolean reloaded = refresh != null && refresh.performAction(AccessibilityNodeInfo.ACTION_CLICK);\n        if (!reloaded) reloaded = requestExactTargetReload(pending);\n\n        if (!reloaded) {\n            setAutomationState(STATE_BLOCKED, taskId);\n            requestRecoveryBlocked(raw, refreshes + 1, "reload-action-unavailable");\n            clearRecovery("reload-action-unavailable");\n            WakeState.log(this, "⛔ Không reload được exact target · mark blocked · " + taskId);\n            return;\n        }\n\n        int nextRefresh = refreshes + 1;\n        long settleDelay = nextRecoveryDelayMs();\n        prefs.edit()\n            .putInt("recovery_refresh_count", nextRefresh)\n            .putLong("recovery_last_refresh_at", now)\n            .putInt("recovery_retry_count", 0)\n            .putLong("recovery_last_retry_at", 0L)\n            .putLong("recovery_next_action_at", now + settleDelay)\n            .apply();\n        setAutomationState(STATE_RECOVER_REFRESH, taskId);\n        WakeState.log(this, "🔄 Studio reload " + nextRefresh + "/" + MAX_HARD_REFRESHES\n            + " · chờ " + settleDelay + "ms cho trang load ổn định · giữ nguyên " + taskId);\n        scheduleRecoveryCheck(settleDelay);\n    }\n\n    private long nextRecoveryDelayMs() {\n        long span = RECOVERY_ACTION_MAX_DELAY_MS - RECOVERY_ACTION_MIN_DELAY_MS + 1L;\n        return RECOVERY_ACTION_MIN_DELAY_MS + Math.floorMod(System.nanoTime(), span);\n    }\n\n    private void scheduleRecoveryCheck(long delayMs) {\n        handler.postDelayed(() -> {\n            if (sending) return;\n            AccessibilityNodeInfo root = getRootInActiveWindow();\n            if (root != null) processPostSendRecovery(root, System.currentTimeMillis());\n        }, Math.max(250L, delayMs + 120L));\n    }\n\n    private AccessibilityNodeInfo findStudioRetryButton(AccessibilityNodeInfo root) {\n        Deque<AccessibilityNodeInfo> queue = new ArrayDeque<>();\n        queue.add(root);\n        AccessibilityNodeInfo best = null;\n        int bestScore = Integer.MIN_VALUE;\n\n        while (!queue.isEmpty()) {\n            AccessibilityNodeInfo node = queue.removeFirst();\n            String descriptor = describe(node).toLowerCase(Locale.ROOT).trim();\n            if (node.isClickable() && node.isEnabled() && node.isVisibleToUser()) {\n                int score = 0;\n                if (descriptor.matches(".*(retry|try again|thử lại).*")) score += 30;\n                if (descriptor.matches(".*(reload|refresh|send|submit|publish|share|feedback|report).*")) score -= 35;\n                if (score > bestScore) {\n                    bestScore = score;\n                    best = node;\n                }\n            }\n            for (int i = 0; i < node.getChildCount(); i++) {\n                AccessibilityNodeInfo child = node.getChild(i);\n                if (child != null) queue.addLast(child);\n            }\n        }\n\n        if (bestScore >= 20) return best;\n\n        AccessibilityNodeInfo marker = findNodeContaining(root, "retry");\n        if (marker == null) marker = findNodeContaining(root, "try again");\n        AccessibilityNodeInfo current = marker;\n        for (int depth = 0; current != null && depth < 5; depth++) {\n            if (current.isClickable() && current.isEnabled() && current.isVisibleToUser()) return current;\n            current = current.getParent();\n        }\n        return null;\n    }\n\n`;
replaceBetween(
  accessibility,
  '    private void processPostSendRecovery(AccessibilityNodeInfo root, long now) {',
  '    private AccessibilityNodeInfo findChromeRefreshButton(AccessibilityNodeInfo root) {',
  recoveryMethod
);
replaceOnce(accessibility,
  '            .remove("recovery_last_refresh_at")\n            .apply();',
  '            .remove("recovery_last_refresh_at")\n            .remove("recovery_retry_count")\n            .remove("recovery_last_retry_at")\n            .remove("recovery_next_action_at")\n            .apply();'
);

const gradle = 'android/bridge-wake-app/app/build.gradle';
let build = fs.readFileSync(gradle, 'utf8');
const codeMatch = build.match(/versionCode\s+(\d+)/);
const nameMatch = build.match(/versionName\s+['"]([^'"]+)['"]/);
if (!codeMatch || !nameMatch) throw new Error('Android version markers missing');
const nextCode = Math.max(Number(codeMatch[1]) + 1, 15);
build = build.replace(/versionCode\s+\d+/, `versionCode ${nextCode}`);
build = build.replace(/versionName\s+['"][^'"]+['"]/, "versionName '0.5.1'");
build = build.replace(/\/\/ Build stamp:.*$/m, '// Build stamp: v0.5.1 no-cache Bridge WebView + paced Studio Retry x3 -> Reload recovery.');
fs.writeFileSync(gradle, build, 'utf8');

console.log(`Patched Android 0.5.1 code ${nextCode}: WebView no-cache + paced Retry x3 -> Reload x2 recovery`);
