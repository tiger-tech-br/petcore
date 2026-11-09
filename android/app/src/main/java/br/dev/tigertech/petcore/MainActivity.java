package br.dev.tigertech.petcore;

import android.annotation.SuppressLint;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Insets;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.Message;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.SslErrorHandler;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;
import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.io.OutputStream;
import java.util.Arrays;
import java.util.Collections;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

public final class MainActivity extends ComponentActivity {
    private static final int NAVY = Color.rgb(7, 20, 73), TEAL = Color.rgb(0, 156, 166);
    private static final int SURFACE = Color.rgb(242, 251, 251), MUTED = Color.rgb(102, 117, 148);
    private static final String BACK_SCRIPT = "(()=>{const d=document.querySelector('dialog[open]');if(d){if(typeof d.requestClose==='function'){d.requestClose();}else{const e=new Event('cancel',{cancelable:true});if(d.dispatchEvent(e))d.close();}return true;}return !window.dispatchEvent(new Event('petcore-native-back',{cancelable:true}));})()";
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private WebView web;
    private FrameLayout root;
    private LinearLayout panel;
    private TextView title, description;
    private ProgressBar progress;
    private Button retry, browser;
    private ValueCallback<Uri[]> photoCallback;
    private JavaScriptReplyProxy pendingReply;
    private PendingExport pendingExport;
    private boolean exportBusy, writing, pageFailed, bridgeAvailable;
    private volatile boolean closed;
    private int generation;

    private final ActivityResultLauncher<String[]> choosePhoto = registerForActivityResult(
        new ActivityResultContracts.OpenDocument(), uri -> {
            ValueCallback<Uri[]> callback = photoCallback; photoCallback = null;
            if (callback == null) return;
            if (closed || uri == null || !"content".equals(uri.getScheme())) { callback.onReceiveValue(null); return; }
            String mime = getContentResolver().getType(uri);
            if (!Arrays.asList("image/jpeg", "image/png", "image/webp").contains(mime)) {
                callback.onReceiveValue(null); toast("Escolha uma imagem JPEG, PNG ou WebP."); return;
            }
            callback.onReceiveValue(new Uri[]{uri});
        });

    private final ActivityResultLauncher<Intent> chooseDestination = registerForActivityResult(
        new ActivityResultContracts.StartActivityForResult(), result -> {
            if (closed || pendingExport == null) return;
            Uri destination = result.getData() == null ? null : result.getData().getData();
            if (result.getResultCode() != RESULT_OK || destination == null) {
                finishExport("cancelled", "O arquivo não foi salvo."); return;
            }
            if (!"content".equals(destination.getScheme())) { finishExport("error", "Escolha um destino válido para o arquivo."); return; }
            PendingExport chosen = pendingExport; JavaScriptReplyProxy reply = pendingReply;
            pendingExport = null; pendingReply = null; writing = true;
            io.execute(() -> {
                boolean saved = false;
                try (OutputStream output = getApplicationContext().getContentResolver().openOutputStream(destination, "wt")) {
                    if (output == null) throw new java.io.IOException();
                    output.write(chosen.bytes); output.flush(); saved = true;
                } catch (Exception ignored) { /* Never expose a provider URI or document contents. */ }
                finally { Arrays.fill(chosen.bytes, (byte)0); }
                final boolean success = saved;
                ui.post(() -> {
                    writing = false; exportBusy = false;
                    if (!closed) respond(reply, success ? "saved" : "error", success ? "Arquivo salvo." : "Não foi possível salvar. Tente novamente.");
                });
            });
        });

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        buildLayout(); configureWeb(); configureInsets();
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                if (closed) return;
                if (!UrlPolicy.isAppUrl(web.getUrl())) { finish(); return; }
                web.evaluateJavascript(BACK_SCRIPT, consumed -> {
                    if (closed || "true".equals(consumed)) return;
                    if (web.canGoBack()) web.goBack(); else finish();
                });
            }
        });
        loadHome();
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private TextView text(String value, int size, int color, boolean bold) {
        TextView view = new TextView(this); view.setText(value); view.setTextSize(size); view.setTextColor(color);
        view.setGravity(Gravity.CENTER); view.setLineSpacing(dp(3), 1.05f);
        if (bold) view.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return view;
    }
    private Button button(String value, boolean primary) {
        Button view = new Button(this); view.setText(value); view.setTextSize(16); view.setAllCaps(false);
        view.setTextColor(primary ? Color.WHITE : TEAL); view.setMinHeight(dp(52));
        GradientDrawable background = new GradientDrawable(); background.setColor(primary ? TEAL : Color.WHITE);
        background.setCornerRadius(dp(14)); if (!primary) background.setStroke(dp(1), TEAL);
        view.setBackground(new RippleDrawable(ColorStateList.valueOf(0x26009CA6), background, null));
        return view;
    }
    private void addPanel(View child, int width, int height, int top) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(width, height); params.topMargin = dp(top); panel.addView(child, params);
    }
    private void buildLayout() {
        root = new FrameLayout(this); root.setBackgroundColor(SURFACE);
        web = new WebView(this); web.setBackgroundColor(SURFACE); root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        panel = new LinearLayout(this); panel.setOrientation(LinearLayout.VERTICAL); panel.setGravity(Gravity.CENTER);
        panel.setPadding(dp(28), dp(24), dp(28), dp(24)); panel.setBackgroundColor(SURFACE);
        root.addView(panel, new FrameLayout.LayoutParams(-1, -1));
        ImageView mark = new ImageView(this); mark.setImageResource(R.drawable.ic_brand); mark.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        addPanel(mark, dp(76), dp(84), 0);
        addPanel(text("PetCore", 30, NAVY, true), -1, -2, 14);
        title = text("Preparando seu painel", 22, NAVY, true); addPanel(title, -1, -2, 24);
        description = text("Organização para cuidar melhor de cada pet.", 16, MUTED, false); addPanel(description, -1, -2, 10);
        progress = new ProgressBar(this); progress.setIndeterminateTintList(ColorStateList.valueOf(TEAL)); addPanel(progress, dp(32), dp(32), 24);
        retry = button("Tentar novamente", true); addPanel(retry, -1, dp(52), 24); retry.setOnClickListener(view -> loadHome());
        browser = button("Abrir no navegador", false); addPanel(browser, -1, dp(52), 12); browser.setOnClickListener(view -> openExternal(UrlPolicy.HOME, true));
        setContentView(root);
    }

    @SuppressWarnings("deprecation") private void configureInsets() {
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) controller.setSystemBarsAppearance(WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS, WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS);
        } else getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                Insets safe = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                view.setPadding(safe.left, safe.top, safe.right, safe.bottom);
            } else view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets;
        });
        root.requestApplyInsets();
    }

    @SuppressLint("SetJavaScriptEnabled") private void configureWeb() {
        WebView.setWebContentsDebuggingEnabled(false);
        WebSettings settings = web.getSettings(); settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false); settings.setAllowContentAccess(false); settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSafeBrowsingEnabled(true); settings.setGeolocationEnabled(false); settings.setSupportMultipleWindows(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(false); settings.setBuiltInZoomControls(true); settings.setDisplayZoomControls(false);
        settings.setTextZoom(Math.max(100, Math.round(getResources().getConfiguration().fontScale * 100)));
        settings.setUserAgentString(settings.getUserAgentString() + " PetCoreAndroid/1.0");
        CookieManager.getInstance().setAcceptCookie(true); CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (!request.isForMainFrame()) return !UrlPolicy.isAppUrl(url);
                if (UrlPolicy.isAppUrl(url)) return false;
                if (request.hasGesture()) openExternal(url, false);
                return true;
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (!"https".equalsIgnoreCase(request.getUrl().getScheme()) || (request.isForMainFrame() && !UrlPolicy.isAppUrl(url)))
                    return new WebResourceResponse("text/plain", "UTF-8", new ByteArrayInputStream(new byte[0]));
                return null;
            }
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) { clearPendingExport(true); pageFailed = false; showLoading(); }
            @Override public void onPageFinished(WebView view, String url) { if (!closed && !pageFailed && UrlPolicy.isAppUrl(url)) { ui.removeCallbacks(loadTimeout); panel.setVisibility(View.GONE); } }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) { if (request.isForMainFrame()) showFailure("Não foi possível conectar", "Confira sua conexão e tente novamente. Seus dados continuam no PetCore."); }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) { if (request.isForMainFrame()) showFailure("Seu painel está indisponível", "Tente novamente em alguns instantes ou abra pelo navegador."); }
            @Override public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) { handler.cancel(); showFailure("Conexão protegida indisponível", "Não foi possível confirmar a segurança da conexão. Tente novamente mais tarde."); }
            @Override public void onReceivedHttpAuthRequest(WebView view, android.webkit.HttpAuthHandler handler, String host, String realm) { handler.cancel(); }
            @Override public void onReceivedClientCertRequest(WebView view, android.webkit.ClientCertRequest request) { request.cancel(); }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (photoCallback != null) photoCallback.onReceiveValue(null);
                photoCallback = callback;
                try { choosePhoto.launch(new String[]{"image/jpeg", "image/png", "image/webp"}); }
                catch (RuntimeException exception) { photoCallback = null; callback.onReceiveValue(null); toast("Não foi possível abrir suas imagens."); }
                return true;
            }
            @Override public void onPermissionRequest(PermissionRequest request) { request.deny(); }
            @Override public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) { callback.invoke(origin, false, false); }
            @Override public boolean onCreateWindow(WebView view, boolean dialog, boolean gesture, Message message) { return openPopup(view, gesture, message); }
        });
        web.setDownloadListener((url, agent, disposition, mime, length) -> toast("Use o botão Exportar do PetCore para escolher onde salvar o arquivo."));
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(web, "PetCoreNative", Collections.singleton(UrlPolicy.ORIGIN), this::receiveExport);
            bridgeAvailable = true;
        }
    }

    private final Runnable loadTimeout = () -> { if (!closed && panel.getVisibility() == View.VISIBLE && !pageFailed) showFailure("A conexão está demorando", "Confira sua internet e tente novamente."); };
    private void showLoading() {
        if (closed) return;
        title.setText("Preparando seu painel"); description.setText("Organização para cuidar melhor de cada pet."); progress.setVisibility(View.VISIBLE);
        retry.setVisibility(View.GONE); browser.setVisibility(View.GONE); panel.setVisibility(View.VISIBLE);
        ui.removeCallbacks(loadTimeout); ui.postDelayed(loadTimeout, 45000);
    }
    private void showFailure(String heading, String message) {
        if (closed) return;
        pageFailed = true; ui.removeCallbacks(loadTimeout); title.setText(heading); description.setText(message);
        progress.setVisibility(View.GONE); retry.setVisibility(View.VISIBLE); browser.setVisibility(View.VISIBLE); panel.setVisibility(View.VISIBLE);
    }
    private void loadHome() {
        if (closed) return;
        if (!bridgeAvailable) { showFailure("Atualize o componente de navegação", "Atualize o Android System WebView ou o Chrome. Você também pode abrir o PetCore no navegador."); return; }
        ConnectivityManager manager = (ConnectivityManager)getSystemService(CONNECTIVITY_SERVICE);
        NetworkCapabilities network = manager == null ? null : manager.getNetworkCapabilities(manager.getActiveNetwork());
        if (network == null || !network.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) { showFailure("Você está sem conexão", "Conecte-se ao Wi-Fi ou aos dados móveis para acessar seu pet shop."); return; }
        pageFailed = false; web.stopLoading(); showLoading(); web.loadUrl(UrlPolicy.HOME);
    }

    private void openExternal(String url, boolean allowHome) {
        if (closed) return;
        if (!(UrlPolicy.isExternalHttps(url) || UrlPolicy.isMailto(url) || (allowHome && UrlPolicy.isAppUrl(url)))) { toast("Este link não pode ser aberto no aplicativo."); return; }
        try { startActivity(new Intent(UrlPolicy.isMailto(url) ? Intent.ACTION_SENDTO : Intent.ACTION_VIEW, Uri.parse(url)).addCategory(Intent.CATEGORY_BROWSABLE)); }
        catch (ActivityNotFoundException exception) { toast("Nenhum aplicativo disponível para abrir esse link."); }
    }

    @SuppressLint("SetJavaScriptEnabled") private boolean openPopup(WebView parent, boolean userGesture, Message message) {
        if (!userGesture || closed) return false;
        String hit = parent.getHitTestResult() == null ? null : parent.getHitTestResult().getExtra();
        if (hit != null && (UrlPolicy.isAppUrl(hit) || UrlPolicy.isExternalHttps(hit) || UrlPolicy.isMailto(hit))) {
            if (UrlPolicy.isAppUrl(hit)) web.loadUrl(hit); else openExternal(hit, false);
            return false;
        }
        WebView popup = new WebView(this); popup.getSettings().setJavaScriptEnabled(false); popup.getSettings().setBlockNetworkLoads(true);
        popup.getSettings().setAllowFileAccess(false); popup.getSettings().setAllowContentAccess(false);
        AtomicBoolean handled = new AtomicBoolean(false);
        java.util.function.Consumer<String> consume = url -> {
            if ("about:blank".equals(url) || !handled.compareAndSet(false, true)) return;
            popup.stopLoading(); if (UrlPolicy.isAppUrl(url)) web.loadUrl(url); else openExternal(url, false); popup.destroy();
        };
        popup.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { consume.accept(request.getUrl().toString()); return true; }
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) { consume.accept(url); }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) { if (request.isForMainFrame()) consume.accept(request.getUrl().toString()); }
        });
        if (!(message.obj instanceof WebView.WebViewTransport)) { popup.destroy(); return false; }
        ((WebView.WebViewTransport)message.obj).setWebView(popup); message.sendToTarget();
        ui.postDelayed(() -> { if (handled.compareAndSet(false, true)) popup.destroy(); }, 10000);
        return true;
    }

    private static final class PendingExport {
        final String filename, mime; final byte[] bytes;
        PendingExport(String filename, String mime, byte[] bytes) { this.filename = filename; this.mime = mime; this.bytes = bytes; }
    }
    private void receiveExport(WebView view, WebMessageCompat message, Uri origin, boolean mainFrame, JavaScriptReplyProxy reply) {
        if (closed || !mainFrame || !UrlPolicy.isTrustedOrigin(origin.toString())) return;
        if (exportBusy) { respond(reply, "error", "Conclua ou cancele a exportação aberta antes de iniciar outra."); return; }
        if (message.getType() != WebMessageCompat.TYPE_STRING || message.getData() == null) { respond(reply, "error", "Solicitação de exportação inválida."); return; }
        String raw = message.getData(); exportBusy = true; pendingReply = reply; final int requestGeneration = ++generation;
        io.execute(() -> {
            PendingExport parsed = null; String failure = null;
            try {
                byte[] envelope = ExportPolicy.utf8(raw); Arrays.fill(envelope, (byte)0);
                JSONObject payload = new JSONObject(raw);
                if (payload.length() != 4) throw new IllegalArgumentException("Solicitação de exportação inválida.");
                for (String key : new String[]{"type", "filename", "mime", "content"}) if (!(payload.opt(key) instanceof String)) throw new IllegalArgumentException("Solicitação de exportação inválida.");
                if (!"saveFile".equals(payload.getString("type"))) throw new IllegalArgumentException("Solicitação de exportação inválida.");
                String mime = payload.getString("mime");
                parsed = new PendingExport(ExportPolicy.filename(payload.getString("filename"), mime), mime, ExportPolicy.utf8(payload.getString("content")));
            } catch (IllegalArgumentException exception) { failure = exception.getMessage(); }
            catch (Exception ignored) { failure = "Solicitação de exportação inválida."; }
            PendingExport result = parsed; String problem = failure;
            ui.post(() -> {
                if (closed || requestGeneration != generation) { if (result != null) Arrays.fill(result.bytes, (byte)0); return; }
                if (result == null) { finishExport("error", problem == null ? "Não foi possível preparar o arquivo." : problem); return; }
                pendingExport = result;
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(result.mime).putExtra(Intent.EXTRA_TITLE, result.filename);
                try { chooseDestination.launch(intent); } catch (RuntimeException exception) { finishExport("error", "Não foi possível abrir o destino do arquivo."); }
            });
        });
    }
    private void respond(JavaScriptReplyProxy reply, String status, String message) {
        if (closed || reply == null) return;
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return;
        try { reply.postMessage(new JSONObject().put("type", "saveFileResult").put("status", status).put("message", message).toString()); }
        catch (Exception ignored) { /* The originating page may have closed. */ }
    }
    private void finishExport(String status, String message) {
        JavaScriptReplyProxy reply = pendingReply;
        if (pendingExport != null) Arrays.fill(pendingExport.bytes, (byte)0);
        pendingExport = null; pendingReply = null; exportBusy = false; respond(reply, status, message);
    }
    private void clearPendingExport(boolean notify) {
        generation++; JavaScriptReplyProxy reply = pendingReply;
        if (pendingExport != null) Arrays.fill(pendingExport.bytes, (byte)0);
        pendingExport = null; pendingReply = null; exportBusy = writing;
        if (notify) respond(reply, "cancelled", "A exportação foi cancelada ao sair da página.");
    }
    private void toast(String message) { if (!closed) Toast.makeText(this, message, Toast.LENGTH_LONG).show(); }
    @Override protected void onPause() { CookieManager.getInstance().flush(); super.onPause(); }
    @Override protected void onDestroy() {
        closed = true; clearPendingExport(false); ui.removeCallbacksAndMessages(null);
        if (photoCallback != null) { photoCallback.onReceiveValue(null); photoCallback = null; }
        if (web != null) {
            if (bridgeAvailable && WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) WebViewCompat.removeWebMessageListener(web, "PetCoreNative");
            web.stopLoading(); web.setWebChromeClient(null); web.setWebViewClient(new WebViewClient()); web.destroy();
        }
        io.shutdown(); super.onDestroy();
    }
}
