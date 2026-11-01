package com.tingwu.mobile

import org.junit.Assert.assertFalse
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class WebViewCompatibilityTest {
    @Test
    fun `desktop profile removes Android mobile and WebView markers while retaining Chromium version`() {
        val mobileAgent = "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 " +
            "Chrome/137.0.7151.115 Mobile Safari/537.36"
        val desktopAgent = WebViewCompatibility.desktopUserAgent(mobileAgent)

        assertTrue(desktopAgent.contains("Windows NT 10.0; Win64; x64"))
        assertTrue(desktopAgent.contains("Chrome/137.0.7151.115"))
        assertFalse(desktopAgent.contains("Android"))
        assertFalse(desktopAgent.contains("Mobile"))
        assertFalse(desktopAgent.contains("; wv"))
        assertEquals("137.0.7151.115", WebViewCompatibility.chromiumVersion(mobileAgent))
    }

    @Test
    fun `desktop Chromium version can fall back to installed provider version`() {
        assertEquals(
            "138.0.7204.168",
            WebViewCompatibility.chromiumVersion("unknown", "138.0.7204.168"),
        )
    }

    @Test
    fun `screen lock and ordinary backgrounding do not pause the WebView`() {
        assertFalse(WebViewCompatibility.shouldPauseWebView(activityIsFinishing = false))
    }

    @Test
    fun `finishing the activity pauses the WebView`() {
        assertTrue(WebViewCompatibility.shouldPauseWebView(activityIsFinishing = true))
    }
}
