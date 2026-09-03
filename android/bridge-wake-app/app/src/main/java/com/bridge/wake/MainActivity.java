package com.bridge.wake;

import android.Manifest;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.app.Activity;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
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
import android.widget.TextView;

import org.json.JSONObject;

import java.util.List;

public class MainActivity extends Activity {
    private static final String BRIDGE_URL = "https://bridge-ai-mission-control.ai.studio/";
    private static final String BRIDGE_HOST = "bridge-ai-mission-control.ai.studio";
    private static final String CHATGPT_URL = "https://chatgpt.com/";
    private static final String STUDIO_URL = "https://aistudio.google.com/";

    private final Handler handler = new Handler(Looper.getMainLooper());
    private SharedPreferences preferences;
    private TextView wakeBadge;
    private TextView accessBanner;
    private TextView pairBadge;
    private WebView dashboardWeb;

    private final Runnable refreshUiLoop = new Runnable() {
        @Override
        public void run() {
            refreshUi();
            handler.postDelayed(this, 1500L);
        }
    };

    private final Runnable pairRetryLoop = new Runnable() {
        @Override
        public void run() {
            if (preferences != null && preferences.getString("wake_token", "").isEmpty()) {
                String url = dashboardWeb == null ? null : dashboardWeb.getUrl();
                if (url != null && url.startsWith(BRIDGE_URL)) requestPairToken();
            }
            handler.postDelayed(this, 8000L);
        }
    };

    private final Runnable registryBackupLoop = new Runnable() {
        @Override
        public void run() {
            String url = dashboardWeb == null ? null : dashboardWeb.getUrl();
            if (url != null && url.startsWith(BRIDGE_URL)) syncResourceRegistryBackup();
            handler.postDelayed(this, 20_000L);
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        preferences = getSharedPreferences(WakeState.PREFS, Context.MODE_PRIVATE);
        if (!preferences.contains("wake_enabled")) {
            preferences.edit().putBoolean("wake_enabled", true).apply();
        }

        buildUi();
        configureDashboardWebView();
        requestNotificationPermission();

        if (preferences.getBoolean("wake_enabled", true)) {
            startWakeService();
        }

        dashboardWeb.loadUrl(BRIDGE_URL);
        handler.post(refreshUiLoop);
        handler.postDelayed(pairRetryLoop, 3000L);
        handler.postDelayed(registryBackupLoop, 6000L);
    }

    @Override
    protected void onResume() {
        super.onResume();
        refreshUi();
        if (preferences.getBoolean("wake_enabled", true)) {
            startWakeService();
        }
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (dashboardWeb != null) dashboardWeb.destroy();
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        if (dashboardWeb != null && dashboardWeb.canGoBack()) {
            dashboardWeb.goBack();
            return;
        }
        super.onBackPressed();
    }

    private void buildUi() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(2, 6, 23));

        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setPadding(dp(14), dp(10), dp(10), dp(10));
        header.setBackgroundColor(Color.rgb(15, 23, 42));

        LinearLayout titleWrap = new LinearLayout(this);
        titleWrap.setOrientation(LinearLayout.VERTICAL);
        TextView title = text("🟣 BRIDGE", 20f, Color.WHITE, true);
        TextView subtitle = text("Mission Control + Wake Engine", 10f, Color.rgb(148, 163, 184), false);
        titleWrap.addView(title);
        titleWrap.addView(subtitle);
        header.addView(titleWrap, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        pairBadge = pill("● CONNECT", Color.rgb(124, 58, 237));
        pairBadge.setOnClickListener(v -> {
            requestPairToken();
            syncResourceRegistryBackup();
        });
        header.addView(pairBadge);

        wakeBadge = pill("⚡ WAKE ON", Color.rgb(5, 150, 105));
        wakeBadge.setOnClickListener(v -> toggleWake());
        LinearLayout.LayoutParams wakeParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(38));
        wakeParams.setMargins(dp(8), 0, 0, 0);
        header.addView(wakeBadge, wakeParams);
        root.addView(header, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        accessBanner = text("🔐 Bật Accessibility một lần để Bridge tự điều khiển Chrome", 12f, Color.rgb(254, 243, 199), true);
        accessBanner.setGravity(Gravity.CENTER_VERTICAL);
        accessBanner.setPadding(dp(14), dp(10), dp(14), dp(10));
        accessBanner.setBackgroundColor(Color.rgb(120, 53, 15));
        accessBanner.setOnClickListener(v -> startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)));
        root.addView(accessBanner, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        dashboardWeb = new WebView(this);
        root.addView(dashboardWeb, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        LinearLayout bottom = new LinearLayout(this);
        bottom.setOrientation(LinearLayout.HORIZONTAL);
        bottom.setGravity(Gravity.CENTER);
        bottom.setPadding(dp(8), dp(7), dp(8), dp(7));
        bottom.setBackgroundColor(Color.rgb(15, 23, 42));

        Button home = navButton("🟣\nBridge");
        home.setOnClickListener(v -> dashboardWeb.loadUrl(BRIDGE_URL));
        bottom.addView(home, navParams());

        Button wakeNow = navButton("⚡\nWake now");
        wakeNow.setOnClickListener(v -> wakeNow());
        bottom.addView(wakeNow, navParams());

        Button chatgpt = navButton("🟢\nChatGPT");
        chatgpt.setOnClickListener(v -> openChrome(CHATGPT_URL));
        bottom.addView(chatgpt, navParams());

        Button studio = navButton("🔵\nAI Studio");
        studio.setOnClickListener(v -> openChrome(STUDIO_URL));
        bottom.addView(studio, navParams());

        Button settings = navButton("⚙\nSetup");
        settings.setOnClickListener(v -> startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)));
        bottom.addView(settings, navParams());

        root.addView(bottom, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(68)));
        setContentView(root);
    }

    private void configureDashboardWebView() {
        WebSettings settings = dashboardWeb.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadsImagesAutomatically(true);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(false);

        dashboardWeb.addJavascriptInterface(new PairNative(), "BridgePairNative");
        dashboardWeb.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase();
                if (BRIDGE_HOST.equals(host)) return false;

                // Login and AI surfaces always stay in the system browser. The APK never embeds
                // Google or ChatGPT credentials/cookies.
                openChrome(uri.toString());
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (url != null && url.startsWith(BRIDGE_URL)) {
                    syncResourceRegistryBackup();
                    requestPairToken();
                }
            }
        });
    }

    private void requestPairToken() {
        String script = "(async()=>{try{" +
            "const r=await fetch('/api/android-wake/pair-token',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});" +
            "const d=await r.json().catch(()=>({}));" +
            "BridgePairNative.onPairResult(JSON.stringify({ok:r.ok,status:r.status,token:d.token||'',error:d.error||''}));" +
            "}catch(e){BridgePairNative.onPairResult(JSON.stringify({ok:false,status:0,error:String(e)}));}})();";
        dashboardWeb.evaluateJavascript(script, null);
    }

    private void syncResourceRegistryBackup() {
        String script = """
            (async()=>{
              const KEY='bridge.android.resourceRegistryBackup.v1';
              const targetCount=(snap)=>(snap?.workspaces||[]).reduce((n,w)=>n+(w.studio_targets||[]).length+(w.chatgpt_targets||[]).length,0);
              try {
                let response=await fetch('/api/resource-registry',{credentials:'same-origin',cache:'no-store'});
                if(!response.ok) return;
                let current=await response.json();
                let backup=null;
                try { backup=JSON.parse(localStorage.getItem(KEY)||'null'); } catch (_) {}

                const currentWorkspaces=current?.workspaces||[];
                const backupWorkspaces=backup?.workspaces||[];
                const currentTargets=targetCount(current);
                const backupTargets=targetCount(backup);
                const instanceChanged=Boolean(backup?.instance_id && current?.instance_id && backup.instance_id!==current.instance_id);
                const lostState=instanceChanged && backupWorkspaces.length>0 && (
                  currentWorkspaces.length<backupWorkspaces.length || currentTargets<backupTargets
                );

                if(lostState){
                  for(const workspace of backupWorkspaces){
                    const projectResponse=await fetch('/api/resource-registry/projects',{
                      method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'},
                      body:JSON.stringify({
                        workspace_id:workspace.workspace_id,
                        project_id:workspace.project_id,
                        project_name:workspace.project_name,
                        repository_url:workspace.repository_url,
                        branch:workspace.branch||'main'
                      })
                    });
                    if(!projectResponse.ok) continue;
                    for(const target of [...(workspace.studio_targets||[]),...(workspace.chatgpt_targets||[])]){
                      await fetch('/api/resource-registry/targets',{
                        method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'},
                        body:JSON.stringify({
                          workspace_id:workspace.workspace_id,
                          resource_url:target.resource_url,
                          label:target.label
                        })
                      });
                    }
                  }
                  response=await fetch('/api/resource-registry',{credentials:'same-origin',cache:'no-store'});
                  if(response.ok) current=await response.json();
                }

                localStorage.setItem(KEY,JSON.stringify({
                  instance_id:current?.instance_id||'',
                  workspaces:current?.workspaces||[],
                  saved_at:new Date().toISOString()
                }));
              } catch (_) {}
            })();
            """;
        dashboardWeb.evaluateJavascript(script, null);
    }

    private void wakeNow() {
        preferences.edit().putBoolean("wake_enabled", true).apply();
        startWakeService();
        Intent intent = new Intent(this, WakeService.class);
        intent.setAction(WakeService.ACTION_WAKE_NOW);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(intent); else startService(intent);
        WakeState.log(this, "⚡ Kiểm tra Bridge ngay");
        refreshUi();
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
        if (wakeBadge == null) return;

        boolean enabled = preferences.getBoolean("wake_enabled", true);
        boolean paired = !preferences.getString("wake_token", "").isEmpty();
        boolean accessibility = isAccessibilityEnabled();

        wakeBadge.setText(enabled ? "⚡ WAKE ON" : "○ WAKE OFF");
        wakeBadge.setBackgroundColor(enabled ? Color.rgb(5, 150, 105) : Color.rgb(71, 85, 105));
        pairBadge.setText(paired ? "● CONNECTED" : "○ PAIRING");
        pairBadge.setBackgroundColor(paired ? Color.rgb(124, 58, 237) : Color.rgb(180, 83, 9));

        if (accessibility) {
            accessBanner.setVisibility(View.GONE);
        } else {
            accessBanner.setVisibility(View.VISIBLE);
            accessBanner.setText("🔐 SETUP 1 LẦN · chạm để bật Accessibility cho Bridge");
        }
    }

    private boolean isAccessibilityEnabled() {
        try {
            android.view.accessibility.AccessibilityManager manager =
                (android.view.accessibility.AccessibilityManager) getSystemService(Context.ACCESSIBILITY_SERVICE);
            if (manager == null) return false;
            List<AccessibilityServiceInfo> enabled = manager.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK);
            String expectedPackage = getPackageName();
            String expectedClass = BridgeAccessibilityService.class.getName();

            for (AccessibilityServiceInfo info : enabled) {
                try {
                    if (info.getResolveInfo() != null) {
                        ServiceInfo serviceInfo = info.getResolveInfo().serviceInfo;
                        if (serviceInfo != null && expectedPackage.equals(serviceInfo.packageName) && expectedClass.equals(serviceInfo.name)) {
                            return true;
                        }
                    }
                } catch (Exception ignored) {}

                String id = info.getId();
                if (id == null) continue;
                ComponentName component = ComponentName.unflattenFromString(id);
                if (component != null && expectedPackage.equals(component.getPackageName()) && expectedClass.equals(component.getClassName())) {
                    return true;
                }
                if (id.startsWith(expectedPackage + "/") && (id.endsWith("/.BridgeAccessibilityService") || id.endsWith("/" + expectedClass))) {
                    return true;
                }
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

    private TextView pill(String label, int background) {
        TextView badge = text(label, 10f, Color.WHITE, true);
        badge.setGravity(Gravity.CENTER);
        badge.setBackgroundColor(background);
        badge.setPadding(dp(10), 0, dp(10), 0);
        badge.setMinHeight(dp(38));
        return badge;
    }

    private Button navButton(String label) {
        Button button = new Button(this);
        button.setText(label);
        button.setAllCaps(false);
        button.setTextColor(Color.rgb(226, 232, 240));
        button.setTextSize(10f);
        button.setGravity(Gravity.CENTER);
        button.setBackgroundColor(Color.TRANSPARENT);
        button.setPadding(dp(2), 0, dp(2), 0);
        return button;
    }

    private LinearLayout.LayoutParams navParams() {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f);
        params.setMargins(dp(2), 0, dp(2), 0);
        return params;
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
                        WakeState.log(MainActivity.this, "🔑 Bridge connected · Wake Engine ready");
                        startWakeService();
                    } else {
                        String error = packet.optString("error", "HTTP " + packet.optInt("status", 0));
                        WakeState.log(MainActivity.this, "⏳ Bridge pairing: " + error);
                    }
                } catch (Exception error) {
                    WakeState.log(MainActivity.this, "⚠ Pair parse lỗi: " + error.getMessage());
                }
                refreshUi();
            });
        }
    }
}
