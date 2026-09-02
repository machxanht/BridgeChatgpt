package com.bridge.wake;

import android.Manifest;
import android.app.Activity;
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
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayDeque;
import java.util.HashSet;
import java.util.Set;

public class MainActivity extends Activity {
    private static final String BRIDGE_URL = "https://bridge-ai-mission-control.ai.studio/";
    private static final long POLL_MS = 45_000L;
    private static final long REDELIVERY_MS = 10 * 60_000L;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ArrayDeque<JSONObject> wakeQueue = new ArrayDeque<>();
    private final Set<String> queuedEventIds = new HashSet<>();

    private SharedPreferences preferences;
    private WebView bridgeWeb;
    private WebView chatgptWeb;
    private WebView studioWeb;
    private FrameLayout webContainer;
    private TextView statusText;
    private TextView detailText;
    private JSONObject activeWake;
    private String currentView = "bridge";
    private boolean bridgeLoaded = false;

    private final Runnable pollRunnable = new Runnable() {
        @Override
        public void run() {
            pollBridge();
            handler.postDelayed(this, POLL_MS);
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        preferences = getSharedPreferences("bridge_wake", Context.MODE_PRIVATE);
        buildUi();
        configureWebViews();
        requestNotificationPermission();
        startWakeService();

        bridgeWeb.loadUrl(BRIDGE_URL);
        chatgptWeb.loadUrl("https://chatgpt.com/");
        studioWeb.loadUrl("https://aistudio.google.com/");
        switchView("bridge");
        handler.postDelayed(pollRunnable, 8_000L);
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        super.onDestroy();
    }

    private void buildUi() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(2, 6, 23));

        statusText = new TextView(this);
        statusText.setText("● WAKE ON · đang khởi động");
        statusText.setTextColor(Color.rgb(110, 231, 183));
        statusText.setTextSize(14f);
        statusText.setGravity(Gravity.CENTER_VERTICAL);
        statusText.setPadding(dp(14), dp(10), dp(14), dp(6));
        statusText.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        root.addView(statusText, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        HorizontalScrollView scroller = new HorizontalScrollView(this);
        scroller.setHorizontalScrollBarEnabled(false);
        LinearLayout tabs = new LinearLayout(this);
        tabs.setOrientation(LinearLayout.HORIZONTAL);
        tabs.setPadding(dp(8), dp(4), dp(8), dp(8));
        scroller.addView(tabs);

        tabs.addView(tabButton("🟣 Bridge", "bridge"));
        tabs.addView(tabButton("🟢 ChatGPT", "chatgpt"));
        tabs.addView(tabButton("🔵 AI Studio", "studio"));

        Button wake = actionButton("⚡ Wake now");
        wake.setOnClickListener(v -> {
            status("⚡ Đang kiểm tra Bridge...");
            pollBridge();
        });
        tabs.addView(wake);

        Button external = actionButton("↗ Mở ngoài");
        external.setOnClickListener(v -> openExternally());
        tabs.addView(external);
        root.addView(scroller, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        webContainer = new FrameLayout(this);
        root.addView(webContainer, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        detailText = new TextView(this);
        detailText.setText("Bridge Wake sẽ tự chuyển đúng ChatGPT/Studio URL khi có task.");
        detailText.setTextColor(Color.rgb(148, 163, 184));
        detailText.setTextSize(11f);
        detailText.setPadding(dp(12), dp(6), dp(12), dp(8));
        root.addView(detailText, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        setContentView(root);
    }

    private Button tabButton(String text, String key) {
        Button button = actionButton(text);
        button.setOnClickListener(v -> switchView(key));
        return button;
    }

    private Button actionButton(String text) {
        Button button = new Button(this);
        button.setText(text);
        button.setTextSize(12f);
        button.setAllCaps(false);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(44));
        params.setMargins(dp(4), 0, dp(4), 0);
        button.setLayoutParams(params);
        return button;
    }

    private void configureWebViews() {
        bridgeWeb = makeWebView("bridge");
        chatgptWeb = makeWebView("chatgpt");
        studioWeb = makeWebView("studio");

        bridgeWeb.addJavascriptInterface(new BridgeNative(), "BridgeNative");
        chatgptWeb.addJavascriptInterface(new WakeNative(), "BridgeWakeNative");
        studioWeb.addJavascriptInterface(new WakeNative(), "BridgeWakeNative");

        webContainer.addView(bridgeWeb, fullFrameParams());
        webContainer.addView(chatgptWeb, fullFrameParams());
        webContainer.addView(studioWeb, fullFrameParams());
    }

    private FrameLayout.LayoutParams fullFrameParams() {
        return new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
    }

    private WebView makeWebView(String kind) {
        WebView webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadsImagesAutomatically(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setSupportMultipleWindows(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setUserAgentString(settings.getUserAgentString().replace("; wv", ""));

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            cookies.setAcceptThirdPartyCookies(webView, true);
        }

        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase();
                if (host.contains("chatgpt.com") || host.contains("openai.com") || host.contains("aistudio.google.com") || host.contains("google.com") || host.contains("bridge-ai-mission-control.ai.studio")) {
                    return false;
                }
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if ("bridge".equals(kind)) {
                    bridgeLoaded = true;
                    status("🟣 Bridge sẵn sàng · Wake ON");
                } else {
                    maybeInjectInto(kind, view, url);
                }
            }
        });
        return webView;
    }

    private void switchView(String key) {
        currentView = key;
        bridgeWeb.setVisibility("bridge".equals(key) ? View.VISIBLE : View.GONE);
        chatgptWeb.setVisibility("chatgpt".equals(key) ? View.VISIBLE : View.GONE);
        studioWeb.setVisibility("studio".equals(key) ? View.VISIBLE : View.GONE);
        if ("bridge".equals(key)) status("🟣 Bridge · Wake ON");
        else if ("chatgpt".equals(key)) status("🟢 ChatGPT · Wake ON");
        else status("🔵 AI Studio · Wake ON");
    }

    private void openExternally() {
        WebView current = "chatgpt".equals(currentView) ? chatgptWeb : "studio".equals(currentView) ? studioWeb : bridgeWeb;
        String url = current.getUrl();
        if (url == null || url.isEmpty()) return;
        startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
    }

    private void pollBridge() {
        if (!bridgeLoaded) return;
        String script = "(async()=>{try{" +
            "const r=await fetch('/api/resource-registry/wake-queue',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});" +
            "const d=await r.json().catch(()=>({}));" +
            "window.BridgeNative.onWakeQueue(JSON.stringify({ok:r.ok,status:r.status,error:d.error||'',events:Array.isArray(d.events)?d.events:[]}));" +
            "}catch(e){window.BridgeNative.onWakeQueue(JSON.stringify({ok:false,status:0,error:String(e),events:[]}));}})();";
        bridgeWeb.evaluateJavascript(script, null);
    }

    private void handleWakeQueue(String raw) {
        try {
            JSONObject packet = new JSONObject(raw);
            if (!packet.optBoolean("ok", false)) {
                detail("Wake queue lỗi: " + packet.optString("error", "HTTP " + packet.optInt("status")));
                return;
            }
            JSONArray events = packet.optJSONArray("events");
            if (events == null || events.length() == 0) {
                if (activeWake == null && wakeQueue.isEmpty()) detail("✅ Không có task cần đánh thức.");
                return;
            }

            long now = System.currentTimeMillis();
            int added = 0;
            for (int i = 0; i < Math.min(events.length(), 20); i++) {
                JSONObject event = events.optJSONObject(i);
                if (event == null) continue;
                String eventId = event.optString("event_id");
                if (eventId.isEmpty() || queuedEventIds.contains(eventId)) continue;
                if (activeWake != null && eventId.equals(activeWake.optString("event_id"))) continue;
                long deliveredAt = preferences.getLong("delivered_" + eventId, 0L);
                if (deliveredAt > 0 && now - deliveredAt < REDELIVERY_MS) continue;
                wakeQueue.offer(event);
                queuedEventIds.add(eventId);
                added++;
            }
            if (added > 0) detail("📨 Nhận " + added + " wake event từ Bridge.");
            processNextWake();
        } catch (JSONException error) {
            detail("Wake queue parse lỗi: " + error.getMessage());
        }
    }

    private void processNextWake() {
        if (activeWake != null) return;
        JSONObject event = wakeQueue.poll();
        if (event == null) return;
        queuedEventIds.remove(event.optString("event_id"));
        activeWake = event;

        String provider = event.optString("provider");
        String targetUrl = event.optString("resource_url");
        String resourceId = event.optString("resource_id");
        String taskId = event.optString("task_id");
        WebView target;
        String kind;
        if ("chatgpt".equals(provider)) {
            target = chatgptWeb;
            kind = "chatgpt";
        } else {
            target = studioWeb;
            kind = "studio";
        }

        switchView(kind);
        status(("chatgpt".equals(kind) ? "🟢" : "🔵") + " Wake " + taskId + "...");
        String currentUrl = target.getUrl();
        if (currentUrl != null && !resourceId.isEmpty() && currentUrl.contains(resourceId)) {
            handler.postDelayed(() -> injectActiveWake(target), 700L);
        } else if (!targetUrl.isEmpty()) {
            target.loadUrl(targetUrl);
        } else {
            failActiveWake("resource-url-missing");
        }
    }

    private void maybeInjectInto(String kind, WebView view, String url) {
        if (activeWake == null) return;
        String provider = activeWake.optString("provider");
        if ("chatgpt".equals(provider) && !"chatgpt".equals(kind)) return;
        if (!"chatgpt".equals(provider) && !"studio".equals(kind)) return;
        String resourceId = activeWake.optString("resource_id");
        if (!resourceId.isEmpty() && url != null && !url.contains(resourceId)) return;
        handler.postDelayed(() -> injectActiveWake(view), 1500L);
    }

    private void injectActiveWake(WebView view) {
        if (activeWake == null) return;
        String prompt = activeWake.optString("prompt");
        if (prompt.isEmpty()) {
            failActiveWake("prompt-missing");
            return;
        }
        String quotedPrompt = JSONObject.quote(prompt);
        String script = "(async()=>{" +
            "const text=" + quotedPrompt + ";" +
            "const sleep=ms=>new Promise(r=>setTimeout(r,ms));" +
            "const vis=e=>{if(!e)return false;const s=getComputedStyle(e),r=e.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0};" +
            "const desc=e=>[(e.getAttribute&&e.getAttribute('aria-label'))||'',(e.getAttribute&&e.getAttribute('title'))||'',(e.getAttribute&&e.getAttribute('data-testid'))||'',e.textContent||''].join(' ');" +
            "const busy=[...document.querySelectorAll('button')].find(b=>vis(b)&&!b.disabled&&/stop generating|stop response|cancel response|dừng tạo|dừng phản hồi/i.test(desc(b)));" +
            "if(busy){BridgeWakeNative.onInjectionResult(JSON.stringify({ok:false,reason:'busy'}));return;}" +
            "const sels=['#prompt-textarea','textarea[placeholder]','textarea','[contenteditable=\"true\"][role=\"textbox\"]','[contenteditable=\"true\"]'];" +
            "let c=null;for(const s of sels){c=[...document.querySelectorAll(s)].find(e=>vis(e)&&!e.disabled&&!e.readOnly);if(c)break;}" +
            "if(!c){BridgeWakeNative.onInjectionResult(JSON.stringify({ok:false,reason:'composer-not-found'}));return;}" +
            "const old=('value'in c?String(c.value||''):String(c.textContent||'')).trim();if(old){BridgeWakeNative.onInjectionResult(JSON.stringify({ok:false,reason:'draft-present'}));return;}" +
            "c.focus();" +
            "if(c instanceof HTMLTextAreaElement){const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')?.set;if(set)set.call(c,text);else c.value=text;}" +
            "else if(c instanceof HTMLInputElement){const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;if(set)set.call(c,text);else c.value=text;}" +
            "else{c.textContent=text;}" +
            "c.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:text}));c.dispatchEvent(new Event('change',{bubbles:true}));await sleep(600);" +
            "const scope=c.closest('form')||c.parentElement?.parentElement?.parentElement||document;" +
            "const bs=['button[data-testid=\"send-button\"]','button[aria-label*=\"Send\"]','button[aria-label*=\"send\"]','button[aria-label*=\"Gửi\"]','button[title*=\"Send\"]','button[type=\"submit\"]'];" +
            "let b=null;for(const s of bs){b=[...scope.querySelectorAll(s)].find(x=>vis(x)&&!x.disabled);if(b)break;}" +
            "if(!b)b=[...scope.querySelectorAll('button')].find(x=>vis(x)&&!x.disabled&&/send message|send prompt|submit prompt|send|submit|gửi|arrow_upward/i.test(desc(x)));" +
            "if(b){b.click();await sleep(400);BridgeWakeNative.onInjectionResult(JSON.stringify({ok:true,method:'button'}));return;}" +
            "for(const t of ['keydown','keypress','keyup'])c.dispatchEvent(new KeyboardEvent(t,{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true,cancelable:true}));await sleep(700);" +
            "const after=('value'in c?String(c.value||''):String(c.textContent||'')).trim();BridgeWakeNative.onInjectionResult(JSON.stringify({ok:!after,method:'enter',reason:after?'send-control-not-found':''}));" +
            "})().catch(e=>BridgeWakeNative.onInjectionResult(JSON.stringify({ok:false,reason:String(e)})));";
        view.evaluateJavascript(script, null);
    }

    private void finishActiveWake(String method) {
        if (activeWake == null) return;
        String eventId = activeWake.optString("event_id");
        String taskId = activeWake.optString("task_id");
        String provider = activeWake.optString("provider");
        if (!eventId.isEmpty()) preferences.edit().putLong("delivered_" + eventId, System.currentTimeMillis()).apply();
        detail("✅ Đã wake " + ("chatgpt".equals(provider) ? "ChatGPT" : "AI Studio") + " cho " + taskId + " · " + method);
        activeWake = null;
        handler.postDelayed(() -> {
            if (wakeQueue.isEmpty()) switchView("bridge");
            processNextWake();
        }, 900L);
    }

    private void failActiveWake(String reason) {
        if (activeWake == null) return;
        String taskId = activeWake.optString("task_id");
        detail("⏳ Chưa wake được " + taskId + ": " + reason + ". Sẽ thử lại.");
        activeWake = null;
        handler.postDelayed(this::processNextWake, 500L);
    }

    private void startWakeService() {
        Intent service = new Intent(this, WakeService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(service);
        else startService(service);
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 4107);
        }
    }

    private void status(String text) {
        statusText.setText(text);
    }

    private void detail(String text) {
        detailText.setText(text);
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    public class BridgeNative {
        @JavascriptInterface
        public void onWakeQueue(String json) {
            runOnUiThread(() -> handleWakeQueue(json));
        }
    }

    public class WakeNative {
        @JavascriptInterface
        public void onInjectionResult(String json) {
            runOnUiThread(() -> {
                try {
                    JSONObject result = new JSONObject(json);
                    if (result.optBoolean("ok", false)) finishActiveWake(result.optString("method", "sent"));
                    else failActiveWake(result.optString("reason", "unknown"));
                } catch (JSONException error) {
                    failActiveWake("invalid-injection-result");
                }
            });
        }
    }
}
