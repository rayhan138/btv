package com.btvhd.live;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {

    private WebView webView;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Fullscreen immersive
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_FULLSCREEN,
            WindowManager.LayoutParams.FLAG_FULLSCREEN
        );
        getWindow().setStatusBarColor(Color.BLACK);
        getWindow().setNavigationBarColor(Color.BLACK);
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
        );

        // Keep screen on while watching
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        // Create WebView
        webView = new WebView(this);
        setContentView(webView);

        // Configure WebView
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setUserAgentString("Mozilla/5.0 (Linux; Android " + Build.VERSION.RELEASE + ") AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (url.contains("streams.btvlive.gov.bd")) {
                    try {
                        java.net.HttpURLConnection conn = (java.net.HttpURLConnection) new java.net.URL(url).openConnection();
                        conn.setRequestMethod(request.getMethod());
                        for (java.util.Map.Entry<String, String> header : request.getRequestHeaders().entrySet()) {
                            conn.setRequestProperty(header.getKey(), header.getValue());
                        }
                        
                        java.io.InputStream is = conn.getInputStream();
                        
                        java.util.Map<String, String> responseHeaders = new java.util.HashMap<>();
                        for (java.util.Map.Entry<String, java.util.List<String>> header : conn.getHeaderFields().entrySet()) {
                            if (header.getKey() != null) {
                                String value = header.getValue().get(0);
                                if (header.getKey().equalsIgnoreCase("access-control-allow-origin")) {
                                    value = "*"; // Fix the invalid header
                                }
                                responseHeaders.put(header.getKey(), value);
                            }
                        }
                        
                        String contentType = conn.getContentType();
                        String mimeType = "application/octet-stream";
                        String encoding = "utf-8";
                        if (contentType != null) {
                            if (contentType.contains(";")) {
                                String[] parts = contentType.split(";");
                                mimeType = parts[0].trim();
                                for (int i = 1; i < parts.length; i++) {
                                    if (parts[i].trim().toLowerCase().startsWith("charset=")) {
                                        encoding = parts[i].split("=")[1].trim();
                                    }
                                }
                            } else {
                                mimeType = contentType.trim();
                            }
                        }

                        return new WebResourceResponse(mimeType, encoding, conn.getResponseCode(), conn.getResponseMessage(), responseHeaders, is);
                    } catch (Exception e) {
                        e.printStackTrace();
                        return null;
                    }
                }
                return super.shouldInterceptRequest(view, request);
            }
        });
        
        webView.setWebChromeClient(new WebChromeClient());
        webView.setBackgroundColor(Color.BLACK);

        // Load the app from assets
        webView.loadUrl("file:///android_asset/index.html");
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        webView.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
    }

    @Override
    protected void onDestroy() {
        webView.destroy();
        super.onDestroy();
    }
}
