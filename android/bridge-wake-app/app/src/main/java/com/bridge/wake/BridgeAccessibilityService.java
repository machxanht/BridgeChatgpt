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

        String raw = getSharedPreferences(PREFS, MODE_PRIVATE).getString("pending_event", "");
        if (raw == null || raw.isEmpty()) return;
        long openedAt = getSharedPreferences(PREFS, MODE_PRIVATE).getLong("pending_opened_at", 0L);
        if (openedAt > 0 && now - openedAt < MIN_OPEN_AGE_MS) return;

        lastAttemptAt = now;
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return;

        try {
            JSONObject pending = new JSONObject(raw);
            String prompt = pending.optString("prompt", "").trim();
            if (prompt.isEmpty()) {
                clearPending("prompt-missing");
                return;
            }

            AccessibilityNodeInfo composer = findComposer(root);
            if (composer == null) return;

            CharSequence existing = composer.getText();
            if (existing != null && !existing.toString().trim().isEmpty()) {
                WakeState.log(this, "⏸ Có nội dung đang gõ trong Chrome · không ghi đè");
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
        } catch (Exception error) {
            WakeState.log(this, "⚠ Accessibility parse lỗi: " + error.getMessage());
        }
    }

    private void finishSend(JSONObject pending) {
        try {
            AccessibilityNodeInfo root = getRootInActiveWindow();
            if (root == null) return;
            AccessibilityNodeInfo send = findSendButton(root);
            boolean sent = send != null && send.performAction(AccessibilityNodeInfo.ACTION_CLICK);

            if (!sent) {
                AccessibilityNodeInfo composer = findComposer(root);
                if (composer != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    sent = composer.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_IME_ENTER.getId());
                }
            }

            if (sent) {
                String eventId = pending.optString("event_id", "");
                if (!eventId.isEmpty()) {
                    getSharedPreferences(PREFS, MODE_PRIVATE)
                        .edit()
                        .putLong("delivered_" + eventId, System.currentTimeMillis())
                        .remove("pending_event")
                        .remove("pending_opened_at")
                        .apply();
                } else {
                    clearPending("sent");
                }
                WakeState.log(this, "✅ Đã wake " + pending.optString("provider") + " · " + pending.optString("task_id"));
            } else {
                WakeState.log(this, "⏳ Đã điền prompt nhưng chưa tìm thấy nút Send");
            }
        } catch (Exception error) {
            WakeState.log(this, "⚠ Send lỗi: " + error.getMessage());
        } finally {
            sending = false;
        }
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
            if (editable && !looksLikeChromeAddressBar(descriptor)) {
                int score = 0;
                if (descriptor.matches(".*(message|ask anything|prompt|chatgpt|type something|enter a prompt|send a message|gửi tin nhắn).*")) score += 8;
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
                if (descriptor.matches(".*(send message|send prompt|send|submit|gửi|arrow upward|arrow_upward).*")) score += 8;
                if (descriptor.matches(".*(stop|cancel|share|copy).*")) score -= 10;
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

    @Override
    public void onInterrupt() {
        WakeState.log(this, "🔐 Accessibility tạm dừng");
    }
}
