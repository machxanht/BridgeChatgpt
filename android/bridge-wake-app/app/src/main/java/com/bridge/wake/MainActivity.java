package com.bridge.wake;

import android.Manifest;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.app.Activity;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONObject;

import java.util.List;

public class MainActivity extends Activity {
    private static final String BRIDGE_URL = "https://bridge-ai-mission-control.ai.studio/";
    private static final String CHATGPT_URL = "https://chatgpt.com/";
    private static final String STUDIO_URL = "https://aistudio.google.com/";

    private final Handler handler = new Handler(Looper.getMainLooper());
    private SharedPreferences preferences;
    private TextView statusText;
    private TextView pairText;
    private TextView accessText;
    private TextView logText;
    private Button wakeToggle;
    private WebView pairingWeb;
    private boolean pairingStarted = false;

    private final Runnable refreshUiLoop = new Runnable() {
        @Override
        public void run() {
            refreshUi();
            handler.postDelayed(this, 1200L);
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        preferences = getSharedPreferences(WakeState.PREFS, Context.MODE_PRIVATE);
        if (!preferences.contains("wake_enabled")) preferences.edit().putBoolean("wake_enabled", true).apply();
        buildUi();
        configurePairingWebView();
        requestNotificationPermission();
        pairWithBridge();
        if (preferences.getBoolean("wake_enabled", true)) startWakeService();
        handler.post(refreshUiLoop);
    }

    @Override
    protected void onResume() {
        super.onResume();
        refreshUi();
        if (preferences.getString("wake_token", "").isEmpty()) pairWithBridge();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (pairingWeb != null) pairingWeb.destroy();
        super.onDestroy();
    }

    private void buildUi() {
        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(Color.rgb(2, 6, 23));

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(16), dp(16), dp(16), dp(30));
        scroll.addView(root, new ScrollView.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        TextView title = text("⚡ BRIDGE WAKE", 24f, Color.WHITE, true);
        root.addView(title);
        TextView subtitle = text("Chrome thật + Accessibility · ChatGPT và AI Studio đăng nhập độc lập", 12f, Color.rgb(148, 163, 184), false);
        subtitle.setPadding(0, dp(4), 0, dp(14));
        root.addView(subtitle);

        statusText = cardText("● WAKE ON", Color.rgb(110, 231, 183));
        root.addView(statusText);

        pairText = cardText("🔑 Đang pair Bridge...", Color.rgb(196, 181, 253));
        root.addView(pairText);

        accessText = cardText("🔐 Accessibility: đang kiểm tra", Color.rgb(125, 211, 252));
        root.addView(accessText);

        TextView setupTitle = text("THIẾT LẬP 1 LẦN", 13f, Color.rgb(226, 232, 240), true);
        setupTitle.setPadding(0, dp(16), 0, dp(8));
        root.addView(setupTitle);

        Button accessibility = bigButton("1  🔐  BẬT ACCESSIBILITY", Color.rgb(30, 64, 175));
        accessibility.setOnClickListener(v -> startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)));
        root.addView(accessibility);

        Button chatgpt = bigButton("2  🟢  MỞ CHATGPT TRONG CHROME", Color.rgb(6, 95, 70));
        chatgpt.setOnClickListener(v -> openChrome(CHATGPT_URL));
        root.addView(chatgpt);

        Button studio = bigButton("3  🔵  MỞ AI STUDIO TRONG CHROME", Color.rgb(7, 89, 133));
        studio.setOnClickListener(v -> openChrome(STUDIO_URL));
        root.addView(studio);

        TextView note = text(
            "Đăng nhập Google/ChatGPT trực tiếp trong Chrome. Bridge Wake không nhận mật khẩu và không dùng cookie đăng nhập của hai dịch vụ này.",
            11f,
            Color.rgb(148, 163, 184),
            false
        );
        note.setPadding(dp(2), dp(4), dp(2), dp(12));
        root.addView(note);

        TextView controlsTitle = text("ĐIỀU KHIỂN", 13f, Color.rgb(226, 232, 240), true);
        controlsTitle.setPadding(0, dp(8), 0, dp(8));
        root.addView(controlsTitle);

        wakeToggle = bigButton("⚡ WAKE ON", Color.rgb(109, 40, 217));
        wakeToggle.setOnClickListener(v -> toggleWake());
        root.addView(wakeToggle);

        Button wakeNow = bigButton("⚡ KIỂM TRA NGAY", Color.rgb(180, 83, 9));
        wakeNow.setOnClickListener(v -> {
            preferences.edit().putBoolean("wake_enabled", true).apply();
            startWakeService();
            Intent intent = new Intent(this, WakeService.class);
            intent.setAction(WakeService.ACTION_WAKE_NOW);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(intent); else startService(intent);
            WakeState.log(this, "⚡ Kiểm tra Bridge ngay");
            refreshUi();
        });
        root.addView(wakeNow);

        Button bridge = bigButton("🟣 MỞ BRIDGE DASHBOARD", Color.rgb(76, 29, 149));
        bridge.setOnClickListener(v -> openChrome(BRIDGE_URL));
        root.addView(bridge);

        TextView logTitle = text("HOẠT ĐỘNG GẦN ĐÂY", 13f, Color.rgb(226, 232, 240), true);
        logTitle.setPadding(0, dp(16), 0, dp(8));
        root.addView(logTitle);

        logText = text("Chưa có log.", 11f, Color.rgb(203, 213, 225), false);
        logText.setBackgroundColor(Color.rgb(15, 23, 42));
        logText.setPadding(dp(12), dp(12), dp(12), dp(12));
        root.addView(logText, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        pairingWeb = new WebView(this);
        pairingWeb.setAlpha(0.01f);
        LinearLayout.LayoutParams hidden = new LinearLayout.LayoutParams(1, 1);
        hidden.gravity = Gravity.CENTER;
        root.addView(pairingWeb, hidden);

        setContentView(scroll);
    }

    private void configurePairingWebView() {
        WebSettings settings = pairingWeb.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setLoadsImagesAutomatically(false);
        pairingWeb.addJavascriptInterface(new PairNative(), "BridgePairNative");
        pairingWeb.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase();
                if (host.equals("bridge-ai-mission-control.ai.studio")) return false;
                openChrome(uri.toString());
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (url == null || !url.startsWith(BRIDGE_URL)) return;
                requestPairToken();
            }
        });
    }

    private void pairWithBridge() {
        if (pairingStarted && !preferences.getString("wake_token", "").isEmpty()) return;
        pairingStarted = true;
        pairingWeb.loadUrl(BRIDGE_URL);
    }

    private void requestPairToken() {
        String script = "(async()=>{try{" +
            "const r=await fetch('/api/android-wake/pair-token',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});" +
            "const d=await r.json().catch(()=>({}));" +
            "BridgePairNative.onPairResult(JSON.stringify({ok:r.ok,status:r.status,token:d.token||'',error:d.error||''}));" +
            "}catch(e){BridgePairNative.onPairResult(JSON.stringify({ok:false,status:0,error:String(e)}));}})();";
        pairingWeb.evaluateJavascript(script, null);
    }

    private void toggleWake() {
        boolean enabled = preferences.getBoolean("wake_enabled", true);
        if (enabled) {
            preferences.edit().putBoolean("wake_enabled", false).apply();
            Intent stop = new Intent(this, WakeService.class);
            stop.setAction(WakeService.ACTION_STOP);
            startService(stop);
        } else {
            preferences.edit().putBoolean("wake_enabled", true).apply();
            startWakeService();
        }
        refreshUi();
    }

    private void startWakeService() {
        Intent service = new Intent(this, WakeService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(service); else startService(service);
    }

    private void refreshUi() {
        if (statusText == null) return;
        boolean enabled = preferences.getBoolean("wake_enabled", true);
        boolean paired = !preferences.getString("wake_token", "").isEmpty();
        boolean accessibility = isAccessibilityEnabled();
        String pending = preferences.getString("pending_event", "");

        statusText.setText(enabled ? "● WAKE ON · kiểm tra mỗi 45 giây" : "○ WAKE OFF");
        statusText.setTextColor(enabled ? Color.rgb(110, 231, 183) : Color.rgb(148, 163, 184));
        pairText.setText(paired ? "🔑 Bridge paired · wake token riêng đã lưu" : "🔑 Chưa pair được Bridge · chờ Bridge live hỗ trợ Android Wake");
        accessText.setText(accessibility ? "🔐 Accessibility ON · chỉ Google Chrome" : "🔐 Accessibility OFF · bấm nút bên dưới để bật");
        accessText.setTextColor(accessibility ? Color.rgb(125, 211, 252) : Color.rgb(251, 191, 36));
        wakeToggle.setText(enabled ? "⏹ TẮT WAKE" : "⚡ BẬT WAKE");

        String log = preferences.getString("last_log", "");
        if (pending != null && !pending.isEmpty()) {
            logText.setText("📨 Có wake đang chờ Chrome xử lý\n\n" + (log == null ? "" : log));
        } else {
            logText.setText(log == null || log.isEmpty() ? "Chưa có log." : log);
        }
    }

    private boolean isAccessibilityEnabled() {
        try {
            android.view.accessibility.AccessibilityManager manager =
                (android.view.accessibility.AccessibilityManager) getSystemService(Context.ACCESSIBILITY_SERVICE);
            if (manager == null) return false;
            List<AccessibilityServiceInfo> enabled = manager.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK);
            ComponentName expected = new ComponentName(this, BridgeAccessibilityService.class);
            String expectedId = expected.flattenToString();
            for (AccessibilityServiceInfo info : enabled) {
                if (info.getId() != null && info.getId().equals(expectedId)) return true;
            }
        } catch (Exception ignored) {}
        return false;
    }

    private void openChrome(String url) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        intent.setPackage("com.android.chrome");
        try {
            startActivity(intent);
        } catch (Exception chromeMissing) {
            Intent fallback = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            startActivity(fallback);
        }
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 4107);
        }
    }

    private TextView cardText(String value, int color) {
        TextView text = text(value, 13f, color, true);
        text.setBackgroundColor(Color.rgb(15, 23, 42));
        text.setPadding(dp(12), dp(11), dp(12), dp(11));
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        params.setMargins(0, dp(4), 0, dp(4));
        text.setLayoutParams(params);
        return text;
    }

    private Button bigButton(String label, int background) {
        Button button = new Button(this);
        button.setText(label);
        button.setAllCaps(false);
        button.setTextColor(Color.WHITE);
        button.setTextSize(13f);
        button.setGravity(Gravity.CENTER_VERTICAL);
        button.setBackgroundColor(background);
        button.setPadding(dp(14), 0, dp(14), 0);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(54));
        params.setMargins(0, dp(5), 0, dp(5));
        button.setLayoutParams(params);
        return button;
    }

    private TextView text(String value, float size, int color, boolean bold) {
        TextView text = new TextView(this);
        text.setText(value);
        text.setTextSize(size);
        text.setTextColor(color);
        if (bold) text.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        return text;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private class PairNative {
        @JavascriptInterface
        public void onPairResult(String raw) {
            runOnUiThread(() -> {
                try {
                    JSONObject packet = new JSONObject(raw);
                    String token = packet.optString("token", "");
                    if (packet.optBoolean("ok", false) && token.startsWith("bridgewake.")) {
                        preferences.edit().putString("wake_token", token).apply();
                        WakeState.log(MainActivity.this, "🔑 Bridge paired · token chỉ đọc wake queue");
                        startWakeService();
                    } else {
                        String error = packet.optString("error", "HTTP " + packet.optInt("status", 0));
                        WakeState.log(MainActivity.this, "⏳ Pair Bridge chưa sẵn sàng: " + error);
                    }
                } catch (Exception error) {
                    WakeState.log(MainActivity.this, "⚠ Pair parse lỗi: " + error.getMessage());
                }
                refreshUi();
            });
        }
    }
}
