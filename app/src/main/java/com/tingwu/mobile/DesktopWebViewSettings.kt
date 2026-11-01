package com.tingwu.mobile

import android.webkit.WebSettings
import android.webkit.WebView
import androidx.webkit.UserAgentMetadata
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewFeature

object DesktopWebViewSettings {
    fun apply(settings: WebSettings, desktopViewport: Boolean = true) {
        val originalAgent = settings.userAgentString
        val providerVersion = WebView.getCurrentWebViewPackage()?.versionName
        val chromiumVersion = WebViewCompatibility.chromiumVersion(originalAgent, providerVersion)
        settings.userAgentString =
            WebViewCompatibility.desktopUserAgent(originalAgent, providerVersion)
        settings.useWideViewPort = desktopViewport
        settings.loadWithOverviewMode = desktopViewport

        if (WebViewFeature.isFeatureSupported(WebViewFeature.USER_AGENT_METADATA)) {
            val brands = listOf("Chromium", "Google Chrome").map { brand ->
                UserAgentMetadata.BrandVersion.Builder()
                    .setBrand(brand)
                    .setMajorVersion(chromiumVersion.substringBefore('.'))
                    .setFullVersion(chromiumVersion)
                    .build()
            }
            WebSettingsCompat.setUserAgentMetadata(
                settings,
                UserAgentMetadata.Builder()
                    .setBrandVersionList(brands)
                    .setFullVersion(chromiumVersion)
                    .setPlatform("Windows")
                    .setPlatformVersion("10.0.0")
                    .setMobile(false)
                    .setArchitecture("x86")
                    .setBitness(64)
                    .setModel("")
                    .setWow64(false)
                    .build(),
            )
        }
    }
}
