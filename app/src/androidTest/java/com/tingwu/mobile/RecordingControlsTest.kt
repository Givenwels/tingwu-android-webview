package com.tingwu.mobile

import android.Manifest
import android.app.Activity
import android.app.ActivityManager
import android.app.Notification
import android.app.NotificationManager
import android.content.Intent
import android.graphics.Bitmap
import android.os.Build
import android.os.SystemClock
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.lifecycle.Lifecycle
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

/** Actual release APK, local page and silent emulator microphone; no cloud recording. */
@RunWith(AndroidJUnit4::class)
class RecordingControlsTest {
    @Test fun recordingNotificationEditsTitlePausesAndResumesTheSameMicrophoneSession() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val target = instrumentation.targetContext
        val device = UiDevice.getInstance(instrumentation)
        device.wakeUp()
        device.executeShellCommand("wm dismiss-keyguard")
        instrumentation.uiAutomation.grantRuntimePermission(target.packageName, Manifest.permission.RECORD_AUDIO)
        if (Build.VERSION.SDK_INT >= 33) instrumentation.uiAutomation.grantRuntimePermission(target.packageName, Manifest.permission.POST_NOTIFICATIONS)
        val html = instrumentation.context.assets.open("desktop-recorder-active.html").readBytes()
        val id = target.resources.getIdentifier("recording_web_view", "id", target.packageName)
        // A stale notification may cold-start the Activity, but must never end a new session.
        val intent = Intent().setClassName(target.packageName, "com.tingwu.mobile.RecordingActivity")
            .setAction("com.tingwu.mobile.action.RECORDING_STOP_CONFIRM")
        ActivityScenario.launch<Activity>(intent).use { scenario ->
            lateinit var view: WebView
            scenario.onActivity { activity ->
                view = activity.findViewById(id)
                view.stopLoading()
                val production = view.webViewClient
                view.webViewClient = object : WebViewClient() {
                    override fun onPageStarted(v: WebView, url: String, icon: Bitmap?) = production.onPageStarted(v, url, icon)
                    override fun onPageFinished(v: WebView, url: String) = production.onPageFinished(v, url)
                    override fun doUpdateVisitedHistory(v: WebView, url: String, reload: Boolean) = production.doUpdateVisitedHistory(v, url, reload)
                    override fun shouldInterceptRequest(v: WebView, request: WebResourceRequest) =
                        WebResourceResponse("text/html", "UTF-8", html.inputStream())
                }
                view.loadUrl("https://tingwu.aliyun.com/doc/record")
            }
            await("The production recorder layout was not installed") { js(view, "!!document.querySelector('[data-tingwu-recorder-title-field]')") == "true" }
            val loadingId = target.resources.getIdentifier("recording_loading_panel", "id", target.packageName)
            await("The native recording loader did not receive the real ready message") {
                var ready = false
                scenario.onActivity { activity -> ready = activity.findViewById<android.view.View>(loadingId).visibility == android.view.View.GONE }
                ready
            }
            assertEquals("Title is collapsed in Android WebView", "true", js(view, "document.querySelector('#record_title').getBoundingClientRect().width > innerWidth-70"))
            // Tap the real accessible field and submit through the Android keyboard.
            // This isolated page has one editable control, the recording title.
            val field = device.wait(Until.findObject(By.clazz("android.widget.EditText")), 5_000) ?: error("The title field is not accessible")
            field.click()
            field.text = "安卓端标题保存测试"
            device.pressEnter()
            await("The original title save handler was bypassed") { js(view, "window.savedTitle") == "\"安卓端标题保存测试\"" }
            js(view, "window.requestMic(); void 0;")
            await("Actual microphone did not start foreground protection") { foreground() }
            await("The recording title did not reach the native notification") {
                notification()?.extras?.getCharSequence(Notification.EXTRA_TITLE)?.contains("安卓端标题保存测试") == true
            }
            assertEquals("The original title save handler was bypassed", "\"安卓端标题保存测试\"", js(view, "window.savedTitle"))
            val first = checkNotNull(notification())
            assertTrue("Recording lacks a system pause action", first.actions.any { it.title.toString().contains("暂停") })
            device.pressHome()
            checkNotNull(first.actions.first { it.title.toString().contains("暂停") }.actionIntent).send()
            await("System pause did not stop the real microphone") { js(view, "window.stream.getAudioTracks().every(t=>t.readyState==='ended')") == "true" }
            await("Paused recording retains foreground microphone access") { !foreground() }
            await("Paused recording lost its resume action") { notification()?.actions?.any { it.title.toString().contains("继续") } == true }
            val resume = checkNotNull(notification()).actions.first { it.title.toString().contains("继续") }
            assertTrue("Resume must first open the visible recorder", checkNotNull(resume.actionIntent).isActivity)
            resume.actionIntent.send()
            await("Resume did not restart the same page's microphone") {
                foreground() && js(view, "!window.paused && window.stream.getAudioTracks()[0].readyState==='live'") == "true"
            }
            assertEquals("Resume recreated the page and lost its title", "\"安卓端标题保存测试\"", js(view, "document.querySelector('#record_title').value"))
            assertFalse("No app-owned overlay is needed for recording controls", target.checkSelfPermission("android.permission.SYSTEM_ALERT_WINDOW") == android.content.pm.PackageManager.PERMISSION_GRANTED)
            val finish = checkNotNull(notification()).actions.first { it.title.toString().contains("结束") }
            assertTrue("End must open the page for the official confirmation flow", checkNotNull(finish.actionIntent).isActivity)
            device.pressHome()
            finish.actionIntent.send()
            await("End did not invoke the official finish control and return") { scenario.state == Lifecycle.State.DESTROYED }
        }
        await("Leaving the recording page retained its notification or foreground service") { notification() == null && !foreground() }
    }

    private fun notification(): Notification? = InstrumentationRegistry.getInstrumentation().targetContext
        .getSystemService(NotificationManager::class.java).activeNotifications.firstOrNull { it.id == 1002 }?.notification

    @Suppress("DEPRECATION") private fun foreground(): Boolean = InstrumentationRegistry.getInstrumentation().targetContext
        .getSystemService(ActivityManager::class.java).getRunningServices(100)
        .any { it.service.className == "com.tingwu.mobile.RecordingForegroundService" && it.foreground }

    private fun await(message: String, predicate: () -> Boolean) {
        val deadline = SystemClock.elapsedRealtime() + 15_000
        while (SystemClock.elapsedRealtime() < deadline) {
            if (predicate()) return
            SystemClock.sleep(100)
        }
        assertTrue(message, predicate())
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
