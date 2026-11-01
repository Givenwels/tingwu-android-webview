package com.tingwu.mobile

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.os.SystemClock
import android.view.View
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.lifecycle.Lifecycle
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** Tests local return navigation against the real, signed release Activity. */
@RunWith(AndroidJUnit4::class)
class RecordingReturnTest {
    @Test fun savedRecordFullNavigationReturnsToMobile() = checkReturn("location.href = '/doc/transcripts/saved-test'")
    @Test fun savedRecordHistoryNavigationReturnsToMobile() = checkReturn("history.pushState({}, '', '/doc/transcripts/saved-test')")

    @Test fun historyNavigationWaitsForTheMicrophoneToStop() {
        withRecording { scenario, view ->
            js(view, "navigator.mediaDevices.getUserMedia({audio:true}).then(stream => window.testStream = stream); void 0;")
            awaitCondition { js(view, "!!window.testStream && window.testStream.getAudioTracks()[0].readyState === 'live'") == "true" }
            js(view, "history.pushState({}, '', '/home'); void 0;")
            SystemClock.sleep(600)
            assertTrue("Navigation must not end an active recording", scenario.state != Lifecycle.State.DESTROYED)
            js(view, "window.testStream.getTracks().forEach(track => track.stop()); void 0;")
            awaitCondition { scenario.state == Lifecycle.State.DESTROYED }
        }
    }

    private fun checkReturn(navigation: String) = withRecording { scenario, view ->
        js(view, "$navigation; void 0;")
        awaitCondition { scenario.state == Lifecycle.State.DESTROYED }
    }

    private fun withRecording(block: (ActivityScenario<Activity>, WebView) -> Unit) {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val target = instrumentation.targetContext
        instrumentation.uiAutomation.grantRuntimePermission(target.packageName, Manifest.permission.RECORD_AUDIO)
        val viewId = target.resources.getIdentifier("recording_web_view", "id", target.packageName)
        val loadingId = target.resources.getIdentifier("recording_loading_panel", "id", target.packageName)
        val html = """
            <!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
            <div id="root"><div class="record-root">
              <div class="leftContain">返回</div><div class="content">实时记录</div>
            </div></div>
        """.trimIndent().toByteArray()
        val intent = Intent().setClassName(target.packageName, "com.tingwu.mobile.RecordingActivity")
        ActivityScenario.launch<Activity>(intent).use { scenario ->
            lateinit var view: WebView
            scenario.onActivity { activity ->
                view = activity.findViewById(viewId)
                view.stopLoading()
                val production = view.webViewClient
                view.webViewClient = object : WebViewClient() {
                    override fun onPageStarted(webView: WebView, url: String, icon: Bitmap?) = production.onPageStarted(webView, url, icon)
                    override fun onPageFinished(webView: WebView, url: String) = production.onPageFinished(webView, url)
                    override fun doUpdateVisitedHistory(webView: WebView, url: String, reload: Boolean) = production.doUpdateVisitedHistory(webView, url, reload)
                    override fun shouldInterceptRequest(webView: WebView, request: WebResourceRequest) =
                        WebResourceResponse("text/html", "UTF-8", html.inputStream())
                }
                view.loadUrl("https://tingwu.aliyun.com/doc/record")
            }
            awaitCondition {
                var ready = false
                scenario.onActivity { activity -> ready = activity.findViewById<View>(loadingId).visibility == View.GONE }
                ready
            }
            block(scenario, view)
        }
    }

    private fun awaitCondition(condition: () -> Boolean) {
        val deadline = SystemClock.elapsedRealtime() + 8_000
        while (SystemClock.elapsedRealtime() < deadline) {
            if (condition()) return
            SystemClock.sleep(100)
        }
        assertTrue("Recording did not return to mobile after leaving the recorder", condition())
    }

    private fun js(view: WebView, expression: String): String {
        val latch = CountDownLatch(1)
        var result = ""
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            view.evaluateJavascript(expression) { value -> result = value; latch.countDown() }
        }
        check(latch.await(5, TimeUnit.SECONDS)) { "WebView callback timed out" }
        return result
    }
}
