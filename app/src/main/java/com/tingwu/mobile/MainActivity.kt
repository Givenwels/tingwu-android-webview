package com.tingwu.mobile

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.DownloadManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.os.Message
import android.provider.MediaStore
import android.view.View
import android.webkit.CookieManager
import android.webkit.DownloadListener
import android.webkit.PermissionRequest
import android.webkit.SslErrorHandler
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.net.http.SslError
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import com.tingwu.mobile.databinding.ActivityMainBinding
import java.io.File
import java.util.Locale

class MainActivity : AppCompatActivity() {
    private lateinit var binding: ActivityMainBinding

    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null
    private var pendingFileChooser: FileChooserSpec? = null
    private val pendingCaptureUris = mutableListOf<Uri>()

    private var pendingWebPermission: PermissionRequest? = null
    private var pendingWebResources: Array<String> = emptyArray()

    private var mainFrameError = false
    private lateinit var mobileUserAgent: String
    private var desktopCompatibilityEnabled = false

    private val filePickerLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            deliverFileChooserResult(result.resultCode, result.data)
        }

    private val fileCameraPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            launchFileChooser(includeCamera = granted)
        }

    private val webPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
            completeWebPermissionRequest()
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        configureWebView()
        configureActions()
        configureBackNavigation()

        if (savedInstanceState == null) {
            binding.webView.loadUrl(BuildConfig.TINGWU_URL)
        } else {
            binding.webView.restoreState(savedInstanceState)
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        mobileUserAgent = binding.webView.settings.userAgentString

        with(binding.webView.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            builtInZoomControls = true
            displayZoomControls = false
            setSupportMultipleWindows(true)
            javaScriptCanOpenWindowsAutomatically = true
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            allowFileAccess = false
            allowContentAccess = true
            safeBrowsingEnabled = true
            cacheMode = WebSettings.LOAD_DEFAULT
        }
        applyDisplayMode(reload = false)

        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(binding.webView, true)
        }

        binding.webView.webViewClient = TingwuWebViewClient()
        binding.webView.webChromeClient = TingwuWebChromeClient()
        binding.webView.setDownloadListener(createDownloadListener())
    }

    private fun configureActions() {
        binding.retryButton.setOnClickListener {
            hideError()
            val currentUrl = binding.webView.url
            if (currentUrl.isNullOrBlank() || currentUrl == "about:blank") {
                binding.webView.loadUrl(BuildConfig.TINGWU_URL)
            } else {
                binding.webView.reload()
            }
        }
        binding.browserButton.setOnClickListener {
            openInSystemBrowser(binding.webView.url ?: BuildConfig.TINGWU_URL)
        }
        binding.displayModeButton.setOnClickListener {
            desktopCompatibilityEnabled = !desktopCompatibilityEnabled
            applyDisplayMode(reload = true)
            val message =
                if (desktopCompatibilityEnabled) {
                    R.string.desktop_compatibility_enabled
                } else {
                    R.string.mobile_mode_enabled
                }
            Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
        }
    }

    private fun applyDisplayMode(reload: Boolean) {
        val displaySettings =
            WebViewCompatibility.displaySettings(
                defaultUserAgent = mobileUserAgent,
                desktopCompatibilityEnabled = desktopCompatibilityEnabled,
            )
        with(binding.webView.settings) {
            userAgentString = displaySettings.userAgent
            useWideViewPort = displaySettings.useWideViewPort
            loadWithOverviewMode = displaySettings.loadWithOverviewMode
        }
        binding.displayModeButton.setText(
            if (desktopCompatibilityEnabled) {
                R.string.mobile_mode
            } else {
                R.string.desktop_compatibility_mode
            },
        )
        if (reload) {
            val currentUrl =
                binding.webView.url
                    ?.takeIf(UrlPolicy::shouldStayInWebView)
                    ?.takeIf { it != "about:blank" }
                    ?: BuildConfig.TINGWU_URL
            binding.webView.stopLoading()
            binding.webView.loadUrl(currentUrl)
        }
    }

    private fun configureBackNavigation() {
        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    when {
                        binding.errorPanel.visibility == View.VISIBLE -> {
                            hideError()
                            binding.webView.reload()
                        }
                        binding.webView.canGoBack() -> binding.webView.goBack()
                        else -> {
                            isEnabled = false
                            onBackPressedDispatcher.onBackPressed()
                        }
                    }
                }
            },
        )
    }

    private fun handleNavigation(url: String): Boolean {
        if (UrlPolicy.shouldStayInWebView(url)) return false
        if (!UrlPolicy.shouldOpenExternally(url)) return true
        openExternalUrl(url)
        return true
    }

    private fun openExternalUrl(url: String) {
        if (url.startsWith("intent:", ignoreCase = true)) {
            val intent =
                runCatching {
                    Intent.parseUri(url, Intent.URI_INTENT_SCHEME).apply {
                        component = null
                        selector = null
                    }
                }.getOrNull()

            if (intent != null && intent.resolveActivity(packageManager) != null) {
                startActivity(intent)
                return
            }

            val fallback =
                intent?.getStringExtra("browser_fallback_url")
                    ?.takeIf(UrlPolicy::shouldStayInWebView)
                    ?: UrlPolicy.extractBrowserFallback(url)
            if (fallback != null) {
                binding.webView.loadUrl(fallback)
                return
            }
        } else {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
            if (intent.resolveActivity(packageManager) != null) {
                startActivity(intent)
                return
            }
        }

        Toast.makeText(this, R.string.no_app_for_action, Toast.LENGTH_SHORT).show()
    }

    private fun openInSystemBrowser(url: String) {
        val webUrl = url.takeIf(UrlPolicy::shouldStayInWebView) ?: BuildConfig.TINGWU_URL
        try {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(webUrl)))
        } catch (_: ActivityNotFoundException) {
            Toast.makeText(this, R.string.no_app_for_action, Toast.LENGTH_SHORT).show()
        }
    }

    private fun requestFileChooser(
        callback: ValueCallback<Array<Uri>>,
        params: WebChromeClient.FileChooserParams,
    ): Boolean {
        fileChooserCallback?.onReceiveValue(null)
        fileChooserCallback = callback
        pendingFileChooser =
            FileChooserSpec(
                acceptTypes = sanitizeMimeTypes(params.acceptTypes),
                allowMultiple = params.mode == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE,
                captureEnabled = params.isCaptureEnabled,
            )

        val mayUseCamera = pendingFileChooser?.acceptsImageOrVideo == true
        if (
            mayUseCamera &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) !=
                PackageManager.PERMISSION_GRANTED
        ) {
            fileCameraPermissionLauncher.launch(Manifest.permission.CAMERA)
        } else {
            launchFileChooser(includeCamera = mayUseCamera)
        }
        return true
    }

    private fun launchFileChooser(includeCamera: Boolean) {
        val spec = pendingFileChooser ?: return cancelFileChooser()
        pendingCaptureUris.clear()

        val contentIntent =
            Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = if (spec.acceptTypes.size == 1) spec.acceptTypes.first() else "*/*"
                putExtra(Intent.EXTRA_ALLOW_MULTIPLE, spec.allowMultiple)
                if (spec.acceptTypes.size > 1) {
                    putExtra(Intent.EXTRA_MIME_TYPES, spec.acceptTypes)
                }
            }

        val captureIntents =
            if (includeCamera) {
                buildList {
                    if (spec.acceptsImages) createCaptureIntent(isVideo = false)?.let(::add)
                    if (spec.acceptsVideos) createCaptureIntent(isVideo = true)?.let(::add)
                }
            } else {
                emptyList()
            }

        val chooser =
            Intent.createChooser(contentIntent, getString(R.string.choose_file)).apply {
                if (captureIntents.isNotEmpty()) {
                    putExtra(Intent.EXTRA_INITIAL_INTENTS, captureIntents.toTypedArray())
                }
            }

        try {
            filePickerLauncher.launch(chooser)
        } catch (_: ActivityNotFoundException) {
            Toast.makeText(this, R.string.file_picker_unavailable, Toast.LENGTH_SHORT).show()
            cancelFileChooser()
        }
    }

    private fun createCaptureIntent(isVideo: Boolean): Intent? {
        val captureDirectory = File(cacheDir, "captures").apply { mkdirs() }
        val extension = if (isVideo) ".mp4" else ".jpg"
        val file =
            runCatching {
                File.createTempFile(
                    if (isVideo) "video-" else "image-",
                    extension,
                    captureDirectory,
                )
            }.getOrNull() ?: return null
        val uri =
            runCatching {
                FileProvider.getUriForFile(
                    this,
                    "${BuildConfig.APPLICATION_ID}.fileprovider",
                    file,
                )
            }.getOrElse {
                file.delete()
                return null
            }
        val action = if (isVideo) MediaStore.ACTION_VIDEO_CAPTURE else MediaStore.ACTION_IMAGE_CAPTURE
        val intent =
            Intent(action).apply {
                putExtra(MediaStore.EXTRA_OUTPUT, uri)
                clipData = android.content.ClipData.newRawUri("capture", uri)
                addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
        return if (intent.resolveActivity(packageManager) != null) {
            pendingCaptureUris += uri
            intent
        } else {
            file.delete()
            null
        }
    }

    private fun deliverFileChooserResult(
        resultCode: Int,
        data: Intent?,
    ) {
        val result =
            if (resultCode == Activity.RESULT_OK) {
                extractResultUris(data).ifEmpty {
                    pendingCaptureUris.filter(::uriHasContent)
                }.toTypedArray()
            } else {
                emptyArray()
            }
        fileChooserCallback?.onReceiveValue(result.takeIf { it.isNotEmpty() })
        fileChooserCallback = null
        pendingFileChooser = null
        pendingCaptureUris.clear()
    }

    private fun extractResultUris(data: Intent?): List<Uri> {
        if (data == null) return emptyList()
        val clipData = data.clipData
        if (clipData != null) {
            return buildList {
                for (index in 0 until clipData.itemCount) {
                    clipData.getItemAt(index).uri?.let(::add)
                }
            }.distinct()
        }
        return listOfNotNull(data.data)
    }

    private fun uriHasContent(uri: Uri): Boolean =
        runCatching {
            contentResolver.openAssetFileDescriptor(uri, "r")?.use { descriptor ->
                descriptor.length != 0L
            } ?: false
        }.getOrDefault(false)

    private fun cancelFileChooser() {
        fileChooserCallback?.onReceiveValue(null)
        fileChooserCallback = null
        pendingFileChooser = null
        pendingCaptureUris.clear()
    }

    private fun handleWebPermissionRequest(request: PermissionRequest) {
        if (!UrlPolicy.isTrustedMediaOrigin(request.origin.toString())) {
            request.deny()
            return
        }

        val supportedResources =
            request.resources.filter {
                it == PermissionRequest.RESOURCE_AUDIO_CAPTURE ||
                    it == PermissionRequest.RESOURCE_VIDEO_CAPTURE
            }
        if (supportedResources.isEmpty()) {
            request.deny()
            return
        }

        val requiredPermissions =
            supportedResources.mapNotNull {
                when (it) {
                    PermissionRequest.RESOURCE_AUDIO_CAPTURE -> Manifest.permission.RECORD_AUDIO
                    PermissionRequest.RESOURCE_VIDEO_CAPTURE -> Manifest.permission.CAMERA
                    else -> null
                }
            }.distinct()

        val missingPermissions =
            requiredPermissions.filter {
                ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
            }

        if (missingPermissions.isEmpty()) {
            request.grant(supportedResources.toTypedArray())
            return
        }

        pendingWebPermission?.deny()
        pendingWebPermission = request
        pendingWebResources = supportedResources.toTypedArray()
        webPermissionLauncher.launch(missingPermissions.toTypedArray())
    }

    private fun completeWebPermissionRequest() {
        val request = pendingWebPermission ?: return
        val grantedResources =
            pendingWebResources.filter {
                val androidPermission =
                    when (it) {
                        PermissionRequest.RESOURCE_AUDIO_CAPTURE -> Manifest.permission.RECORD_AUDIO
                        PermissionRequest.RESOURCE_VIDEO_CAPTURE -> Manifest.permission.CAMERA
                        else -> return@filter false
                    }
                ContextCompat.checkSelfPermission(this, androidPermission) ==
                    PackageManager.PERMISSION_GRANTED
            }

        if (grantedResources.isEmpty()) {
            request.deny()
            Toast.makeText(this, R.string.permission_denied, Toast.LENGTH_SHORT).show()
        } else {
            request.grant(grantedResources.toTypedArray())
        }
        pendingWebPermission = null
        pendingWebResources = emptyArray()
    }

    private fun createDownloadListener() =
        DownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
            if (!UrlPolicy.shouldStayInWebView(url)) {
                Toast.makeText(this, R.string.download_failed, Toast.LENGTH_SHORT).show()
                return@DownloadListener
            }

            runCatching {
                val fileName = URLUtil.guessFileName(url, contentDisposition, mimeType)
                val request =
                    DownloadManager.Request(Uri.parse(url)).apply {
                        setTitle(fileName)
                        setDescription(getString(R.string.app_name))
                        setMimeType(mimeType)
                        setNotificationVisibility(
                            DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED,
                        )
                        userAgent?.takeIf { it.isNotBlank() }?.let {
                            addRequestHeader("User-Agent", it)
                        }
                        CookieManager.getInstance().getCookie(url)?.takeIf { it.isNotBlank() }?.let {
                            addRequestHeader("Cookie", it)
                        }
                        binding.webView.url?.takeIf { it.isNotBlank() }?.let {
                            addRequestHeader("Referer", it)
                        }
                        setDestinationInExternalFilesDir(
                            this@MainActivity,
                            Environment.DIRECTORY_DOWNLOADS,
                            fileName,
                        )
                    }
                val manager = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
                manager.enqueue(request)
            }.onSuccess {
                Toast.makeText(this, R.string.download_started, Toast.LENGTH_SHORT).show()
            }.onFailure {
                Toast.makeText(this, R.string.download_failed, Toast.LENGTH_SHORT).show()
            }
        }

    private fun sanitizeMimeTypes(rawTypes: Array<String>): Array<String> {
        val normalized =
            rawTypes
                .flatMap { it.split(',') }
                .map { it.trim().lowercase(Locale.ROOT) }
                .filter { it.isNotBlank() && it.contains('/') }
                .distinct()
        return normalized.ifEmpty { listOf("*/*") }.toTypedArray()
    }

    private fun showError(message: CharSequence?) {
        mainFrameError = true
        binding.progressBar.visibility = View.GONE
        binding.webView.visibility = View.INVISIBLE
        binding.errorMessage.text =
            message?.takeIf { it.isNotBlank() } ?: getString(R.string.load_error_message)
        binding.errorPanel.visibility = View.VISIBLE
    }

    private fun hideError() {
        mainFrameError = false
        binding.errorPanel.visibility = View.GONE
        binding.webView.visibility = View.VISIBLE
    }

    override fun onSaveInstanceState(outState: Bundle) {
        binding.webView.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    override fun onPause() {
        if (WebViewCompatibility.shouldPauseWebView(isFinishing)) {
            binding.webView.onPause()
        } else if (BackgroundPlaybackPolicy.shouldStartKeepAlive(isFinishing)) {
            BackgroundPlaybackService.start(
                context = this,
                includeMicrophone = hasRecordAudioPermission(),
            )
        }
        CookieManager.getInstance().flush()
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        if (BackgroundPlaybackPolicy.shouldPrepareKeepAliveOnResume()) {
            BackgroundPlaybackService.start(
                context = this,
                includeMicrophone = hasRecordAudioPermission(),
            )
        }
        binding.webView.onResume()
    }

    override fun onDestroy() {
        BackgroundPlaybackService.stop(this)
        cancelFileChooser()
        pendingWebPermission?.deny()
        pendingWebPermission = null
        binding.webView.apply {
            onPause()
            stopLoading()
            loadUrl("about:blank")
            webChromeClient = WebChromeClient()
            webViewClient = WebViewClient()
            removeAllViews()
            destroy()
        }
        super.onDestroy()
    }

    private fun hasRecordAudioPermission(): Boolean =
        ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) ==
            PackageManager.PERMISSION_GRANTED

    private inner class TingwuWebViewClient : WebViewClient() {
        override fun shouldOverrideUrlLoading(
            view: WebView,
            request: WebResourceRequest,
        ): Boolean = handleNavigation(request.url.toString())

        override fun onPageStarted(
            view: WebView,
            url: String,
            favicon: android.graphics.Bitmap?,
        ) {
            mainFrameError = false
            binding.errorPanel.visibility = View.GONE
            binding.webView.visibility = View.VISIBLE
            binding.progressBar.visibility = View.VISIBLE
        }

        override fun onPageFinished(
            view: WebView,
            url: String,
        ) {
            if (!mainFrameError) {
                binding.progressBar.visibility = View.GONE
            }
            if (UrlPolicy.isTrustedMediaOrigin(url)) {
                view.evaluateJavascript(
                    BackgroundPlaybackPolicy.pageVisibilityKeepAliveScript(),
                    null,
                )
            }
        }

        override fun onReceivedError(
            view: WebView,
            request: WebResourceRequest,
            error: WebResourceError,
        ) {
            if (request.isForMainFrame) {
                showError(error.description)
            }
        }

        override fun onReceivedSslError(
            view: WebView,
            handler: SslErrorHandler,
            error: SslError,
        ) {
            handler.cancel()
            showError(getString(R.string.load_error_message))
        }
    }

    private inner class TingwuWebChromeClient : WebChromeClient() {
        override fun onProgressChanged(
            view: WebView,
            newProgress: Int,
        ) {
            binding.progressBar.progress = newProgress
            if (newProgress >= 100 && !mainFrameError) {
                binding.progressBar.visibility = View.GONE
            }
        }

        override fun onShowFileChooser(
            webView: WebView,
            filePathCallback: ValueCallback<Array<Uri>>,
            fileChooserParams: FileChooserParams,
        ): Boolean = requestFileChooser(filePathCallback, fileChooserParams)

        override fun onPermissionRequest(request: PermissionRequest) {
            runOnUiThread { handleWebPermissionRequest(request) }
        }

        override fun onPermissionRequestCanceled(request: PermissionRequest) {
            if (pendingWebPermission == request) {
                pendingWebPermission = null
                pendingWebResources = emptyArray()
            }
        }

        override fun onCreateWindow(
            view: WebView,
            isDialog: Boolean,
            isUserGesture: Boolean,
            resultMsg: Message,
        ): Boolean {
            @SuppressLint("SetJavaScriptEnabled")
            val popup =
                WebView(this@MainActivity).apply {
                    settings.javaScriptEnabled = true
                    settings.domStorageEnabled = true
                    settings.javaScriptCanOpenWindowsAutomatically = true
                    CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)
                }
            popup.webViewClient =
                object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(
                        view: WebView,
                        request: WebResourceRequest,
                    ): Boolean {
                        val url = request.url.toString()
                        if (!handleNavigation(url)) binding.webView.loadUrl(url)
                        popup.destroy()
                        return true
                    }

                    override fun onPageStarted(
                        view: WebView,
                        url: String,
                        favicon: android.graphics.Bitmap?,
                    ) {
                        if (url != "about:blank") {
                            if (!handleNavigation(url)) binding.webView.loadUrl(url)
                            popup.stopLoading()
                            popup.destroy()
                        }
                    }
                }
            val transport = resultMsg.obj as WebView.WebViewTransport
            transport.webView = popup
            resultMsg.sendToTarget()
            return true
        }
    }

    private data class FileChooserSpec(
        val acceptTypes: Array<String>,
        val allowMultiple: Boolean,
        val captureEnabled: Boolean,
    ) {
        val acceptsImages: Boolean
            get() =
                acceptTypes.any { it.startsWith("image/") } ||
                    (captureEnabled && acceptTypes.any { it == "*/*" })

        val acceptsVideos: Boolean
            get() =
                acceptTypes.any { it.startsWith("video/") } ||
                    (captureEnabled && acceptTypes.any { it == "*/*" })

        val acceptsImageOrVideo: Boolean
            get() = acceptsImages || acceptsVideos || captureEnabled
    }
}
