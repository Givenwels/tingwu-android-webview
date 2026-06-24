package com.tingwu.mobile

object WebViewCompatibility {
    private val chromiumVersionPattern = Regex("""Chrome/[\d.]+""")

    data class DisplaySettings(
        val userAgent: String,
        val useWideViewPort: Boolean,
        val loadWithOverviewMode: Boolean,
    )

    fun displaySettings(
        defaultUserAgent: String,
        desktopCompatibilityEnabled: Boolean,
    ): DisplaySettings =
        if (desktopCompatibilityEnabled) {
            DisplaySettings(
                userAgent = desktopUserAgent(defaultUserAgent),
                useWideViewPort = true,
                loadWithOverviewMode = true,
            )
        } else {
            DisplaySettings(
                userAgent = defaultUserAgent,
                useWideViewPort = false,
                loadWithOverviewMode = false,
            )
        }

    fun desktopUserAgent(defaultUserAgent: String): String {
        val chromiumVersion =
            chromiumVersionPattern.find(defaultUserAgent)?.value
                ?: "Chrome/120.0.0.0"

        return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) " +
            "$chromiumVersion Safari/537.36"
    }

    fun shouldPauseWebView(activityIsFinishing: Boolean): Boolean = activityIsFinishing
}
