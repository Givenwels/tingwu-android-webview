package com.tingwu.mobile

import org.junit.Assert.assertFalse
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class WebViewCompatibilityTest {
    @Test
    fun `mobile display mode keeps the original mobile user agent and mobile viewport`() {
        val mobileUserAgent =
            "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro Build/AP2A.240605.024; wv) " +
                "AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 " +
                "Chrome/137.0.7151.115 Mobile Safari/537.36"

        val settings =
            WebViewCompatibility.displaySettings(
                defaultUserAgent = mobileUserAgent,
                desktopCompatibilityEnabled = false,
            )

        assertEquals(mobileUserAgent, settings.userAgent)
        assertFalse(settings.useWideViewPort)
        assertFalse(settings.loadWithOverviewMode)
    }

    @Test
    fun `desktop compatibility mode uses desktop user agent and overview viewport`() {
        val mobileUserAgent =
            "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro Build/AP2A.240605.024; wv) " +
                "AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 " +
                "Chrome/137.0.7151.115 Mobile Safari/537.36"

        val settings =
            WebViewCompatibility.displaySettings(
                defaultUserAgent = mobileUserAgent,
                desktopCompatibilityEnabled = true,
            )

        assertTrue(settings.userAgent.contains("Windows NT 10.0; Win64; x64"))
        assertTrue(settings.userAgent.contains("Chrome/137.0.7151.115"))
        assertTrue(settings.useWideViewPort)
        assertTrue(settings.loadWithOverviewMode)
    }

    @Test
    fun `desktop user agent keeps the installed Chromium version without mobile markers`() {
        val mobileUserAgent =
            "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro Build/AP2A.240605.024; wv) " +
                "AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 " +
                "Chrome/137.0.7151.115 Mobile Safari/537.36"

        val desktopUserAgent = WebViewCompatibility.desktopUserAgent(mobileUserAgent)

        assertTrue(desktopUserAgent.contains("Windows NT 10.0; Win64; x64"))
        assertTrue(desktopUserAgent.contains("Chrome/137.0.7151.115"))
        assertFalse(desktopUserAgent.contains("Android", ignoreCase = true))
        assertFalse(desktopUserAgent.contains("Mobile", ignoreCase = true))
        assertFalse(desktopUserAgent.contains("; wv", ignoreCase = true))
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
