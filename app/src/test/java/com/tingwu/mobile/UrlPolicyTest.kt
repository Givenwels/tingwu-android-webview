package com.tingwu.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class UrlPolicyTest {
    @Test
    fun `trusted media origins accept aliyun and tingwu HTTPS hosts`() {
        assertTrue(UrlPolicy.isTrustedMediaOrigin("https://tingwu.aliyun.com/"))
        assertTrue(UrlPolicy.isTrustedMediaOrigin("https://passport.aliyun.com/login"))
        assertTrue(UrlPolicy.isTrustedMediaOrigin("https://example.alibabacloud.com/"))
        assertTrue(UrlPolicy.isTrustedMediaOrigin("https://auth.alipay.com/"))
    }

    @Test
    fun `trusted media origins reject lookalikes HTTP and invalid URLs`() {
        assertFalse(UrlPolicy.isTrustedMediaOrigin("http://tingwu.aliyun.com/"))
        assertFalse(UrlPolicy.isTrustedMediaOrigin("https://aliyun.com.example.org/"))
        assertFalse(UrlPolicy.isTrustedMediaOrigin("https://evilaliyun.com/"))
        assertFalse(UrlPolicy.isTrustedMediaOrigin("not a url"))
    }

    @Test
    fun `web URLs remain inside the WebView`() {
        assertTrue(UrlPolicy.shouldStayInWebView("https://tingwu.aliyun.com/"))
        assertTrue(UrlPolicy.shouldStayInWebView("http://example.com/"))
        assertFalse(UrlPolicy.shouldStayInWebView("intent://login"))
    }

    @Test
    fun `special and custom schemes are external`() {
        assertTrue(UrlPolicy.shouldOpenExternally("intent://login#Intent;scheme=alipays;end"))
        assertTrue(UrlPolicy.shouldOpenExternally("tel:10086"))
        assertTrue(UrlPolicy.shouldOpenExternally("mailto:test@example.com"))
        assertTrue(UrlPolicy.shouldOpenExternally("alipays://platformapi/startapp"))
        assertFalse(UrlPolicy.shouldOpenExternally("https://tingwu.aliyun.com/"))
    }

    @Test
    fun `browser fallback is extracted only for web URLs`() {
        val webFallback =
            "intent://login#Intent;scheme=alipays;" +
                "S.browser_fallback_url=https%3A%2F%2Fpassport.aliyun.com%2Flogin;end"
        val unsafeFallback =
            "intent://login#Intent;scheme=alipays;" +
                "S.browser_fallback_url=javascript%3Aalert%281%29;end"

        assertEquals(
            "https://passport.aliyun.com/login",
            UrlPolicy.extractBrowserFallback(webFallback),
        )
        assertNull(UrlPolicy.extractBrowserFallback(unsafeFallback))
        assertNull(UrlPolicy.extractBrowserFallback("https://tingwu.aliyun.com/"))
    }
}
