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
    private static final long POLL_MS = 45_000L;
    private static final long REDELIVERY_MS = 10 * 60_000L;
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

                String pendingRaw = prefs.getString("pending_event", "");
                long pendingAt = prefs.getLong("pending_opened_at", 0L);
                if (pendingRaw != null && !pendingRaw.isEmpty()) {
                    if (pendingAt > 0 && System.currentTimeMillis() - pendingAt < STALE_PENDING_MS) {
                        return;
                    }
                    prefs.edit().remove("pending_event").remove("pending_opened_at").apply();
                    WakeState.log(this, "♻ Wake cũ quá hạn · thử lại");
                }

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
                    updateNotification("Bridge Wake · không có task pending");
                    return;
                }

                long now = System.currentTimeMillis();
                JSONObject selected = null;
                for (int i = 0; i < Math.min(events.length(), 30); i++) {
                    JSONObject event = events.optJSONObject(i);
                    if (event == null) continue;
                    String eventId = event.optString("event_id", "");
                    if (eventId.isEmpty()) continue;
                    long deliveredAt = prefs.getLong("delivered_" + eventId, 0L);
                    if (deliveredAt > 0 && now - deliveredAt < REDELIVERY_MS) continue;
                    selected = event;
                    break;
                }

                if (selected == null) return;
                prefs.edit()
                    .putString("pending_event", selected.toString())
                    .putLong("pending_opened_at", now)
                    .apply();

                String provider = selected.optString("provider", "");
                String taskId = selected.optString("task_id", "");
                WakeState.log(this, "📨 " + taskId + " → " + provider + " · mở Chrome");
                updateNotification("Wake " + taskId + " → " + provider);
                openChrome(selected.optString("resource_url", ""));
            } catch (Exception error) {
                WakeState.log(this, "⚠ Poll lỗi: " + error.getMessage());
            } finally {
                polling.set(false);
            }
        });
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
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            startActivity(intent);
        } catch (Exception chromeMissing) {
            Intent fallback = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
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
        channel.setDescription("Bridge Wake kiểm tra task và mở đúng ChatGPT / AI Studio trong Chrome.");
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
