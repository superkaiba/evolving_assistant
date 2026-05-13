package dev.evolvingassistant.shell;

import android.app.Activity;
import android.os.Bundle;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {
    private static final String PREFS = "assistant-shell";
    private static final String RUNTIME_URL = "runtime-url";

    private EditText urlInput;
    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        SharedPreferences preferences = getSharedPreferences(PREFS, MODE_PRIVATE);
        String defaultUrl = getString(getResources().getIdentifier("assistant_runtime_url", "string", getPackageName()));
        String runtimeUrl = preferences.getString(RUNTIME_URL, defaultUrl);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setLayoutParams(new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));

        LinearLayout toolbar = new LinearLayout(this);
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.setOrientation(LinearLayout.HORIZONTAL);
        toolbar.setPadding(10, 10, 10, 8);
        toolbar.setBackgroundColor(Color.rgb(246, 244, 238));

        urlInput = new EditText(this);
        urlInput.setSingleLine(true);
        urlInput.setText(runtimeUrl);
        toolbar.addView(urlInput, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        Button openButton = new Button(this);
        openButton.setText("Open");
        openButton.setOnClickListener(view -> openRuntimeUrl());
        toolbar.addView(openButton);

        Button reloadButton = new Button(this);
        reloadButton.setText("Reload");
        reloadButton.setOnClickListener(view -> webView.reload());
        toolbar.addView(reloadButton);

        webView = new WebView(this);
        webView.setLayoutParams(new ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);

        webView.setWebViewClient(new WebViewClient());
        root.addView(toolbar);
        root.addView(webView, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            0,
            1f
        ));
        setContentView(root);
        openRuntimeUrl();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.reload();
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        super.onBackPressed();
    }

    private void openRuntimeUrl() {
        String url = urlInput.getText().toString().trim();
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            url = "http://" + url;
            urlInput.setText(url);
        }
        getSharedPreferences(PREFS, MODE_PRIVATE)
            .edit()
            .putString(RUNTIME_URL, url)
            .apply();
        webView.loadUrl(url);
    }
}
