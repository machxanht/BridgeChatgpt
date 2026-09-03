package com.bridge.wake;

import android.accessibilityservice.AccessibilityService;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;

import org.json.JSONObject;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Locale;

public class BridgeAccessibilityService extends AccessibilityService {
    private static final String PREFS = "bridge_wake";
    private static final long MIN_OPEN_AGE_MS = 900L;
    private static final long RETRY_GAP_MS = 1200L;
    private static final long MODAL_RETRY_MS = 650L;
    private static final long SEND_VERIFY_MS = 1100L;
    private static final long RECOVERY_WINDOW_MS = 3 * 60_000L;
    private static final long RECOVERY_REFRESH_GAP_MS = 10_000L;
    private static final int MAX_HARD_REFRESHES = 2;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private long lastAttemptAt = 0L;
    private boolean sending = false;

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        WakeState.log(this, "🔐 Accessibility ON · chỉ theo dõi Google Chrome");
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null || event.getPackageName() == null) return;
        if (!"com.android.chrome".contentEquals(event.getPackageName())) return;
        if (sending) return;

        long now = System.currentTimeMillis();
        if (now - lastAttemptAt < RETRY_GAP_MS) return;

        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return;
        lastAttemptAt = now;

        String raw = getSharedPreferences(PREFS, MODE_PRIVATE).getString("pending_event", "");
        if (raw == null || raw.isEmpty()) {
            processPostSendRecovery(root, now);
            return;
        }

        long openedAt = getSharedPreferences(PREFS, MODE_PRIVATE).getLong("pending_opened_at", 0L);
        if (openedAt > 0 && now - openedAt < MIN_OPEN_AGE_MS) return;

        try {
            JSONObject pending = new JSONObject(raw);
            String prompt = pending.optString("prompt", "").trim();
            if (prompt.isEmpty()) {
                clearPending("prompt-missing");
                return;
            }
            processPending(root, pending, prompt);
        } catch (Exception error) {
            WakeState.log(this, "⚠ Accessibility parse lỗi: " + error.getMessage());
        }
    }

    private void processPending(AccessibilityNodeInfo root, JSONObject pending, String prompt) {
        if (dismissKnownBlockingModal(root)) {
            sending = true;
            WakeState.log(this, "🧹 Đã đóng popup đang chặn Wake");
            handler.postDelayed(() -> {
                sending = false;
                retryPendingDirect();
            }, MODAL_RETRY_MS);
            return;
        }

        AccessibilityNodeInfo composer = findComposer(root);
        if (composer == null) return;

        CharSequence existing = composer.getText();
        String existingText = existing == null ? "" : existing.toString().trim();
        if (!existingText.isEmpty()) {
            if (looksLikeOurPrompt(existingText, pending, prompt)) {
                sending = true;
                handler.postDelayed(() -> finishSend(pending), 250L);
            } else {
                WakeState.log(this, "⏸ Có nội dung đang gõ trong Chrome · không ghi đè");
            }
            return;
        }

        Bundle args = new Bundle();
        args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, prompt);
        boolean textSet = composer.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args);
        if (!textSet) {
            WakeState.log(this, "⚠ Không điền được prompt vào trang hiện tại");
            return;
        }

        sending = true;
        handler.postDelayed(() -> finishSend(pending), 650L);
    }

    private void retryPendingDirect() {
        try {
            String raw = getSharedPreferences(PREFS, MODE_PRIVATE).getString("pending_event", "");
            if (raw == null || raw.isEmpty()) return;
            JSONObject pending = new JSONObject(raw);
            String prompt = pending.optString("prompt", "").trim();
            if (prompt.isEmpty()) {
                clearPending("prompt-missing");
                return;
            }
            AccessibilityNodeInfo root = getRootInActiveWindow();
            if (root != null) processPending(root, pending, prompt);
        } catch (Exception error) {
            WakeState.log(this, "⚠ Retry wake lỗi: " + error.getMessage());
        }
    }

    private void finishSend(JSONObject pending) {
        try {
            AccessibilityNodeInfo root = getRootInActiveWindow();
            if (root == null) {
                sending = false;
                return;
            }

            if (dismissKnownBlockingModal(root)) {
                WakeState.log(this, "🧹 Đóng popup trước khi Send");
                handler.postDelayed(() -> {
                    sending = false;
                    retryPendingDirect();
                }, MODAL_RETRY_MS);
                return;
            }

            AccessibilityNodeInfo send = findSendButton(root);
            boolean clicked = send != null && send.performAction(AccessibilityNodeInfo.ACTION_CLICK);

            if (!clicked) {
                AccessibilityNodeInfo composer = findComposer(root);
                if (composer != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    clicked = composer.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_IME_ENTER.getId());
                }
            }

            if (!clicked) {
                WakeState.log(this, "⏳ Đã điền prompt nhưng chưa tìm thấy nút Send");
                sending = false;
                return;
            }

            // ACTION_CLICK can return true even when a modal overlays the page. Do not mark
            // the task delivered until the prompt actually leaves the composer.
            handler.postDelayed(() -> verifySend(pending), SEND_VERIFY_MS);
        } catch (Exception error) {
            WakeState.log(this, "⚠ Send lỗi: " + error.getMessage());
            sending = false;
        }
    }

    private void verifySend(JSONObject pending) {
        try {
            AccessibilityNodeInfo root = getRootInActiveWindow();
            if (root == null) {
                sending = false;
                return;
            }

            if (dismissKnownBlockingModal(root)) {
                WakeState.log(this, "🧹 Send bị popup chặn · đóng popup rồi gửi lại");
                handler.postDelayed(() -> {
                    sending = false;
                    retryPendingDirect();
                }, MODAL_RETRY_MS);
                return;
            }

            AccessibilityNodeInfo composer = findComposer(root);
            String composerText = composer == null || composer.getText() == null
                ? ""
                : composer.getText().toString().trim();
            String prompt = pending.optString("prompt", "").trim();

            if (!composerText.isEmpty() && looksLikeOurPrompt(composerText, pending, prompt)) {
                WakeState.log(this, "⏳ Click Send chưa được Studio nhận · giữ nguyên task và thử lại");
                sending = false;
                handler.postDelayed(this::retryPendingDirect, 900L);
                return;
            }

            markDelivered(pending);
        } catch (Exception error) {
            WakeState.log(this, "⚠ Verify Send lỗi: " + error.getMessage());
        } finally {
            sending = false;
        }
    }

    private void markDelivered(JSONObject pending) {
        long now = System.currentTimeMillis();
        android.content.SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);

        int refreshCount = 0;
        long lastRefreshAt = 0L;
        String previousRecovery = prefs.getString("recovery_event", "");
        if (previousRecovery != null && !previousRecovery.isEmpty()) {
            try {
                JSONObject previous = new JSONObject(previousRecovery);
                if (previous.optString("task_id", "").equals(pending.optString("task_id", ""))) {
                    refreshCount = prefs.getInt("recovery_refresh_count", 0);
                    lastRefreshAt = prefs.getLong("recovery_last_refresh_at", 0L);
                }
            } catch (Exception ignored) { }
        }

        String eventId = pending.optString("event_id", "");
        android.content.SharedPreferences.Editor editor = prefs.edit()
            .putString("recovery_event", pending.toString())
            .putLong("recovery_until", now + RECOVERY_WINDOW_MS)
            .putInt("recovery_refresh_count", refreshCount)
            .putLong("recovery_last_refresh_at", lastRefreshAt)
            .remove("pending_event")
            .remove("pending_opened_at");
        if (!eventId.isEmpty()) editor.putLong("delivered_" + eventId, now);
        editor.apply();

        WakeState.log(this, "✅ Đã xác nhận Send " + pending.optString("provider") + " · " + pending.optString("task_id"));
    }

    private void processPostSendRecovery(AccessibilityNodeInfo root, long now) {
        android.content.SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        String raw = prefs.getString("recovery_event", "");
        long until = prefs.getLong("recovery_until", 0L);
        if (raw == null || raw.isEmpty()) return;
        if (until <= 0L || now > until) {
            clearRecovery("window-expired");
            return;
        }

        boolean internalError = treeContains(root, "an internal error occurred")
            || treeContains(root, "internal error occurred")
            || treeContains(root, "there was an unexpected error")
            || treeContains(root, "something went wrong");
        boolean cancelled = treeContains(root, "canceled") || treeContains(root, "cancelled");
        if (!internalError && !cancelled) return;

        int refreshes = prefs.getInt("recovery_refresh_count", 0);
        long lastRefreshAt = prefs.getLong("recovery_last_refresh_at", 0L);
        if (refreshes >= MAX_HARD_REFRESHES) {
            String taskId = "";
            try { taskId = new JSONObject(raw).optString("task_id", ""); } catch (Exception ignored) { }
            WakeState.log(this, "⛔ Studio vẫn lỗi sau " + MAX_HARD_REFRESHES + " reload · dừng recovery" + (taskId.isEmpty() ? "" : " · " + taskId));
            clearRecovery("circuit-breaker");
            return;
        }
        if (now - lastRefreshAt < RECOVERY_REFRESH_GAP_MS) return;

        AccessibilityNodeInfo refresh = findChromeRefreshButton(root);
        if (refresh == null) {
            WakeState.log(this, "⚠ Studio lỗi nhưng chưa tìm thấy nút Reload của Chrome");
            return;
        }

        try {
            JSONObject pending = new JSONObject(raw);
            prefs.edit()
                .putString("pending_event", pending.toString())
                .putLong("pending_opened_at", now)
                .putInt("recovery_refresh_count", refreshes + 1)
                .putLong("recovery_last_refresh_at", now)
                .apply();
        } catch (Exception error) {
            WakeState.log(this, "⚠ Không khôi phục được task trước reload: " + error.getMessage());
            return;
        }

        if (refresh.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
            WakeState.log(this, "🔄 Studio internal error · Reload Chrome " + (refreshes + 1) + "/" + MAX_HARD_REFRESHES + " rồi tiếp tục đúng task");
        } else {
            prefs.edit().remove("pending_event").remove("pending_opened_at").apply();
            WakeState.log(this, "⚠ Không bấm được Reload của Chrome");
        }
    }

    private AccessibilityNodeInfo findChromeRefreshButton(AccessibilityNodeInfo root) {
        Deque<AccessibilityNodeInfo> queue = new ArrayDeque<>();
        queue.add(root);
        AccessibilityNodeInfo best = null;
        int bestScore = Integer.MIN_VALUE;

        while (!queue.isEmpty()) {
            AccessibilityNodeInfo node = queue.removeFirst();
            String descriptor = describe(node).toLowerCase(Locale.ROOT).trim();
            if (node.isClickable() && node.isEnabled() && node.isVisibleToUser()) {
                int score = 0;
                if (descriptor.matches(".*(reload this page|reload page|reload|refresh page|refresh|tải lại trang|tải lại).*")) score += 20;
                if (descriptor.matches(".*(retry|send|submit|publish|share|apply).*")) score -= 30;
                if (descriptor.contains("com.android.chrome")) score += 3;
                if (score > bestScore) {
                    bestScore = score;
                    best = node;
                }
            }
            for (int i = 0; i < node.getChildCount(); i++) {
                AccessibilityNodeInfo child = node.getChild(i);
                if (child != null) queue.addLast(child);
            }
        }
        return bestScore >= 15 ? best : null;
    }

    private boolean looksLikeOurPrompt(String existingText, JSONObject pending, String prompt) {
        String normalizedExisting = existingText.replaceAll("\\s+", " ").trim();
        String normalizedPrompt = prompt.replaceAll("\\s+", " ").trim();
        if (normalizedExisting.equals(normalizedPrompt)) return true;
        String taskId = pending.optString("task_id", "").trim();
        return !taskId.isEmpty()
            && normalizedExisting.toLowerCase(Locale.ROOT).contains("bridge wake")
            && normalizedExisting.contains(taskId);
    }

    private boolean dismissKnownBlockingModal(AccessibilityNodeInfo root) {
        AccessibilityNodeInfo envMarker = findNodeContaining(root, "enter your environment variable to continue");
        boolean envModal = envMarker != null || (treeContains(root, "secret value") && treeContains(root, "apply"));

        AccessibilityNodeInfo bugMarker = findNodeContaining(root, "submit bug");
        boolean bugModal = bugMarker != null
            && (treeContains(root, "tell us what went wrong")
                || treeContains(root, "submitting this feedback report")
                || treeContains(root, "feedback report"));

        if (!envModal && !bugModal) return false;

        AccessibilityNodeInfo marker = bugModal ? bugMarker : envMarker;
        AccessibilityNodeInfo current = marker;
        for (int depth = 0; current != null && depth < 7; depth++) {
            AccessibilityNodeInfo close = findModalCloseButton(current);
            if (close != null && close.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                WakeState.log(this, bugModal ? "🧹 Đã đóng Submit Bug" : "🧹 Đã đóng popup environment variable");
                return true;
            }
            if (current.performAction(AccessibilityNodeInfo.ACTION_DISMISS)) {
                WakeState.log(this, bugModal ? "🧹 Đã dismiss Submit Bug" : "🧹 Đã dismiss popup environment variable");
                return true;
            }
            current = current.getParent();
        }

        AccessibilityNodeInfo close = findModalCloseButton(root);
        return close != null && close.performAction(AccessibilityNodeInfo.ACTION_CLICK);
    }

    private AccessibilityNodeInfo findModalCloseButton(AccessibilityNodeInfo root) {
        Deque<AccessibilityNodeInfo> queue = new ArrayDeque<>();
        queue.add(root);
        AccessibilityNodeInfo best = null;
        int bestScore = Integer.MIN_VALUE;

        while (!queue.isEmpty()) {
            AccessibilityNodeInfo node = queue.removeFirst();
            String descriptor = describe(node).toLowerCase(Locale.ROOT).trim();
            if (node.isClickable() && node.isEnabled() && node.isVisibleToUser()) {
                int score = 0;
                if (descriptor.matches(".*(close|dismiss|đóng|close button|dismiss button).*")) score += 12;
                if (descriptor.equals("x") || descriptor.endsWith(" x")) score += 9;
                if (descriptor.matches(".*(apply|secret value|send|submit|share|feedback).*")) score -= 12;
                if (score > bestScore) {
                    bestScore = score;
                    best = node;
                }
            }
            for (int i = 0; i < node.getChildCount(); i++) {
                AccessibilityNodeInfo child = node.getChild(i);
                if (child != null) queue.addLast(child);
            }
        }
        return bestScore >= 8 ? best : null;
    }

    private boolean treeContains(AccessibilityNodeInfo root, String needle) {
        return findNodeContaining(root, needle) != null;
    }

    private AccessibilityNodeInfo findNodeContaining(AccessibilityNodeInfo root, String needle) {
        String target = needle.toLowerCase(Locale.ROOT);
        Deque<AccessibilityNodeInfo> queue = new ArrayDeque<>();
        queue.add(root);
        while (!queue.isEmpty()) {
            AccessibilityNodeInfo node = queue.removeFirst();
            if (describe(node).toLowerCase(Locale.ROOT).contains(target)) return node;
            for (int i = 0; i < node.getChildCount(); i++) {
                AccessibilityNodeInfo child = node.getChild(i);
                if (child != null) queue.addLast(child);
            }
        }
        return null;
    }

    private AccessibilityNodeInfo findComposer(AccessibilityNodeInfo root) {
        Deque<AccessibilityNodeInfo> queue = new ArrayDeque<>();
        queue.add(root);
        AccessibilityNodeInfo best = null;
        int bestScore = Integer.MIN_VALUE;

        while (!queue.isEmpty()) {
            AccessibilityNodeInfo node = queue.removeFirst();
            String descriptor = describe(node).toLowerCase(Locale.ROOT);
            String className = node.getClassName() == null ? "" : node.getClassName().toString().toLowerCase(Locale.ROOT);

            boolean editable = node.isEditable() || className.contains("edittext");
            boolean blockedField = descriptor.matches(".*(secret value|environment variable|tell us what went wrong|feedback report|submit bug).*" );
            if (editable && !blockedField && !looksLikeChromeAddressBar(descriptor)) {
                int score = 0;
                if (descriptor.matches(".*(message|ask anything|ask for anything|make changes|prompt|chatgpt|type something|enter a prompt|send a message|gửi tin nhắn).*")) score += 8;
                if (node.isFocused()) score += 2;
                if (node.isVisibleToUser()) score += 2;
                if (node.isEnabled()) score += 1;
                if (score > bestScore) {
                    bestScore = score;
                    best = node;
                }
            }

            for (int i = 0; i < node.getChildCount(); i++) {
                AccessibilityNodeInfo child = node.getChild(i);
                if (child != null) queue.addLast(child);
            }
        }
        return bestScore >= 3 ? best : null;
    }

    private AccessibilityNodeInfo findSendButton(AccessibilityNodeInfo root) {
        Deque<AccessibilityNodeInfo> queue = new ArrayDeque<>();
        queue.add(root);
        AccessibilityNodeInfo best = null;
        int bestScore = Integer.MIN_VALUE;

        while (!queue.isEmpty()) {
            AccessibilityNodeInfo node = queue.removeFirst();
            String descriptor = describe(node).toLowerCase(Locale.ROOT);
            if (node.isClickable() && node.isEnabled() && node.isVisibleToUser()) {
                int score = 0;
                if (descriptor.matches(".*(send message|send prompt|send|submit|gửi|arrow upward|arrow_upward|arrow up|up arrow).*")) score += 8;
                if (descriptor.matches(".*(stop|cancel|share|copy|apply|submit bug|feedback|report|retry|reload|refresh).*")) score -= 14;
                if (score > bestScore) {
                    bestScore = score;
                    best = node;
                }
            }
            for (int i = 0; i < node.getChildCount(); i++) {
                AccessibilityNodeInfo child = node.getChild(i);
                if (child != null) queue.addLast(child);
            }
        }
        return bestScore >= 5 ? best : null;
    }

    private boolean looksLikeChromeAddressBar(String descriptor) {
        return descriptor.matches(".*(search or type web address|search or enter address|address bar|omnibox|search web|url).*" );
    }

    private String describe(AccessibilityNodeInfo node) {
        StringBuilder out = new StringBuilder();
        if (node.getText() != null) out.append(node.getText()).append(' ');
        if (node.getContentDescription() != null) out.append(node.getContentDescription()).append(' ');
        if (node.getViewIdResourceName() != null) out.append(node.getViewIdResourceName()).append(' ');
        return out.toString().trim();
    }

    private void clearPending(String reason) {
        getSharedPreferences(PREFS, MODE_PRIVATE)
            .edit()
            .remove("pending_event")
            .remove("pending_opened_at")
            .apply();
        WakeState.log(this, "🧹 Xóa wake pending: " + reason);
    }

    private void clearRecovery(String reason) {
        getSharedPreferences(PREFS, MODE_PRIVATE)
            .edit()
            .remove("recovery_event")
            .remove("recovery_until")
            .remove("recovery_refresh_count")
            .remove("recovery_last_refresh_at")
            .apply();
        WakeState.log(this, "🧹 Recovery kết thúc: " + reason);
    }

    @Override
    public void onInterrupt() {
        WakeState.log(this, "🔐 Accessibility tạm dừng");
    }
}
