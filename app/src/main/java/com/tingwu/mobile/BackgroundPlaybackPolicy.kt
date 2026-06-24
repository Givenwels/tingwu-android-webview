package com.tingwu.mobile

import android.content.pm.ServiceInfo

object BackgroundPlaybackPolicy {
    const val MEDIA_PLAYBACK_SERVICE_TYPE: Int = ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
    const val MICROPHONE_SERVICE_TYPE: Int = ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
    const val WAKE_LOCK_TIMEOUT_MS: Long = 4 * 60 * 60 * 1000L

    fun shouldStartKeepAlive(activityIsFinishing: Boolean): Boolean = !activityIsFinishing

    fun foregroundServiceType(includeMicrophone: Boolean): Int =
        MEDIA_PLAYBACK_SERVICE_TYPE or
            if (includeMicrophone) {
                MICROPHONE_SERVICE_TYPE
            } else {
                0
            }
}
