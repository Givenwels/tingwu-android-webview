package com.tingwu.mobile

import android.Manifest
import android.app.Activity
import android.app.ActivityManager
import android.app.Notification
import android.app.NotificationManager
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.media.session.MediaController
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.os.PowerManager
import android.os.SystemClock
import android.provider.Settings
import android.util.Log
import android.view.WindowInsets
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
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** Emulator only; revoke RECORD_AUDIO and POST_NOTIFICATIONS before running this class. */
@RunWith(AndroidJUnit4::class)
class PlaybackBackgroundTest {
    @Test fun overlayDenialLeavesMediaSessionControlsUsable() = withPage(false) { _, view ->
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val target = instrumentation.targetContext
        val device = UiDevice.getInstance(instrumentation)
        assertFalse("Run this test with the emulator overlay app-op denied", Settings.canDrawOverlays(target))
        target.getSharedPreferences("playback", Activity.MODE_PRIVATE).edit().putBoolean("overlay_requested", false).commit()
        device.wait(Until.findObject(By.text("播放本地音频")), 5_000)?.click() ?: error("Play control is inaccessible")
        device.wait(Until.findObject(By.text("暂不")), 5_000)?.click() ?: error("Overlay authorization must be optional")
        val controller = awaitMediaController()
        device.pressHome()
        assertFalse("Overlay denial was ignored", device.wait(Until.hasObject(By.res(target.packageName, "floating_playback_toggle")), 1_000))
        assertEquals("The website paused after overlay denial", "false", js(view, "player.innerAudioContext.paused"))
        controller.transportControls.pause()
        awaitCondition("Media-session pause failed without overlay authorization") {
            js(view, "player.innerAudioContext.paused && !player.playing") == "true" && !isForeground()
        }
        controller.transportControls.play()
        awaitCondition("Media-session resume failed without overlay authorization") {
            js(view, "!player.innerAudioContext.paused && player.playing") == "true" && isForeground()
        }
        controller.transportControls.stop()
        awaitCondition("Closing playback retained its notification") {
            target.getSystemService(NotificationManager::class.java).activeNotifications.none { it.id == 1001 }
        }
    }

    @Test fun hashNavigationDoesNotLoseThePlaybackChannel() = withPage(true) { _, view ->
        awaitCondition("SPA navigation lost the native playback handshake") { js(view, "window.playbackConnected") == "true" }
    }

    @Test fun theWebBackButtonIsBelowTheSystemStatusBar() = withPage(false) { scenario, view ->
        var safe = false
        scenario.onActivity { activity ->
            val bar = activity.window.decorView.rootWindowInsets.getInsets(WindowInsets.Type.systemBars()).top
            val point = IntArray(2); view.getLocationOnScreen(point)
            safe = point[1] >= bar && bar > 0
        }
        assertTrue("The web back button is covered by the status bar", safe)
        val device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())
        device.wait(Until.findObject(By.text("返回")), 5_000)?.click() ?: error("Back control is inaccessible")
        awaitCondition("A real tap did not reach the web back button") { js(view, "window.backClicked") == "true" }
    }

    @Test fun playbackSurvivesScreenOffAndSupportsOverlayAndLockScreenControls() = withPage(false) { scenario, view ->
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val target = instrumentation.targetContext
        val device = UiDevice.getInstance(instrumentation)
        assertEquals("Playback must work without microphone permission", PackageManager.PERMISSION_DENIED,
            target.checkSelfPermission(Manifest.permission.RECORD_AUDIO))
        assertEquals("This run verifies media notifications with notification permission denied", PackageManager.PERMISSION_DENIED,
            target.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS))
        assertTrue("Grant the emulator overlay app-op before this test", Settings.canDrawOverlays(target))
        device.wait(Until.findObject(By.text("播放本地音频")), 5_000)?.click() ?: error("Play control is inaccessible")
        awaitCondition("The local audio did not begin") { js(view, "player.innerAudioContext.currentTime > 0.1") == "true" }
        var controller: MediaController? = null
        awaitCondition("Playback needs a real media-session notification, including when notification permission is denied") {
            val notification = target.getSystemService(NotificationManager::class.java).activeNotifications.firstOrNull { it.id == 1001 }?.notification
            @Suppress("DEPRECATION")
            val token = notification?.extras?.getParcelable<MediaSession.Token>(Notification.EXTRA_MEDIA_SESSION)
            if (token != null) controller = MediaController(target, token)
            token != null && notification.extras.getString("android.template").orEmpty().contains("MediaStyle")
        }
        val controls = checkNotNull(controller).transportControls
        device.pressHome()
        val pause = device.wait(Until.findObject(By.pkg(target.packageName).desc("暂停播放")), 8_000)
            ?: error("Floating playback controls did not appear over the launcher")
        val title = device.findObject(By.res(target.packageName, "floating_playback_open")) ?: error("Overlay drag handle is inaccessible")
        device.swipe(title.visibleCenter.x, title.visibleCenter.y, device.displayWidth - 1, device.displayHeight - 1, 15)
        val overlayRoot = device.findObject(By.res(target.packageName, "floating_playback_open")).parent.visibleBounds
        assertTrue("Dragging moved the capsule outside the usable display", overlayRoot.left >= 0 && overlayRoot.top > 0 &&
            overlayRoot.right <= device.displayWidth && overlayRoot.bottom <= device.displayHeight)
        screenshot("playback-overlay.png")
        pause.click()
        awaitCondition("The floating pause button did not pause the real player") {
            js(view, "player.innerAudioContext.paused && !player.playing") == "true"
        }
        awaitCondition("A paused player left a foreground playback service") { !isForeground() }
        device.wait(Until.findObject(By.pkg(target.packageName).desc("继续播放")), 5_000)?.click()
            ?: error("The floating play button is inaccessible")
        awaitCondition("Floating resume did not restart the actual audio") {
            js(view, "!player.innerAudioContext.paused && player.playing") == "true" && isForeground()
        }
        val before = js(view, "player.innerAudioContext.currentTime").toDouble()
        device.sleep()
        // No JavaScript evaluation or UI polling during the entire screen-off interval.
        SystemClock.sleep(70_000)
        assertFalse("Playback must not turn the display on", target.getSystemService(PowerManager::class.java).isInteractive)
        assertTrue("The media service stopped while the display was off", isForeground())
        val after = js(view, "player.innerAudioContext.currentTime").toDouble()
        assertTrue("Screen-off playback did not advance: $before -> $after", after - before >= 65)
        assertEquals("The website paused on real visibility change", "false", js(view, "player.innerAudioContext.paused"))
        controls.pause()
        awaitCondition("Lock-screen/media-session pause failed") {
            js(view, "player.innerAudioContext.paused && !player.playing") == "true" && !isForeground()
        }
        assertEquals(PlaybackState.STATE_PAUSED, controller!!.playbackState!!.state)
        controls.seekTo(12_000)
        awaitCondition("Media-session seek did not reach the webpage player") {
            js(view, "Math.abs(player.innerAudioContext.currentTime - 12) < 0.5") == "true"
        }
        controls.play()
        awaitCondition("Lock-screen/media-session resume failed") {
            js(view, "!player.innerAudioContext.paused && player.playing") == "true" && isForeground()
        }
        device.wakeUp(); device.executeShellCommand("wm dismiss-keyguard")
        target.getSystemService(NotificationManager::class.java).activeNotifications.first { it.id == 1001 }.notification.contentIntent.send()
        awaitCondition("The activity did not return") {
            var shown = false
            scenario.onActivity { activity ->
                val id = target.resources.getIdentifier("playback_mini_container", "id", target.packageName)
                shown = id != 0 && activity.findViewById<android.view.View>(id).isShown
            }
            shown
        }
        controls.stop()
        awaitCondition("Stop left audio or a foreground media service") {
            js(view, "player.innerAudioContext.paused") == "true" && !isForeground()
        }
        Log.i("TingwuRecorderTest", "SCREEN_OFF_PLAYBACK before=$before after=$after microphonePermission=denied notificationPermission=denied overlayAndMediaControls=passed")
    }

    private fun awaitMediaController(): MediaController {
        val target = InstrumentationRegistry.getInstrumentation().targetContext
        var controller: MediaController? = null
        awaitCondition("A real media session was not published") {
            val notification = target.getSystemService(NotificationManager::class.java).activeNotifications.firstOrNull { it.id == 1001 }?.notification
            @Suppress("DEPRECATION")
            val token = notification?.extras?.getParcelable<MediaSession.Token>(Notification.EXTRA_MEDIA_SESSION)
            if (token != null) controller = MediaController(target, token)
            token != null
        }
        return checkNotNull(controller)
    }

    private fun screenshot(name: String) {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val bitmap = instrumentation.uiAutomation.takeScreenshot() ?: return
        File(instrumentation.targetContext.getExternalFilesDir(null), name).outputStream().use {
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, it)
        }
        bitmap.recycle()
    }

    private fun withPage(staleFinishedUrl: Boolean, block: (ActivityScenario<Activity>, WebView) -> Unit) {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val target = instrumentation.targetContext
        val device = UiDevice.getInstance(instrumentation)
        device.wakeUp(); device.executeShellCommand("wm dismiss-keyguard")
        val html = instrumentation.context.assets.open("mobile-playback.html").readBytes()
        val wave = silentWave()
        ActivityScenario.launch<Activity>(Intent().setClassName(target.packageName, "com.tingwu.mobile.MainActivity")).use { scenario ->
            lateinit var view: WebView
            try {
                scenario.onActivity { activity ->
                    view = activity.findViewById(target.resources.getIdentifier("web_view", "id", target.packageName))
                    view.stopLoading()
                    val production = view.webViewClient
                    view.webViewClient = object : WebViewClient() {
                        override fun onPageStarted(v: WebView, url: String, icon: Bitmap?) = production.onPageStarted(v, url, icon)
                        override fun onPageFinished(v: WebView, url: String) = production.onPageFinished(v,
                            if (staleFinishedUrl) "https://tingwu.aliyun.com/" else url)
                        override fun doUpdateVisitedHistory(v: WebView, url: String, reload: Boolean) = production.doUpdateVisitedHistory(v, url, reload)
                        override fun shouldInterceptRequest(v: WebView, request: WebResourceRequest): WebResourceResponse {
                            if (request.url.path == "/__tingwu_test__/official-mobile-audio.js") {
                                return WebResourceResponse("application/javascript", "UTF-8", instrumentation.context.assets.open("official-mobile-audio.js"))
                            }
                            if (request.url.path == "/__tingwu_test__/audio.wav") {
                                val range = request.requestHeaders.entries.firstOrNull { it.key.equals("Range", true) }?.value
                                val match = Regex("bytes=(\\d+)-(\\d*)").find(range.orEmpty())
                                val start = match?.groupValues?.get(1)?.toInt()?.coerceAtMost(wave.size - 1) ?: 0
                                val end = match?.groupValues?.get(2)?.toIntOrNull()?.coerceAtMost(wave.size - 1) ?: wave.size - 1
                                val headers = mutableMapOf("Accept-Ranges" to "bytes", "Content-Length" to (end - start + 1).toString())
                                if (match != null) headers["Content-Range"] = "bytes $start-$end/${wave.size}"
                                return WebResourceResponse("audio/wav", null, if (match == null) 200 else 206,
                                    if (match == null) "OK" else "Partial Content", headers, wave.copyOfRange(start, end + 1).inputStream())
                            }
                            return if (request.isForMainFrame) WebResourceResponse("text/html", "UTF-8", html.inputStream())
                            else WebResourceResponse("text/plain", "UTF-8", byteArrayOf().inputStream())
                        }
                    }
                    view.loadUrl("https://tingwu.aliyun.com/#/pages/Meeting/Result?transId=offline-audio")
                }
                awaitCondition("Playback fixture did not initialize") { js(view, "!!window.player") == "true" }
                block(scenario, view)
            } finally {
                device.wakeUp(); device.executeShellCommand("wm dismiss-keyguard")
            }
        }
    }

    private fun silentWave(): ByteArray {
        val bytes = ByteBuffer.allocate(44 + 180 * 8000 * 2).order(ByteOrder.LITTLE_ENDIAN)
        bytes.put("RIFF".toByteArray()).putInt(bytes.capacity() - 8).put("WAVEfmt ".toByteArray())
        bytes.putInt(16).putShort(1).putShort(1).putInt(8000).putInt(16000).putShort(2).putShort(16)
        bytes.put("data".toByteArray()).putInt(bytes.capacity() - 44)
        return bytes.array()
    }

    @Suppress("DEPRECATION")
    private fun isForeground(): Boolean = InstrumentationRegistry.getInstrumentation().targetContext
        .getSystemService(ActivityManager::class.java).getRunningServices(100)
        .any { it.service.className == "com.tingwu.mobile.BackgroundPlaybackService" && it.foreground }

    private fun awaitCondition(message: String, condition: () -> Boolean) {
        val deadline = SystemClock.elapsedRealtime() + 15_000
        while (SystemClock.elapsedRealtime() < deadline) { if (condition()) return; SystemClock.sleep(100) }
        assertTrue(message, condition())
    }

    private fun js(view: WebView, expression: String): String {
        val latch = CountDownLatch(1); var result = ""
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            view.evaluateJavascript(expression) { value -> result = value; latch.countDown() }
        }
        check(latch.await(5, TimeUnit.SECONDS)) { "WebView callback timed out" }
        return result
    }
}
