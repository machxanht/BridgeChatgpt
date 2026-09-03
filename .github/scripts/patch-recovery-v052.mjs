import fs from 'node:fs';

const servicePath = 'android/bridge-wake-app/app/src/main/java/com/bridge/wake/BridgeAccessibilityService.java';
const gradlePath = 'android/bridge-wake-app/app/build.gradle';

let source = fs.readFileSync(servicePath, 'utf8');

function replaceOnce(before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 marker, found ${count}`);
  source = source.replace(before, after);
}

replaceOnce(
  '    private static final String STATE_RECOVER_REFRESH = "RECOVER_REFRESH";\n    private static final String STATE_BLOCKED = "BLOCKED";',
  '    private static final String STATE_RECOVER_REFRESH = "RECOVER_REFRESH";\n    private static final String STATE_RECOVER_RESTORE = "RECOVER_RESTORE";\n    private static final String STATE_BLOCKED = "BLOCKED";',
  'restore state',
);

replaceOnce(
  '    private long lastAttemptAt = 0L;\n    private boolean sending = false;',
  '    private long lastAttemptAt = 0L;\n    private boolean sending = false;\n    private boolean recoveryActionInFlight = false;',
  'recovery action lock',
);

replaceOnce(
  '            .remove("recovery_next_action_at")\n            .remove("pending_event")',
  '            .remove("recovery_next_action_at")\n            .remove("recovery_restore_after_refresh")\n            .remove("pending_event")',
  'markDelivered cleanup',
);

const startMarker = '    private void processPostSendRecovery(AccessibilityNodeInfo root, long now) {';
const endMarker = '    private AccessibilityNodeInfo findStudioRetryButton(AccessibilityNodeInfo root) {';
const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker, start);
if (start < 0 || end < 0) throw new Error('recovery method markers missing');

const recoveryBlock = `    private void processPostSendRecovery(AccessibilityNodeInfo root, long now) {
        android.content.SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        String raw = prefs.getString("recovery_event", "");
        long until = prefs.getLong("recovery_until", 0L);
        if (raw == null || raw.isEmpty()) return;
        if (until <= 0L || now > until) {
            clearRecovery("window-expired");
            return;
        }

        JSONObject pending;
        try {
            pending = new JSONObject(raw);
        } catch (Exception error) {
            WakeState.log(this, "⚠ Recovery task parse lỗi: " + error.getMessage());
            clearRecovery("parse-error");
            return;
        }

        String taskId = pending.optString("task_id", "");
        long nextActionAt = prefs.getLong("recovery_next_action_at", 0L);
        boolean restoreAfterRefresh = prefs.getBoolean("recovery_restore_after_refresh", false);

        // A hard refresh destroys the active Studio run/composer state. After allowing the
        // page 3-5 seconds to settle, always restore the SAME logical task. This is not a new
        // Bridge task: it rehydrates recovery_event into pending_event and lets the normal
        // verified Send path deliver it once.
        if (restoreAfterRefresh) {
            if (now < nextActionAt || recoveryActionInFlight) return;
            recoveryActionInFlight = true;
            prefs.edit()
                .putString("pending_event", raw)
                .putLong("pending_opened_at", now)
                .remove("recovery_restore_after_refresh")
                .remove("recovery_next_action_at")
                .apply();
            setAutomationState(STATE_RECOVER_RESTORE, taskId);
            WakeState.log(this, "♻ Reload ổn định · restore cùng task rồi Send lại đúng một lần · " + taskId);
            handler.postDelayed(() -> {
                recoveryActionInFlight = false;
                retryPendingDirect();
            }, 900L);
            return;
        }

        boolean internalError = treeContains(root, "an internal error occurred")
            || treeContains(root, "internal error occurred")
            || treeContains(root, "there was an unexpected error")
            || treeContains(root, "something went wrong");
        boolean cancelled = treeContains(root, "canceled") || treeContains(root, "cancelled");
        if (!internalError && !cancelled) {
            String state = prefs.getString("automation_state", "");
            if (STATE_RECOVER_RETRY.equals(state) || STATE_RECOVER_REFRESH.equals(state)) {
                prefs.edit()
                    .putInt("recovery_retry_count", 0)
                    .remove("recovery_next_action_at")
                    .apply();
                setAutomationState(STATE_WAITING_RESULT, taskId);
            }
            return;
        }

        if (recoveryActionInFlight) return;

        int refreshes = prefs.getInt("recovery_refresh_count", 0);
        int retries = prefs.getInt("recovery_retry_count", 0);
        nextActionAt = prefs.getLong("recovery_next_action_at", 0L);

        if (nextActionAt <= 0L) {
            long delay = nextRecoveryDelayMs();
            prefs.edit().putLong("recovery_next_action_at", now + delay).apply();
            setAutomationState(STATE_RECOVER_RETRY, taskId);
            WakeState.log(this, "⏳ Studio lỗi · đợi " + delay + "ms trước Retry · " + taskId);
            scheduleRecoveryCheck(delay, false);
            return;
        }
        if (now < nextActionAt) return;

        recoveryActionInFlight = true;

        if (retries < MAX_RETRIES_PER_REFRESH) {
            AccessibilityNodeInfo retry = findStudioRetryButton(root);
            boolean clicked = retry != null && retry.performAction(AccessibilityNodeInfo.ACTION_CLICK);
            if (clicked) {
                int nextRetry = retries + 1;
                long delay = nextRecoveryDelayMs();
                prefs.edit()
                    .putInt("recovery_retry_count", nextRetry)
                    .putLong("recovery_last_retry_at", now)
                    .putLong("recovery_next_action_at", now + delay)
                    .apply();
                setAutomationState(STATE_RECOVER_RETRY, taskId);
                WakeState.log(this, "↻ Studio Retry " + nextRetry + "/" + MAX_RETRIES_PER_REFRESH
                    + " · chờ " + delay + "ms · " + taskId);
                scheduleRecoveryCheck(delay, true);
                return;
            }
            WakeState.log(this, "⏳ Retry không click được · chuyển sang đúng 1 Refresh · " + taskId);
        }

        if (refreshes >= MAX_HARD_REFRESHES) {
            recoveryActionInFlight = false;
            setAutomationState(STATE_BLOCKED, taskId);
            requestRecoveryBlocked(raw, refreshes, "studio-internal-error-retry-refresh-circuit-breaker");
            WakeState.log(this, "⛔ Studio vẫn lỗi sau Retry/Refresh có giới hạn · mark blocked · " + taskId);
            clearRecovery("circuit-breaker");
            return;
        }

        // Persist the refresh generation BEFORE touching Chrome. Accessibility events can fire
        // during navigation; writing first guarantees they cannot trigger a second refresh.
        int nextRefresh = refreshes + 1;
        long settleDelay = nextRecoveryDelayMs();
        prefs.edit()
            .putInt("recovery_refresh_count", nextRefresh)
            .putLong("recovery_last_refresh_at", now)
            .putInt("recovery_retry_count", 0)
            .putLong("recovery_last_retry_at", 0L)
            .putBoolean("recovery_restore_after_refresh", true)
            .putLong("recovery_next_action_at", now + settleDelay)
            .apply();
        setAutomationState(STATE_RECOVER_REFRESH, taskId);

        AccessibilityNodeInfo refresh = findChromeRefreshButton(root);
        boolean reloaded = refresh != null && refresh.performAction(AccessibilityNodeInfo.ACTION_CLICK);
        if (!reloaded) reloaded = requestExactTargetReload(pending);

        if (!reloaded) {
            recoveryActionInFlight = false;
            prefs.edit()
                .remove("recovery_restore_after_refresh")
                .remove("recovery_next_action_at")
                .apply();
            setAutomationState(STATE_BLOCKED, taskId);
            requestRecoveryBlocked(raw, nextRefresh, "reload-action-unavailable");
            clearRecovery("reload-action-unavailable");
            WakeState.log(this, "⛔ Không reload được exact target · mark blocked · " + taskId);
            return;
        }

        WakeState.log(this, "🔄 Studio Refresh " + nextRefresh + "/" + MAX_HARD_REFRESHES
            + " · khóa refresh kép · chờ " + settleDelay + "ms rồi restore cùng task · " + taskId);
        scheduleRecoveryCheck(settleDelay, true);
    }

    private long nextRecoveryDelayMs() {
        long span = RECOVERY_ACTION_MAX_DELAY_MS - RECOVERY_ACTION_MIN_DELAY_MS + 1L;
        return RECOVERY_ACTION_MIN_DELAY_MS + Math.floorMod(System.nanoTime(), span);
    }

    private void scheduleRecoveryCheck(long delayMs, boolean releaseActionLock) {
        handler.postDelayed(() -> {
            if (releaseActionLock) recoveryActionInFlight = false;
            if (sending) return;
            AccessibilityNodeInfo root = getRootInActiveWindow();
            if (root != null) processPostSendRecovery(root, System.currentTimeMillis());
        }, Math.max(250L, delayMs + 120L));
    }

`;

source = source.slice(0, start) + recoveryBlock + source.slice(end);

replaceOnce(
  '            .remove("recovery_next_action_at")\n            .apply();\n        WakeState.log(this, "🧹 Recovery kết thúc: " + reason);',
  '            .remove("recovery_next_action_at")\n            .remove("recovery_restore_after_refresh")\n            .apply();\n        recoveryActionInFlight = false;\n        WakeState.log(this, "🧹 Recovery kết thúc: " + reason);',
  'clearRecovery cleanup',
);

fs.writeFileSync(servicePath, source, 'utf8');

let gradle = fs.readFileSync(gradlePath, 'utf8');
gradle = gradle.replace(/versionCode\s+\d+/, 'versionCode 16');
gradle = gradle.replace(/versionName\s+['"][^'"]+['"]/, "versionName '0.5.2'");
gradle = gradle.replace(/\/\/ Build stamp:.*$/m, '// Build stamp: v0.5.2 paced Retry x3 -> single locked Refresh -> same-task restore/resend + no-cache WebView.');
fs.writeFileSync(gradlePath, gradle, 'utf8');

console.log('Patched Android 0.5.2: recovery lock + same-task restore after refresh');
