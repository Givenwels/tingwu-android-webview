package com.tingwu.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RecordingIslandNotificationTest {
    private val wallTime = 1_800_000_000_000L

    @Test
    fun `Xiaomi extras require a supported Xiaomi family device and focus permission`() {
        assertTrue(RecordingIslandNotification.isSupported("Xiaomi", "Xiaomi", 3, true))
        assertTrue(RecordingIslandNotification.isSupported("Xiaomi", "POCO", 2, true))
        assertTrue(RecordingIslandNotification.isSupported("Redmi", "Redmi", 3, true))
        assertFalse(RecordingIslandNotification.isSupported("Google", "Pixel", 3, true))
        assertFalse(RecordingIslandNotification.isSupported("Xiaomi", "Xiaomi", 1, true))
        assertFalse(RecordingIslandNotification.isSupported("Xiaomi", "Xiaomi", 3, false))
    }

    @Test
    fun `recording uses documented timer fields in expanded content and compact island`() {
        val payload = payload(RecordingInfo("recording", "Meeting", 65_432))
        val param = payload.child("param_v2")
        assertEquals("recording", param["business"])
        assertEquals(false, param["filterWhenNoPermission"])
        assertEquals(true, param["updatable"])
        assertEquals(false, param["enableFloat"])
        assertEquals(360, param["timeout"])
        assertEquals("Recording", param.child("highlightInfo")["subContent"])
        assertEquals("Meeting", param.child("highlightInfo")["content"])
        val timer = param.child("highlightInfo").child("timerInfo")
        assertEquals(1, timer["timerType"])
        assertEquals(wallTime - 65_432, timer["timerWhen"])
        assertEquals(65_432L, timer["timerTotal"])
        assertEquals(wallTime, timer["timerSystemCurrent"])
        assertFalse(timer.containsKey("timerCurrent")) // PDF examples have a typo; its field tables use timerSystemCurrent.
        val island = param.child("param_island")
        assertEquals(21_600, island["islandTimeout"])
        assertEquals(false, island["islandOrder"])
        val big = island.child("bigIslandArea")
        assertEquals("Recording", big.child("imageTextInfoLeft").child("textInfo")["title"])
        assertEquals(timer, big.child("sameWidthDigitInfo").child("timerInfo"))
        assertEquals(RecordingIslandNotification.PIC_RECORDING, island.child("smallIslandArea").child("picInfo")["pic"])
    }

    @Test
    fun `recording expanded actions use native pause and non destructive page controls`() {
        val actions = payload(RecordingInfo("recording")).child("param_v2")["actions"] as List<*>
        assertEquals(listOf(
            mapOf("action" to RecordingIslandNotification.ACTION_PAUSE),
            mapOf("action" to RecordingIslandNotification.ACTION_RETURN),
            mapOf("action" to RecordingIslandNotification.ACTION_STOP_CONFIRM),
        ), actions)
    }

    @Test
    fun `paused island freezes the timer and exposes visible activity resume`() {
        val param = payload(RecordingInfo("paused", "Meeting", 65_432), "Paused").child("param_v2")
        val timer = param.child("highlightInfo").child("timerInfo")
        assertEquals(2, timer["timerType"])
        assertEquals(65_432L, timer["timerTotal"])
        assertEquals("Paused", param.child("highlightInfo")["subContent"])
        val firstAction = (param["actions"] as List<*>).first()
        assertEquals(mapOf("action" to RecordingIslandNotification.ACTION_RESUME), firstAction)
    }

    @Test
    fun `network instability appears alongside the actual capture status`() {
        val param = payload(RecordingInfo("recording", networkUnstable = true)).child("param_v2")
        assertEquals("Recording · Network unstable", param.child("highlightInfo")["subContent"])
        assertEquals("Recording", param["ticker"])
    }

    @Test
    fun `OS2 gets the documented focus template without an OS3 island`() {
        val param = payload(RecordingInfo("recording"), version = 2).child("param_v2")
        assertTrue(param.containsKey("highlightInfo"))
        assertFalse(param.containsKey("param_island"))
    }

    @Test
    fun `stopped invalid and unsupported snapshots cannot advertise an island`() {
        assertNull(RecordingIslandNotification.buildJson(RecordingInfo(), "Stopped", "", wallTime))
        assertNull(RecordingIslandNotification.buildJson(RecordingInfo("unknown"), "Unknown", "", wallTime))
        assertNull(RecordingIslandNotification.buildJson(RecordingInfo("recording"), "Recording", "", wallTime, 1))
    }

    @Test
    fun `JSON bounds and escapes untrusted titles without inserting payload keys`() {
        val json = RecordingIslandNotification.buildJson(
            RecordingInfo("recording", "\"},\"cancel\":true,\\" + "x".repeat(5_000)), "Recording", "", wallTime,
        )!!
        assertTrue(json.contains("\\\"cancel\\\":true"))
        assertTrue(json.contains("\\\\"))
        assertFalse(json.contains("\"cancel\":true"))
        assertTrue(json.length < 3_000)
    }

    private fun payload(info: RecordingInfo, status: String = "Recording", version: Int = 3): Map<String, Any> =
        RecordingIslandNotification.payload(info, status, "Network unstable", wallTime, version)!!

    @Suppress("UNCHECKED_CAST")
    private fun Map<String, Any>.child(key: String): Map<String, Any> = getValue(key) as Map<String, Any>
}
