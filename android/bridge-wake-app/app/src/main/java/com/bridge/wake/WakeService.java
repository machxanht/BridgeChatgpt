package com.bridge.wake;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.provider.Browser;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

public class WakeService extends Service {
    public static final String CHANNEL_ID = "bridge_wake";
    public static final int NOTIFICATION_ID = 4107;
    public static final String ACTION_WAKE_NOW = "com.bridge.wake.WAKE_NOW";
    public static final String ACTION_STOP = "com.bridge.wake.STOP";

    private static final String BRIDGE_QUEUE_URL = "https://bridge-ai-mission-control.ai.studio/api/android-wake/queue";
    private static final String WAKE_LOGIC_VERSION = "0.4.8-idle-gate-v1";
    private static final long POLL_MS = 45_000L;
    private static final long STALE_PENDING_MS = 4 * 60_000L;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final AtomicBoolean polling = new AtomicBoolean(false);

    private final Runnable pollLoop = new Runnable() {
        @Override
        public void run() {
            pollNow();
            handler.postDelayed(this, POLL_MS);
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        clearLegacyWakeStateOnce();
        createChannel();
        startForeground(NOTIFICATION_ID, buildNotification("Bridge Wake đang khởi động"));
        WakeState.log(this, "⚡ Wake service ON");
        handler.postDelayed(pollLoop, 1500L);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            WakeState.log(this, "⏹ Wake service OFF");
            stopSelf();
            return START_NOT_STICKY;
        }
        if (intent != null && ACTION_WAKE_NOW.equals(intent.getAction())) {
            pollNow();
        }
        updateNotification("Bridge Wake đang chạy");
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        executor.shutdownNow();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void clearLegacyWakeStateOnce() {
        SharedPreferences prefs = getSharedPreferences(WakeState.PREFS, MODE_PRIVATE);
        String applied = prefs.getString("wake_logic_version", "");
        if (WAKE_LOGIC_VERSION.equals(applied)) return;

        // APK upgrades preserve SharedPreferences. Old builds could therefore carry an
        // already-obsolete prompt into a newer Accessibility service. Clear only the
        // transient automation state; pairing and completed-task wake gates remain intact.
        prefs.edit()
            .putString("wake_logic_version", WAKE_LOGIC_VERSION)
            .remove("pending_event")
            .remove("pending_opened_at")
            .remove("recovery_event")
            .remove("recovery_until")
            .remove("recovery_retry_count")
            .remove("recovery_last_action_at")
            .apply();
        WakeState.log(this, "🧹 Wake v0.4.8 · đã xóa prompt automation cũ sau khi nâng cấp");
    }

    private void pollNow() {
        if (!polling.compareAndSet(false, true)) return;
        executor.execute(() -> {
            try {
                SharedPreferences prefs = getSharedPreferences(WakeState.PREFS, MODE_PRIVATE);
                String token = prefs.getString("wake_token", "");
                if (token == null || token.isEmpty()) {
                    WakeState.log(this, "🔑 Chưa pair Bridge · mở app để lấy wake token");
                    return;
                }

                // Always ask Bridge first. Older builds returned early when a local pending
                // prompt existed, which meant a task removed/claimed on the server could
                // continue typing locally for several minutes.
                JSONObject packet = fetchQueue(token);
                if (!packet.optBoolean("ok", false)) {
                    int status = packet.optInt("status", 0);
                    String error = packet.optString("error", "HTTP " + status);
                    if (status == 401) {
                        prefs.edit().remove("wake_token").apply();
                        WakeState.log(this, "🔑 Wake token hết hạn · mở app để pair lại");
                    } else {
                        WakeState.log(this, "⚠ Wake queue lỗi: " + error);
                    }
                    return;
                }

                JSONArray events = packet.optJSONArray("events");
                if (events == null || events.length() == 0) {
                    clearOrphanPending(prefs, "queue-empty");
                    updateNotification("Bridge Wake · idle · không có task");
                    return;
                }

                long now = System.currentTimeMillis();
                String pendingRaw = prefs.getString("pending_event", "");
                long pendingAt = prefs.getLong("pending_opened_at", 0L);
                if (pendingRaw != null && !pendingRaw.isEmpty()) {
                    String pendingGate = "";
                    try {
                        pendingGate = wakeGateKey(new JSONObject(pendingRaw));
                    } catch (Exception ignored) { }

                    boolean stillQueued = !pendingGate.isEmpty() && queueContainsGate(events, pendingGate);
                    boolean stillFresh = pendingAt > 0 && now - pendingAt < STALE_PENDING_MS;
                    if (stillQueued && stillFresh) {
                        // Accessibility owns this live prompt. Do not reopen Chrome.
                        return;
                    }

                    clearOrphanPending(prefs, stillQueued ? "pending-stale" : "task-no-longer-queued");
                }

                JSONObject selected = null;
                String selectedGate = "";
                for (int i = 0; i < Math.min(events.length(), 30); i++) {
                    JSONObject event = events.optJSONObject(i);
                    if (event == null) continue;
                    String eventId = event.optString("event_id", "");
                    if (eventId.isEmpty()) continue;

                    // Gate by logical task+reason+target instead of event_id. event_id contains
                    // updated_at and can change for the same task, which previously made the
                    // same old task look new and wake Chrome again.
                    String gate = wakeGateKey(event);
                    if (gate.isEmpty()) continue;
                    if (prefs.getLong(gate, 0L) > 0L) continue;

                    selected = event;
                    selectedGate = gate;
                    break;
                }

                if (selected == null) {
                    clearOrphanPending(prefs, "all-queued-work-already-woken");
                    updateNotification("Bridge Wake · idle · không có task mới");
                    return;
                }

                selected.put("wake_gate_key", selectedGate);
                prefs.edit()
                    .putString("pending_event", selected.toString())
                    .putLong("pending_opened_at", now)
                    .apply();

                String provider = selected.optString("provider", "");
                String taskId = selected.optString("task_id", "");
                WakeState.log(this, "📨 " + taskId + " → " + provider + " · mở/reuse Chrome automation tab");
                updateNotification("Wake " + taskId + " → " + provider);
                openChrome(selected.optString("resource_url", ""));
            } catch (Exception error) {
                WakeState.log(this, "⚠ Poll lỗi: " + error.getMessage());
            } finally {
                polling.set(false);
            }
        });
    }

    private String wakeGateKey(JSONObject event) {
        String taskId = event.optString("task_id", "").trim();
        String reason = event.optString("reason", "").trim();
        String targetId = event.optString("target_id", "").trim();
        if (taskId.isEmpty() || reason.isEmpty() || targetId.isEmpty()) return "";
        // task_id/reason/target_id are Bridge-generated identifiers and safe as a
        // SharedPreferences key. Deliberately exclude task.updated_at/status so metadata
        // churn cannot resurrect the same wake instruction.
        return "wake_gate:" + reason + ":" + targetId + ":" + taskId;
    }

    private boolean queueContainsGate(JSONArray events, String wantedGate) {
        for (int i = 0; i < Math.min(events.length(), 100); i++) {
            JSONObject event = events.optJSONObject(i);
            if (event != null && wantedGate.equals(wakeGateKey(event))) return true;
        }
        return false;
    }

    private void clearOrphanPending(SharedPreferences prefs, String reason) {
        String raw = prefs.getString("pending_event", "");
        if (raw == null || raw.isEmpty()) return;
        prefs.edit().remove("pending_event").remove("pending_opened_at").apply();
        WakeState.log(this, "🧹 Không còn task cần Wake · bỏ prompt cũ (" + reason + ")");
    }

    private JSONObject fetchQueue(String token) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(BRIDGE_QUEUE_URL).openConnection();
        connection.setRequestMethod("GET");
        connection.setConnectTimeout(12_000);
        connection.setReadTimeout(15_000);
        connection.setUseCaches(false);
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("Authorization", "Bearer " + token);
        int status = connection.getResponseCode();
        InputStream stream = status >= 200 && status < 400 ? connection.getInputStream() : connection.getErrorStream();
        String body = readAll(stream);
        connection.disconnect();
        JSONObject parsed;
        try {
            parsed = body == null || body.isEmpty() ? new JSONObject() : new JSONObject(body);
        } catch (Exception ignored) {
            parsed = new JSONObject();
            parsed.put("error", "Invalid JSON from Bridge");
        }
        parsed.put("status", status);
        if (!parsed.has("ok")) parsed.put("ok", status >= 200 && status < 300);
        return parsed;
    }

    private String readAll(InputStream stream) throws Exception {
        if (stream == null) return "";
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            StringBuilder out = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) out.append(line);
            return out.toString();
        }
    }

    private void openChrome(String url) {
        if (url == null || url.trim().isEmpty()) {
            WakeState.log(this, "⚠ Wake thiếu target URL");
            return;
        }

        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        intent.setPackage("com.android.chrome");
        intent.putExtra(Browser.EXTRA_APPLICATION_ID, getPackageName());
        intent.addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_SINGLE_TOP
                | Intent.FLAG_ACTIVITY_CLEAR_TOP
                | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
        );
        try {
            startActivity(intent);
        } catch (Exception chromeMissing) {
            Intent fallback = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            fallback.putExtra(Browser.EXTRA_APPLICATION_ID, getPackageName());
            fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            try {
                startActivity(fallback);
            } catch (Exception error) {
                WakeState.log(this, "⚠ Không mở được browser: " + error.getMessage());
            }
        }
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Bridge Wake",
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("Bridge Wake chỉ mở Chrome khi có task mới được map đúng session.");
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) manager.createNotificationChannel(channel);
    }

    private void updateNotification(String text) {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) manager.notify(NOTIFICATION_ID, buildNotification(text));
    }

    private Notification buildNotification(String text) {
        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this,
            0,
            open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(this, CHANNEL_ID)
            : new Notification.Builder(this);

        return builder
            .setContentTitle("Bridge Wake")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.stat_notify_sync_noanim)
            .setOngoing(true)
            .setContentIntent(pendingIntent)
            .build();
    }
}
