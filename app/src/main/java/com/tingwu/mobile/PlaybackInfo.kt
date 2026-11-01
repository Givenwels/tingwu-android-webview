package com.tingwu.mobile

import org.json.JSONObject

data class PlaybackInfo(
    val status: String = "idle", val title: String = "", val positionMs: Long = 0,
    val durationMs: Long = 0, val speed: Float = 1f,
) {
    val playing: Boolean get() = status == "playing"
    val visible: Boolean get() = status in setOf("playing", "paused", "buffering", "ended")

    companion object {
        fun parse(data: String?): PlaybackInfo? {
            if (data == null || data.length > 4096) return null
            val json = runCatching { JSONObject(data) }.getOrNull() ?: return null
            if (json.optString("type") != "playback-state") return null
            val status = json.optString("status")
            if (status !in setOf("idle", "playing", "paused", "buffering", "ended", "error")) return null
            val speed = json.optDouble("speed", 1.0).takeIf { it.isFinite() && it in 0.25..4.0 }?.toFloat() ?: 1f
            return PlaybackInfo(status, json.optString("title").trim().take(160),
                json.optLong("positionMs").coerceIn(0, 7 * 24 * 60 * 60 * 1000L),
                json.optLong("durationMs").coerceIn(0, 7 * 24 * 60 * 60 * 1000L), speed)
        }
    }
}
