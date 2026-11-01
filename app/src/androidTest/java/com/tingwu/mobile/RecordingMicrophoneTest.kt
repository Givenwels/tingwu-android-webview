package com.tingwu.mobile

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.os.SystemClock
import android.util.Log
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.view.View
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** Run on a clean emulator package; audio input is synthetic/silent, never the host microphone. */
@RunWith(AndroidJUnit4::class)
class RecordingMicrophoneTest {
    @Test
    fun runtimeGrantAllowsOfficialPreflightAndRepeatedCapture() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val device = UiDevice.getInstance(instrumentation)
        val html = instrumentation.context.assets.open("desktop-recorder-prestart.html").readBytes()
        val target = instrumentation.targetContext
        val recordingViewId = target.resources.getIdentifier("recording_web_view", "id", target.packageName)
        val retryViewId = target.resources.getIdentifier("recording_retry_button", "id", target.packageName)
        assertEquals(
            "Run this test after clearing the emulator test package",
            PackageManager.PERMISSION_DENIED,
            instrumentation.targetContext.checkSelfPermission(Manifest.permission.RECORD_AUDIO),
        )
        val intent = Intent().setClassName(target.packageName, "com.tingwu.mobile.RecordingActivity")
        ActivityScenario.launch<Activity>(intent).use { scenario ->
            lateinit var webView: WebView
            scenario.onActivity { activity ->
                webView = activity.findViewById(recordingViewId)
                webView.stopLoading()
                val productionClient = webView.webViewClient
                // The real production WebChromeClient and origin checks remain installed.
                webView.webViewClient = object : WebViewClient() {
                    override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) =
                        productionClient.onPageStarted(view, url, favicon)
                    override fun onPageFinished(view: WebView, url: String) = productionClient.onPageFinished(view, url)
                    override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse {
                        val asset = when (request.url.path) {
                            "/__tingwu_test__/official-runtime.js" -> "official-runtime.js"
                            "/public/opusEncoderWorker.js" -> "opusEncoderWorker.js"
                            else -> null
                        }
                        return if (asset != null) {
                            WebResourceResponse("application/javascript", "UTF-8", instrumentation.context.assets.open(asset))
                        } else if (request.isForMainFrame) {
                            WebResourceResponse("text/html", "UTF-8", html.inputStream())
                        } else WebResourceResponse("text/plain", "UTF-8", byteArrayOf().inputStream())
                    }
                }
                // Production loads the workspace only after Android grants the microphone.
                // Loading a second page here races the grant callback's own loadWorkspace().
            }
            if (InstrumentationRegistry.getArguments().getString("denyFirst") == "true") {
                val deny = device.wait(Until.findObject(By.res(
                    "com.android.permissioncontroller", "permission_deny_button",
                )), 15_000) ?: error("Android did not show the microphone permission dialog")
                deny.click()
                val retryDeadline = SystemClock.elapsedRealtime() + 5_000
                var readyToRetry = false
                while (!readyToRetry && SystemClock.elapsedRealtime() < retryDeadline) {
                    scenario.onActivity { activity ->
                        readyToRetry = activity.findViewById<View>(retryViewId).isShown
                    }
                    if (!readyToRetry) SystemClock.sleep(100)
                }
                assertTrue("A denied microphone needs a working retry action", readyToRetry)
                scenario.onActivity { activity ->
                    val retry = activity.findViewById<View>(retryViewId)
                    assertEquals("A denied microphone needs a working retry action", View.VISIBLE, retry.visibility)
                    assertTrue("The retry action must be accessible", retry.isShown)
                    assertTrue("Do not initialize the official microphone page before Android grants access",
                        webView.url.isNullOrBlank() || webView.url == "about:blank")
                    retry.performClick()
                }
            }
            val allow = device.wait(Until.findObject(By.res(
                "com.android.permissioncontroller", "permission_allow_foreground_only_button",
            )), 15_000) ?: error("Android did not show the microphone permission dialog")
            allow.click()
            awaitJs(webView, "window.preflightComplete === true")
            assertEquals("Official getUserMedia preflight failed: ${js(webView, "window.microphoneError")}",
                "true", js(webView, "window.microphoneAllowed"))
            for (attempt in 1..3) {
                js(webView, "window.startRecording(); void 0;")
                awaitJs(webView, "window.stream && window.stream.getAudioTracks()[0].readyState === 'live'")
                js(webView, """
                    window.recordedBytes = 0;
                    window.testRecorder = new MediaRecorder(window.stream);
                    window.testRecorder.ondataavailable = event => window.recordedBytes += event.data.size;
                    window.testRecorder.start(100);
                    setTimeout(() => window.testRecorder.stop(), 500);
                    void 0;
                """.trimIndent())
                awaitJs(webView, "window.recordedBytes > 0 && window.testRecorder.state === 'inactive'")
                js(webView, "window.stream.getTracks().forEach(track => track.stop()); void 0;")
                awaitJs(webView, "window.stream.getAudioTracks()[0].readyState === 'ended'")
            }
            val layout = js(webView, """
                Array.from(document.querySelectorAll('[data-e2e-test-id="beforeRecord_start_button"], .languages > div, .translate-item-des')).every(element => {
                  const r = element.getBoundingClientRect();
                  return r.left >= 10 && r.right <= innerWidth - 10 && r.height >= 44;
                })
            """.trimIndent())
            assertEquals("The initial recording controls are clipped in Android WebView", "true", layout)
            if (InstrumentationRegistry.getArguments().getString("officialEncoder") == "true") {
                val encoderCheck = instrumentation.context.assets.open("official-encoder-check.js").bufferedReader().use { it.readText() }
                js(webView, encoderCheck)
                js(webView, "document.querySelector('[data-e2e-test-id=beforeRecord_start_button]').onclick = window.officialEncoderStart; void 0;")
                val startControl = device.wait(Until.findObject(By.text("开始录音")), 5_000)
                    ?: error("The recording start control is inaccessible")
                startControl.click()
                awaitJs(webView, "window.officialEncoderStats.phase === 'running' || !!window.officialEncoderStats.error", 30_000)
                assertEquals("Official encoder startup failed: ${js(webView, "window.officialEncoderStats")}",
                    "null", js(webView, "window.officialEncoderStats.error"))
                awaitJs(webView, "Date.now() - window.officialEncoderStats.startedAt >= 20000 && window.officialEncoderStats.pages > 80", 30_000)
                assertEquals("The official worker did not emit Ogg/Opus pages", "true", js(webView, "window.officialEncoderStats.oggPages > 80"))
                js(webView, "window.officialEncoderPause(); void 0;")
                awaitJs(webView, "window.officialEncoderStats.phase === 'paused'")
                assertEquals("Pause must release the microphone", "true", js(webView,
                    "window.officialEncoderTracks.every(track => track.readyState === 'ended')"))
                val pagesAtPause = js(webView, "window.officialEncoderStats.pages")
                awaitJs(webView, "Date.now() - window.officialEncoderStats.pausedAt >= 600")
                assertEquals("The paused recorder is still encoding", pagesAtPause, js(webView, "window.officialEncoderStats.pages"))
                js(webView, "document.querySelector('[data-e2e-test-id=beforeRecord_start_button]').onclick = window.officialEncoderResume; void 0;")
                startControl.click()
                awaitJs(webView, "window.officialEncoderStats.phase === 'resumed'")
                awaitJs(webView, "window.officialEncoderStats.pages > $pagesAtPause + 20")
                js(webView, "window.officialEncoderStop(); void 0;")
                awaitJs(webView, "window.officialEncoderStats.phase === 'stopped'")
                assertEquals("Stop must release all microphone tracks", "true", js(webView,
                    "window.officialEncoderTracks.every(track => track.readyState === 'ended')"))
                Log.i("TingwuRecorderTest", "OFFICIAL_ENCODER ${js(webView, "window.officialEncoderStats")}")
            }
        }
    }

    private fun awaitJs(webView: WebView, expression: String, timeoutMs: Long = 15_000) {
        val deadline = SystemClock.elapsedRealtime() + timeoutMs
        while (SystemClock.elapsedRealtime() < deadline) {
            if (js(webView, expression) == "true") return
            SystemClock.sleep(100)
        }
        assertTrue("JavaScript condition did not become true: $expression; last=${js(webView, expression)}", false)
    }

    private fun js(webView: WebView, expression: String): String {
        val latch = CountDownLatch(1)
        var result = ""
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            webView.evaluateJavascript(expression) { value -> result = value; latch.countDown() }
        }
        check(latch.await(5, TimeUnit.SECONDS)) { "WebView JavaScript callback timed out" }
        return result
    }
}
