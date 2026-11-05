package com.tingwu.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class RecordingInfoTest {
    @Test
    fun `default snapshot cannot advertise a live microphone`() {
        val type = try {
            Class.forName("com.tingwu.mobile.RecordingInfo")
        } catch (_: ClassNotFoundException) {
            fail("RecordingInfo must provide a safe stopped default snapshot")
            return
        }
        val info = type.getDeclaredConstructor().newInstance()
        assertEquals("stopped", type.getMethod("getStatus").invoke(info))
        assertEquals("", type.getMethod("getTitle").invoke(info))
        assertEquals(0L, type.getMethod("getElapsedMs").invoke(info))
        assertEquals(false, type.getMethod("getNetworkUnstable").invoke(info))
    }

    @Test
    fun `unrecognized statuses fail closed and negative time is clamped`() {
        val info = RecordingInfo("resuming", "  Meeting\nnotes  ", -1, true).normalized()
        assertEquals("stopped", info.status)
        assertEquals(0L, info.elapsedMs)
        assertEquals("Meeting notes", info.title)
        assertTrue(info.networkUnstable)
    }

    @Test
    fun `notification title is bounded without splitting a surrogate pair`() {
        val info = RecordingInfo(title = "a".repeat(159) + "\uD83D\uDE00" + "b".repeat(200)).normalized()
        assertEquals("a".repeat(159), info.title)
    }

    @Test
    fun `elapsed advances using monotonic time without a heartbeat`() {
        val state = RecordingNotificationState(RecordingInfo("recording", elapsedMs = 12_345), 100_000)
        assertEquals(27_345L, state.at(115_000).elapsedMs)
        assertEquals(12_345L, state.at(99_000).elapsedMs)
    }

    @Test
    fun `pausing freezes elapsed and resuming excludes the paused interval`() {
        val active = RecordingNotificationState(RecordingInfo("recording", elapsedMs = 12_345), 100_000)
        val paused = active.transition("paused", 115_000)
        assertEquals(27_345L, paused.at(200_000).elapsedMs)
        val resumed = paused.transition("recording", 200_000)
        assertEquals(32_345L, resumed.at(205_000).elapsedMs)
    }

    @Test
    fun `stopped snapshots never accrue elapsed`() {
        val stopped = RecordingNotificationState(RecordingInfo("stopped", elapsedMs = 1_000), 2_000)
        assertEquals(1_000L, stopped.at(50_000).elapsedMs)
    }

    @Test
    fun `elapsed addition saturates instead of overflowing`() {
        val state = RecordingNotificationState(RecordingInfo("recording", elapsedMs = Long.MAX_VALUE - 1), 0)
        assertEquals(Long.MAX_VALUE, state.at(10).elapsedMs)
    }

    @Test
    fun `elapsed formatting preserves hours and truncates subsecond remainder`() {
        assertEquals("00:00", RecordingInfo(elapsedMs = -1).durationText())
        assertEquals("01:05", RecordingInfo(elapsedMs = 65_999).durationText())
        assertEquals("2:01:05", RecordingInfo(elapsedMs = 7_265_999).durationText())
    }

    @Test
    fun `elapsed only snapshots leave an accurate native chronometer alone`() {
        val displayed = RecordingNotificationState(RecordingInfo("recording", "Meeting", 10_000), 100_000)
        val next = RecordingNotificationState(RecordingInfo("recording", "Meeting", 25_200), 115_000)
        assertFalse(next.needsRefresh(displayed, 115_000))
        assertTrue(next.copy(info = next.info.copy(elapsedMs = 27_000)).needsRefresh(displayed, 115_000))
        assertTrue(next.copy(info = next.info.copy(title = "New title")).needsRefresh(displayed, 115_000))
        assertTrue(next.copy(info = next.info.copy(networkUnstable = true)).needsRefresh(displayed, 115_000))
        assertTrue(next.transition("paused", 115_000).needsRefresh(displayed, 115_000))
    }

    @Test
    fun `paused elapsed corrections are always visible`() {
        val displayed = RecordingNotificationState(RecordingInfo("paused", elapsedMs = 10_000), 100_000)
        val next = displayed.copy(info = displayed.info.copy(elapsedMs = 10_500))
        assertTrue(next.needsRefresh(displayed, 115_000))
    }
}
