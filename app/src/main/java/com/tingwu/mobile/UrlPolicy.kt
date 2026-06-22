package com.tingwu.mobile

import java.net.URI
import java.net.URLDecoder
import java.nio.charset.StandardCharsets

object UrlPolicy {
    private val trustedMediaDomains =
        setOf(
            "aliyun.com",
            "alibabacloud.com",
            "alipay.com",
        )

    private val blockedExternalSchemes =
        setOf(
            "about",
            "blob",
            "data",
            "file",
            "javascript",
        )

    fun isTrustedMediaOrigin(url: String): Boolean {
        val uri = parseUri(url) ?: return false
        if (!uri.scheme.equals("https", ignoreCase = true)) return false
        val host = uri.host?.lowercase()?.trimEnd('.') ?: return false
        return trustedMediaDomains.any { domain ->
            host == domain || host.endsWith(".$domain")
        }
    }

    fun shouldStayInWebView(url: String): Boolean {
        val scheme = parseUri(url)?.scheme?.lowercase() ?: return false
        return scheme == "http" || scheme == "https"
    }

    fun shouldOpenExternally(url: String): Boolean {
        val scheme = parseUri(url)?.scheme?.lowercase() ?: return false
        return !shouldStayInWebView(url) && scheme !in blockedExternalSchemes
    }

    fun extractBrowserFallback(intentUrl: String): String? {
        if (!intentUrl.startsWith("intent:", ignoreCase = true)) return null
        val encoded =
            Regex("""(?:^|;)S\.browser_fallback_url=([^;]+)""")
                .find(intentUrl)
                ?.groupValues
                ?.getOrNull(1)
                ?: return null
        val decoded =
            runCatching {
                URLDecoder.decode(encoded, StandardCharsets.UTF_8.name())
            }.getOrNull() ?: return null
        return decoded.takeIf(::shouldStayInWebView)
    }

    private fun parseUri(url: String): URI? =
        runCatching { URI(url.trim()) }
            .getOrNull()
            ?.takeIf { it.scheme != null }
}
