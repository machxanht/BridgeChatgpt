package com.bridge.wake;

import android.content.Context;
import android.content.SharedPreferences;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public final class WakeState {
    public static final String PREFS = "bridge_wake";

    private WakeState() {}

    public static void log(Context context, String message) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String stamp = new SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(new Date());
        String line = stamp + "  " + message;
        String previous = prefs.getString("last_log", "");
        String next = line + (previous == null || previous.isEmpty() ? "" : "\n" + previous);
        String[] lines = next.split("\n");
        StringBuilder trimmed = new StringBuilder();
        for (int i = 0; i < Math.min(lines.length, 12); i++) {
            if (i > 0) trimmed.append('\n');
            trimmed.append(lines[i]);
        }
        prefs.edit()
            .putString("last_log", trimmed.toString())
            .putString("last_status", message)
            .putLong("last_status_at", System.currentTimeMillis())
            .apply();
    }
}
