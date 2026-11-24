package br.com.olifinancas.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.DialogInterface;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.JsPromptResult;
import android.webkit.JsResult;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends Activity {

    private static final String APP_URL = "https://brunocaio.github.io/OliFinancas/";
    private static final int FILE_CHOOSER_REQUEST_CODE = 1001;

    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private volatile String pendingFilesJson = null;
    private volatile boolean pageLoaded = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        if (window != null) {
            window.setStatusBarColor(Color.parseColor("#4d7c0f"));
        }

        handleIncomingIntent(getIntent());

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        webView.addJavascriptInterface(new AndroidBridge(), "AndroidBridge");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (url == null) return false;
                String host = url.getHost() != null ? url.getHost().toLowerCase() : "";
                if (host.contains("brunocaio.github.io") || host.contains("supabase.co")) {
                    return false;
                }
                try {
                    Intent external = new Intent(Intent.ACTION_VIEW, url);
                    startActivity(external);
                    return true;
                } catch (Exception ignored) {
                    return false;
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                pageLoaded = true;
                notifyJsBridgeIfPending();
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(
                    WebView webView,
                    ValueCallback<Uri[]> filePathCallback,
                    FileChooserParams fileChooserParams
            ) {
                if (MainActivity.this.filePathCallback != null) {
                    MainActivity.this.filePathCallback.onReceiveValue(null);
                }
                MainActivity.this.filePathCallback = filePathCallback;

                Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                if (fileChooserParams != null && fileChooserParams.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) {
                    intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                }
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);

                try {
                    startActivityForResult(Intent.createChooser(intent, "Selecionar Extratos"), FILE_CHOOSER_REQUEST_CODE);
                } catch (Exception e) {
                    MainActivity.this.filePathCallback = null;
                    return false;
                }
                return true;
            }

            @Override
            public boolean onJsAlert(WebView view, String url, String message, final JsResult result) {
                new AlertDialog.Builder(MainActivity.this)
                        .setTitle("OliFinanças")
                        .setMessage(message)
                        .setPositiveButton("OK", new DialogInterface.OnClickListener() {
                            @Override
                            public void onClick(DialogInterface dialog, int which) {
                                result.confirm();
                            }
                        })
                        .setOnCancelListener(new DialogInterface.OnCancelListener() {
                            @Override
                            public void onCancel(DialogInterface dialog) {
                                result.cancel();
                            }
                        })
                        .show();
                return true;
            }

            @Override
            public boolean onJsConfirm(WebView view, String url, String message, final JsResult result) {
                new AlertDialog.Builder(MainActivity.this)
                        .setTitle("OliFinanças")
                        .setMessage(message)
                        .setPositiveButton("Confirmar", new DialogInterface.OnClickListener() {
                            @Override
                            public void onClick(DialogInterface dialog, int which) {
                                result.confirm();
                            }
                        })
                        .setNegativeButton("Cancelar", new DialogInterface.OnClickListener() {
                            @Override
                            public void onClick(DialogInterface dialog, int which) {
                                result.cancel();
                            }
                        })
                        .setOnCancelListener(new DialogInterface.OnCancelListener() {
                            @Override
                            public void onCancel(DialogInterface dialog) {
                                result.cancel();
                            }
                        })
                        .show();
                return true;
            }

            @Override
            public boolean onJsPrompt(WebView view, String url, String message, String defaultValue, final JsPromptResult result) {
                final EditText input = new EditText(MainActivity.this);
                if (defaultValue != null) {
                    input.setText(defaultValue);
                    input.setSelection(defaultValue.length());
                }
                new AlertDialog.Builder(MainActivity.this)
                        .setTitle("OliFinanças")
                        .setMessage(message)
                        .setView(input)
                        .setPositiveButton("OK", new DialogInterface.OnClickListener() {
                            @Override
                            public void onClick(DialogInterface dialog, int which) {
                                result.confirm(input.getText().toString());
                            }
                        })
                        .setNegativeButton("Cancelar", new DialogInterface.OnClickListener() {
                            @Override
                            public void onClick(DialogInterface dialog, int which) {
                                result.cancel();
                            }
                        })
                        .setOnCancelListener(new DialogInterface.OnCancelListener() {
                            @Override
                            public void onCancel(DialogInterface dialog) {
                                result.cancel();
                            }
                        })
                        .show();
                return true;
            }
        });

        webView.loadUrl(APP_URL);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIncomingIntent(intent);
        if (pageLoaded) {
            notifyJsBridgeIfPending();
        }
    }

    private void notifyJsBridgeIfPending() {
        if (pendingFilesJson == null || webView == null) return;
        webView.post(new Runnable() {
            @Override
            public void run() {
                webView.evaluateJavascript(
                        "if(window.App && window.App.consumeAndroidBridgeFiles) window.App.consumeAndroidBridgeFiles();",
                        null
                );
            }
        });
    }

    @SuppressWarnings("deprecation")
    private void handleIncomingIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (action == null) return;

        List<Uri> uris = new ArrayList<>();
        if (Intent.ACTION_VIEW.equals(action)) {
            Uri data = intent.getData();
            if (data != null) uris.add(data);
        } else if (Intent.ACTION_SEND.equals(action)) {
            Uri stream = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (stream != null) {
                uris.add(stream);
            } else if (intent.getClipData() != null && intent.getClipData().getItemCount() > 0) {
                Uri clipUri = intent.getClipData().getItemAt(0).getUri();
                if (clipUri != null) uris.add(clipUri);
            }
        } else if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            ArrayList<Uri> streams = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (streams != null) {
                uris.addAll(streams);
            } else if (intent.getClipData() != null) {
                ClipData clip = intent.getClipData();
                for (int i = 0; i < clip.getItemCount(); i++) {
                    Uri u = clip.getItemAt(i).getUri();
                    if (u != null) uris.add(u);
                }
            }
        }

        if (uris.isEmpty()) return;

        try {
            ContentResolver resolver = getContentResolver();
            JSONArray jsonArray = new JSONArray();
            for (int i = 0; i < uris.size(); i++) {
                Uri uri = uris.get(i);
                byte[] bytes = readUriBytes(resolver, uri);
                if (bytes == null || bytes.length == 0) continue;

                String mime = resolver.getType(uri);
                if (mime == null || mime.trim().isEmpty()) {
                    mime = intent.getType() != null ? intent.getType() : "application/octet-stream";
                }
                String fileName = resolveFileName(resolver, uri, mime, i);

                JSONObject obj = new JSONObject();
                obj.put("name", fileName);
                obj.put("mime", mime);
                obj.put("base64", Base64.encodeToString(bytes, Base64.NO_WRAP));
                jsonArray.put(obj);
            }

            if (jsonArray.length() > 0) {
                pendingFilesJson = jsonArray.toString();
            }
        } catch (Exception ignored) {
        }
    }

    private String resolveFileName(ContentResolver resolver, Uri uri, String mime, int index) {
        String name = null;
        if ("content".equalsIgnoreCase(uri.getScheme())) {
            Cursor cursor = null;
            try {
                cursor = resolver.query(uri, null, null, null, null);
                if (cursor != null && cursor.moveToFirst()) {
                    int idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                    if (idx >= 0) {
                        name = cursor.getString(idx);
                    }
                }
            } catch (Exception ignored) {
            } finally {
                if (cursor != null) cursor.close();
            }
        }

        if (name == null || name.trim().isEmpty()) {
            String seg = uri.getLastPathSegment();
            if (seg != null && (seg.toLowerCase().endsWith(".ofx") || seg.toLowerCase().endsWith(".csv") || seg.toLowerCase().endsWith(".pdf"))) {
                name = seg;
            }
        }

        if (name == null || name.trim().isEmpty()) {
            String ext = ".ofx";
            if (mime != null) {
                String m = mime.toLowerCase();
                if (m.contains("pdf")) ext = ".pdf";
                else if (m.contains("csv")) ext = ".csv";
            }
            name = "extrato_" + (index + 1) + ext;
        }
        return name;
    }

    private byte[] readUriBytes(ContentResolver resolver, Uri uri) {
        InputStream in = null;
        try {
            in = resolver.openInputStream(uri);
            if (in == null) return null;
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] chunk = new byte[16384];
            int nRead;
            int total = 0;
            int maxBytes = 25 * 1024 * 1024;
            while ((nRead = in.read(chunk, 0, chunk.length)) != -1) {
                total += nRead;
                if (total > maxBytes) break;
                buffer.write(chunk, 0, nRead);
            }
            return buffer.toByteArray();
        } catch (Exception e) {
            return null;
        } finally {
            if (in != null) {
                try {
                    in.close();
                } catch (Exception ignored) {
                }
            }
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_CHOOSER_REQUEST_CODE) {
            if (filePathCallback == null) return;
            Uri[] results = null;
            if (resultCode == Activity.RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    ClipData clipData = data.getClipData();
                    results = new Uri[clipData.getItemCount()];
                    for (int i = 0; i < clipData.getItemCount(); i++) {
                        results[i] = clipData.getItemAt(i).getUri();
                    }
                } else if (data.getData() != null) {
                    results = new Uri[]{data.getData()};
                }
            }
            filePathCallback.onReceiveValue(results);
            filePathCallback = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    public class AndroidBridge {
        @JavascriptInterface
        public synchronized String consumePendingFilesJson() {
            String data = pendingFilesJson;
            pendingFilesJson = null;
            return data;
        }
    }
}
