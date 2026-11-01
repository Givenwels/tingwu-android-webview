package com.tingwu.mobile

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.net.http.SslError
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.Message
import android.view.View
import android.webkit.CookieManager
import android.webkit.PermissionRequest
import android.webkit.SslErrorHandler
import android.webkit.WebChromeClient
import android.webkit.WebMessage
import android.webkit.WebMessagePort
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.tingwu.mobile.databinding.ActivityRecordingBinding
import org.json.JSONObject

class RecordingActivity : AppCompatActivity() {
    private lateinit var binding: ActivityRecordingBinding
    private val handler = Handler(Looper.getMainLooper())
    private var channel: WebMessagePort? = null
    private var pendingMicrophone: PermissionRequest? = null
    private var microphonePermissionInFlight = false
    private var pageReady = false
    private var enteredRecording = false
    private var capturing = false
    private val script by lazy {
        assets.open("recorder-mobile.js").bufferedReader().use { it.readText() }
    }
    private val loadTimeout = Runnable {
        if (!pageReady && !isFinishing) showError()
    }
    private val microphoneLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            microphonePermissionInFlight = false
            val request = pendingMicrophone
            pendingMicrophone = null
            if (isFinishing || isDestroyed) {
                request?.deny()
            } else if (!granted) {
                request?.deny()
                showMicrophoneError()
            } else if (request != null) {
                if (trustedRequest(request)) request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
                else request.deny()
                if (pageReady) binding.recordingLoadingPanel.visibility = View.GONE
            } else {
                // The official page caches its first microphone preflight result. Load it only
                // after Android grants access, rather than leaving a cached rejection in the page.
                loadWorkspace()
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityRecordingBinding.inflate(layoutInflater)
        setContentView(binding.root)
        ViewCompat.setOnApplyWindowInsetsListener(binding.root) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }
        binding.recordingBackButton.setOnClickListener { requestBack() }
        binding.recordingRetryButton.setOnClickListener { loadWorkspace() }
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() = requestBack()
        })
        configureWebView()
        loadWorkspace()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        with(binding.recordingWebView.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            builtInZoomControls = false
            setSupportMultipleWindows(true)
            javaScriptCanOpenWindowsAutomatically = true
            allowFileAccess = false
            allowContentAccess = true
            safeBrowsingEnabled = true
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        }
        // Desktop capabilities belong only to this recording surface, not the mobile homepage.
        DesktopWebViewSettings.apply(binding.recordingWebView.settings, desktopViewport = false)
        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(binding.recordingWebView, true)
        }
        binding.recordingWebView.webViewClient = RecordingWebViewClient()
        binding.recordingWebView.webChromeClient = RecordingChromeClient()
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(
                binding.recordingWebView,
                "TingwuRecorder",
                setOf("https://tingwu.aliyun.com"),
            ) { view, message, origin, isMainFrame, _ ->
                if (isMainFrame && UrlPolicy.isTrustedRecordingOrigin(origin.toString()) &&
                    UrlPolicy.isTrustedRecordingOrigin(view.url.orEmpty())
                ) handleMessage(message.data)
            }
        }
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            WebViewCompat.addDocumentStartJavaScript(
                binding.recordingWebView,
                script,
                setOf("https://tingwu.aliyun.com"),
            )
        }
    }

    private fun loadWorkspace() {
        if (capturing) return
        if (!hasMicrophonePermission()) {
            handler.removeCallbacks(loadTimeout)
            binding.recordingLoadingPanel.visibility = View.VISIBLE
            binding.recordingSpinner.visibility = View.GONE
            binding.recordingRetryButton.visibility = View.GONE
            binding.recordingStatus.setText(R.string.recording_microphone_required)
            requestMicrophonePermission()
            return
        }
        enteredRecording = false
        showLoading()
        binding.recordingWebView.loadUrl("https://tingwu.aliyun.com/home")
    }

    private fun hasMicrophonePermission(): Boolean =
        ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

    private fun requestMicrophonePermission() {
        if (microphonePermissionInFlight || isFinishing || isDestroyed) return
        microphonePermissionInFlight = true
        microphoneLauncher.launch(Manifest.permission.RECORD_AUDIO)
    }

    private fun showMicrophoneError() {
        handler.removeCallbacks(loadTimeout)
        binding.recordingLoadingPanel.visibility = View.VISIBLE
        binding.recordingSpinner.visibility = View.GONE
        binding.recordingStatus.setText(R.string.recording_microphone_denied)
        binding.recordingRetryButton.visibility = View.VISIBLE
    }

    private fun showLoading() {
        pageReady = false
        binding.recordingLoadingPanel.visibility = View.VISIBLE
        binding.recordingSpinner.visibility = View.VISIBLE
        binding.recordingRetryButton.visibility = View.GONE
        binding.recordingStatus.setText(R.string.recording_preparing)
        handler.removeCallbacks(loadTimeout)
        handler.postDelayed(loadTimeout, 40_000L)
    }

    private fun showError() {
        handler.removeCallbacks(loadTimeout)
        binding.recordingLoadingPanel.visibility = View.VISIBLE
        binding.recordingSpinner.visibility = View.GONE
        binding.recordingStatus.setText(R.string.recording_load_error)
        binding.recordingRetryButton.visibility = View.VISIBLE
    }

    private fun handleMessage(data: String?) {
        if (isFinishing || isDestroyed || data == null || data.length > 2048) return
        val message = runCatching { JSONObject(data) }.getOrNull() ?: return
        when (message.optString("type")) {
            "ready" -> {
                pageReady = true
                if (message.optString("stage") == "recording") enteredRecording = true
                handler.removeCallbacks(loadTimeout)
                if (hasMicrophonePermission()) binding.recordingLoadingPanel.visibility = View.GONE
            }
            "capture" -> {
                capturing = message.optBoolean("active", false)
                binding.recordingWebView.keepScreenOn = capturing
                if (!capturing) completeIfReturned(binding.recordingWebView.url.orEmpty())
            }
            "completed" -> if (!capturing) {
                setResult(RESULT_OK)
                finish()
            }
            "dismissed" -> if (!capturing) finish()
            "back-unavailable" ->
                Toast.makeText(this, R.string.recording_finish_first, Toast.LENGTH_LONG).show()
        }
    }

    private fun completeIfReturned(url: String): Boolean {
        if (!enteredRecording || capturing || !UrlPolicy.isRecordingCompletionUrl(url)) return false
        if (!isFinishing && !isDestroyed) {
            binding.recordingLoadingPanel.visibility = View.VISIBLE
            setResult(RESULT_OK)
            finish()
        }
        return true
    }

    private fun requestBack() {
        if (!enteredRecording && !capturing) {
            finish()
        } else if (channel != null) {
            channel?.postMessage(WebMessage("request-exit"))
        } else {
            binding.recordingWebView.evaluateJavascript(
                "window.postMessage('tingwu-recorder-exit', location.origin);",
                null,
            )
        }
    }

    private fun trustedRequest(request: PermissionRequest): Boolean =
        UrlPolicy.isTrustedRecordingOrigin(request.origin.toString()) &&
            UrlPolicy.isTrustedRecordingOrigin(binding.recordingWebView.url.orEmpty()) &&
            PermissionRequest.RESOURCE_AUDIO_CAPTURE in request.resources

    private fun connectChannel(view: WebView, url: String) {
        if (!UrlPolicy.isTrustedRecordingOrigin(url)) return
        channel?.close()
        val ports = view.createWebMessageChannel()
        val nativePort = ports[0]
        channel = nativePort
        nativePort.setWebMessageCallback(object : WebMessagePort.WebMessageCallback() {
            override fun onMessage(port: WebMessagePort, message: WebMessage) {
                if (port === channel && UrlPolicy.isTrustedRecordingOrigin(view.url.orEmpty())) {
                    handleMessage(message.data)
                }
            }
        })
        view.evaluateJavascript(script) {
            if (channel === nativePort && UrlPolicy.isTrustedRecordingOrigin(view.url.orEmpty())) {
                view.postWebMessage(
                    WebMessage("tingwu-recorder", arrayOf(ports[1])),
                    Uri.parse("https://tingwu.aliyun.com"),
                )
            } else ports[1].close()
        }
    }

    private fun navigate(url: String): Boolean {
        if (UrlPolicy.shouldStayInWebView(url)) return false
        if (!UrlPolicy.shouldOpenExternally(url)) return true
        val intent = runCatching {
            if (url.startsWith("intent:", ignoreCase = true)) {
                Intent.parseUri(url, Intent.URI_INTENT_SCHEME).apply {
                    component = null
                    selector = null
                }
            } else Intent(Intent.ACTION_VIEW, Uri.parse(url))
        }.getOrNull()
        if (intent?.resolveActivity(packageManager) != null) {
            runCatching { startActivity(intent) }
        } else {
            val fallback = UrlPolicy.extractBrowserFallback(url)
            if (fallback != null) binding.recordingWebView.loadUrl(fallback)
            else Toast.makeText(this, R.string.no_app_for_action, Toast.LENGTH_SHORT).show()
        }
        return true
    }

    override fun onResume() {
        super.onResume()
        binding.recordingWebView.onResume()
        channel?.postMessage(WebMessage("query-state"))
    }

    override fun onPause() {
        CookieManager.getInstance().flush()
        if (isFinishing) binding.recordingWebView.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        handler.removeCallbacks(loadTimeout)
        channel?.close()
        channel = null
        pendingMicrophone?.deny()
        pendingMicrophone = null
        binding.recordingWebView.apply {
            keepScreenOn = false
            onPause()
            stopLoading()
            webChromeClient = WebChromeClient()
            webViewClient = WebViewClient()
            destroy()
        }
        super.onDestroy()
    }

    private inner class RecordingWebViewClient : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
            navigate(request.url.toString())

        override fun onPageStarted(view: WebView, url: String, favicon: android.graphics.Bitmap?) {
            if (completeIfReturned(url)) return
            channel?.close()
            channel = null
            pendingMicrophone?.deny()
            pendingMicrophone = null
            capturing = false
            view.keepScreenOn = false
            showLoading()
        }

        override fun onPageFinished(view: WebView, url: String) {
            if (completeIfReturned(url) || isFinishing || isDestroyed) return
            if (UrlPolicy.isTrustedRecordingOrigin(url)) {
                connectChannel(view, url)
            } else if (UrlPolicy.isTrustedMediaOrigin(url)) {
                // Official login redirects must remain interactive rather than covered by the loader.
                pageReady = true
                handler.removeCallbacks(loadTimeout)
                binding.recordingLoadingPanel.visibility = View.GONE
            }
        }

        override fun doUpdateVisitedHistory(view: WebView, url: String, isReload: Boolean) {
            completeIfReturned(url)
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (request.isForMainFrame) showError()
        }

        override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: SslError) {
            handler.cancel()
            showError()
        }
    }

    private inner class RecordingChromeClient : WebChromeClient() {
        override fun onPermissionRequest(request: PermissionRequest) {
            runOnUiThread {
                if (!trustedRequest(request)) request.deny()
                else if (hasMicrophonePermission()) request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
                else {
                    pendingMicrophone?.deny()
                    pendingMicrophone = request
                    requestMicrophonePermission()
                }
            }
        }

        override fun onPermissionRequestCanceled(request: PermissionRequest) {
            if (pendingMicrophone === request) pendingMicrophone = null
        }

        override fun onCreateWindow(view: WebView, isDialog: Boolean, isUserGesture: Boolean, resultMsg: Message): Boolean {
            @SuppressLint("SetJavaScriptEnabled")
            val popup = WebView(this@RecordingActivity).apply {
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                DesktopWebViewSettings.apply(settings, desktopViewport = false)
                CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)
            }
            var handedOff = false
            popup.webViewClient = object : WebViewClient() {
                private fun handOff(url: String) {
                    if (handedOff || url == "about:blank") return
                    handedOff = true
                    if (!navigate(url)) binding.recordingWebView.loadUrl(url)
                    popup.stopLoading()
                    popup.destroy()
                }
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    handOff(request.url.toString())
                    return true
                }
                override fun onPageStarted(view: WebView, url: String, favicon: android.graphics.Bitmap?) = handOff(url)
            }
            (resultMsg.obj as WebView.WebViewTransport).webView = popup
            resultMsg.sendToTarget()
            return true
        }
    }
}
