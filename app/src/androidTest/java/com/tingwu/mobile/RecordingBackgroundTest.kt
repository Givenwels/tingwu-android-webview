package com.tingwu.mobile

import android.Manifest
import android.app.Activity
import android.app.ActivityManager
import android.app.NotificationManager
import android.content.Intent
import android.graphics.Bitmap
import android.os.Build
import android.os.PowerManager
import android.os.SystemClock
import android.util.Log
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** Isolated emulator only. All web requests are local; microphone input is silent. */
@RunWith(AndroidJUnit4::class)
class RecordingBackgroundTest {
    @Test
    fun screenOffKeepsEncodingAndPauseReleasesRecordingProtection() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val target = instrumentation.targetContext
        val device = UiDevice.getInstance(instrumentation)
        device.wakeUp()
        device.executeShellCommand("wm dismiss-keyguard")
        instrumentation.uiAutomation.grantRuntimePermission(target.packageName, Manifest.permission.RECORD_AUDIO)
        if (Build.VERSION.SDK_INT >= 33) runCatching {
            instrumentation.uiAutomation.grantRuntimePermission(target.packageName, Manifest.permission.POST_NOTIFICATIONS)
        }
        val html = instrumentation.context.assets.open("desktop-recorder-prestart.html").readBytes()
        val viewId = target.resources.getIdentifier("recording_web_view", "id", target.packageName)
        val intent = Intent().setClassName(target.packageName, "com.tingwu.mobile.RecordingActivity")
        ActivityScenario.launch<Activity>(intent).use { scenario ->
            lateinit var view: WebView
            try {
                scenario.onActivity { activity ->
                    view = activity.findViewById(viewId)
                    view.stopLoading()
                    val production = view.webViewClient
                    view.webViewClient = object : WebViewClient() {
                        override fun onPageStarted(v: WebView, url: String, icon: Bitmap?) = production.onPageStarted(v, url, icon)
                        override fun onPageFinished(v: WebView, url: String) = production.onPageFinished(v, url)
                        override fun doUpdateVisitedHistory(v: WebView, url: String, reload: Boolean) = production.doUpdateVisitedHistory(v, url, reload)
                        override fun shouldInterceptRequest(v: WebView, request: WebResourceRequest): WebResourceResponse {
                            val asset = when (request.url.path) {
                                "/__tingwu_test__/official-runtime.js" -> "official-runtime.js"
                                "/public/opusEncoderWorker.js" -> "opusEncoderWorker.js"
                                else -> null
                            }
                            return if (asset != null) WebResourceResponse("application/javascript", "UTF-8", instrumentation.context.assets.open(asset))
                            else if (request.isForMainFrame) WebResourceResponse("text/html", "UTF-8", html.inputStream())
                            else WebResourceResponse("text/plain", "UTF-8", byteArrayOf().inputStream())
                        }
                    }
                    view.loadUrl("https://tingwu.aliyun.com/doc/record")
                }
                awaitJs(view, "window.preflightComplete === true && window.microphoneAllowed")
                SystemClock.sleep(200)
                assertFalse("Microphone preflight must not start a recording service", isProtected())
                assertFalse("Idle setup must not hold a recording wake lock", hasRecordingWakeLock(device))
                js(view, instrumentation.context.assets.open("official-encoder-check.js").bufferedReader().use { it.readText() })
                js(view, """
                    document.querySelector('[data-e2e-test-id=beforeRecord_start_button]').onclick = async () => {
                      const controls = document.createElement('div');
                      controls.className = 'bottomContain';
                      controls.innerHTML = '<div class="stop-btn" data-e2e-test-id="record_finish_icon">结束</div>';
                      document.querySelector('.desktop-record > .content').appendChild(controls);
                      await window.officialEncoderStart();
                      if (window.officialEncoder) window.officialEncoder.on('dataavailable', () => {
                        const stats = window.officialEncoderStats;
                        const now = Date.now();
                        stats.maxGap = Math.max(stats.maxGap || 0, stats.lastPageAt ? now - stats.lastPageAt : 0);
                        stats.lastPageAt = now;
                      });
                    }; void 0;
                """.trimIndent())
                device.wait(Until.findObject(By.text("开始录音")), 5_000)?.click() ?: error("Start control is inaccessible")
                awaitJs(view, "window.officialEncoderStats.phase === 'running' || !!window.officialEncoderStats.error")
                assertEquals("Official encoder failed", "null", js(view, "window.officialEncoderStats.error"))
                awaitCondition("Actual recording needs a microphone foreground service") { isProtected() }
                assertFalse("An awake display does not need a recording CPU wake lock", hasRecordingWakeLock(device))
                val notifications = target.getSystemService(NotificationManager::class.java).activeNotifications
                assertTrue("Recording must have a visible ongoing notification", notifications.any { it.id == 1002 })
                var keepsScreenOn = true
                scenario.onActivity { keepsScreenOn = view.keepScreenOn }
                assertFalse("Recording must allow the screen to turn off normally", keepsScreenOn)
                val pagesBefore = js(view, "window.officialEncoderStats.pages").toInt()
                device.sleep()
                awaitCondition("Screen-off recording needs its CPU wake lock") { hasRecordingWakeLock(device) }
                // No WebView evaluation, heartbeat, or UI polling during this screen-off period.
                SystemClock.sleep(70_000)
                assertFalse("The recording service must not turn the display back on", target.getSystemService(PowerManager::class.java).isInteractive)
                assertTrue("Microphone protection stopped while locked", isProtected())
                val pagesAfter = js(view, "window.officialEncoderStats.pages").toInt()
                assertTrue("The official encoder stopped producing audio while locked", pagesAfter - pagesBefore > 400)
                assertTrue("Audio stopped for a long interval while locked", js(view, "window.officialEncoderStats.maxGap").toDouble() < 10_000)
                js(view, "window.officialEncoderPause(); void 0;")
                awaitJs(view, "window.officialEncoderStats.phase === 'paused'")
                awaitCondition("Pause must stop the microphone service") { !isProtected() }
                awaitCondition("Pause must release the CPU wake lock") { !hasRecordingWakeLock(device) }
                assertEquals("Paused recording still owns microphone tracks", "true", js(view, "window.officialEncoderTracks.every(track => track.readyState === 'ended')"))
                device.wakeUp()
                device.executeShellCommand("wm dismiss-keyguard")
                awaitCondition("The screen did not wake") { target.getSystemService(PowerManager::class.java).isInteractive }
                SystemClock.sleep(300)
                js(view, "window.officialEncoderResume(); void 0;")
                awaitJs(view, "window.officialEncoderStats.phase === 'resumed'")
                awaitCondition("Resume must restore microphone protection") { isProtected() }
                js(view, "window.officialEncoderStop(); void 0;")
                awaitJs(view, "window.officialEncoderStats.phase === 'stopped'")
                awaitCondition("Stop must release the foreground service and wake lock") { !isProtected() && !hasRecordingWakeLock(device) }
                Log.i("TingwuRecorderTest", "SCREEN_OFF_ENCODER ${js(view, "JSON.stringify({before:$pagesBefore,after:$pagesAfter,maxGap:window.officialEncoderStats.maxGap,error:window.officialEncoderStats.error})")}")
            } finally {
                device.wakeUp()
                device.executeShellCommand("wm dismiss-keyguard")
            }
        }
        awaitCondition("Closing the recorder left a foreground service") { !isProtected() }
    }

    @Suppress("DEPRECATION")
    private fun isProtected(): Boolean = InstrumentationRegistry.getInstrumentation().targetContext
        .getSystemService(ActivityManager::class.java).getRunningServices(100)
        .any { it.service.className == "com.tingwu.mobile.RecordingForegroundService" && it.foreground }

    private fun hasRecordingWakeLock(device: UiDevice): Boolean {
        val tag = InstrumentationRegistry.getInstrumentation().targetContext.packageName + ":Recording"
        return device.executeShellCommand("dumpsys power").substringAfter("Wake Locks:").substringBefore("Suspend Blockers:").contains(tag)
    }

    private fun awaitJs(view: WebView, condition: String) = awaitCondition(condition) { js(view, condition) == "true" }
    private fun awaitCondition(message: String, condition: () -> Boolean) {
        val deadline = SystemClock.elapsedRealtime() + 15_000
        while (SystemClock.elapsedRealtime() < deadline) {
            if (condition()) return
            SystemClock.sleep(100)
        }
        assertTrue(message, condition())
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
