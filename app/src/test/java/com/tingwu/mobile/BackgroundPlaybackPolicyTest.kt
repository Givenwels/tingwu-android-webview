package com.tingwu.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BackgroundPlaybackPolicyTest {
    @Test
    fun `screen lock and ordinary backgrounding start keep alive service`() {
        assertTrue(BackgroundPlaybackPolicy.shouldStartKeepAlive(activityIsFinishing = false))
    }

    @Test
    fun `finishing activity does not start keep alive service`() {
        assertFalse(BackgroundPlaybackPolicy.shouldStartKeepAlive(activityIsFinishing = true))
    }

    @Test
    fun `foreground service type always includes media playback`() {
        val type = BackgroundPlaybackPolicy.foregroundServiceType(includeMicrophone = false)

        assertEquals(
            BackgroundPlaybackPolicy.MEDIA_PLAYBACK_SERVICE_TYPE,
            type and BackgroundPlaybackPolicy.MEDIA_PLAYBACK_SERVICE_TYPE,
        )
    }

    @Test
    fun `foreground service type includes microphone only when requested`() {
        val mediaOnly = BackgroundPlaybackPolicy.foregroundServiceType(includeMicrophone = false)
        val mediaWithMicrophone = BackgroundPlaybackPolicy.foregroundServiceType(includeMicrophone = true)

        assertEquals(0, mediaOnly and BackgroundPlaybackPolicy.MICROPHONE_SERVICE_TYPE)
        assertEquals(
            BackgroundPlaybackPolicy.MICROPHONE_SERVICE_TYPE,
            mediaWithMicrophone and BackgroundPlaybackPolicy.MICROPHONE_SERVICE_TYPE,
        )
    }
}
