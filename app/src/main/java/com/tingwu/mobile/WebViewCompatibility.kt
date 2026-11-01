package com.tingwu.mobile

object WebViewCompatibility {
    private val chromiumPattern = Regex("""Chrome/([\d.]+)""")
    private val versionPattern = Regex("""\d+\.\d+\.\d+\.\d+""")

    fun chromiumVersion(defaultUserAgent: String, providerVersion: String? = null): String =
        chromiumPattern.find(defaultUserAgent)?.groupValues?.get(1)
            ?: versionPattern.find(providerVersion.orEmpty())?.value
            ?: "120.0.0.0"

    fun desktopUserAgent(defaultUserAgent: String, providerVersion: String? = null): String =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Chrome/${chromiumVersion(defaultUserAgent, providerVersion)} Safari/537.36"

    fun shouldPauseWebView(activityIsFinishing: Boolean): Boolean = activityIsFinishing
}
