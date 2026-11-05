package com.tingwu.mobile

/** A snapshot of actual capture state, not a request to start the microphone. */
data class RecordingInfo(
    val status: String = "stopped",
    val title: String = "",
    val elapsedMs: Long = 0,
    val networkUnstable: Boolean = false,
) {
    internal fun normalized(): RecordingInfo {
        val boundedTitle = title.take(MAX_TITLE_LENGTH).map {
            if (it.isISOControl()) ' ' else it
        }.joinToString("").trim().let {
            if (it.lastOrNull()?.isHighSurrogate() == true) it.dropLast(1) else it
        }
        return copy(
            status = status.takeIf { it == "recording" || it == "paused" } ?: "stopped",
            title = boundedTitle,
            elapsedMs = elapsedMs.coerceAtLeast(0),
        )
    }

    internal fun durationText(): String {
        val seconds = elapsedMs.coerceAtLeast(0) / 1_000
        val minutes = (seconds / 60) % 60
        val remainder = (seconds % 60).toString().padStart(2, '0')
        return if (seconds < 3_600) "${minutes.toString().padStart(2, '0')}:$remainder"
        else "${seconds / 3_600}:${minutes.toString().padStart(2, '0')}:$remainder"
    }

    private companion object {
        const val MAX_TITLE_LENGTH = 160
    }
}

/** The monotonic anchor lets SystemUI keep time without application timers or polling. */
internal data class RecordingNotificationState(
    val info: RecordingInfo = RecordingInfo(),
    val sampledAtElapsedRealtimeMs: Long = 0,
) {
    fun at(nowElapsedRealtimeMs: Long): RecordingInfo {
        val safe = info.normalized()
        if (safe.status != "recording") return safe
        val delta = (nowElapsedRealtimeMs.coerceAtLeast(0) - sampledAtElapsedRealtimeMs.coerceAtLeast(0))
            .coerceAtLeast(0)
        return safe.copy(elapsedMs = safe.elapsedMs + delta.coerceAtMost(Long.MAX_VALUE - safe.elapsedMs))
    }

    fun transition(status: String, nowElapsedRealtimeMs: Long): RecordingNotificationState =
        RecordingNotificationState(at(nowElapsedRealtimeMs).copy(status = status).normalized(), nowElapsedRealtimeMs)

    fun needsRefresh(displayed: RecordingNotificationState, nowElapsedRealtimeMs: Long): Boolean {
        val current = at(nowElapsedRealtimeMs)
        val previous = displayed.at(nowElapsedRealtimeMs)
        if (current.copy(elapsedMs = 0) != previous.copy(elapsedMs = 0)) return true
        val difference = if (current.elapsedMs >= previous.elapsedMs) current.elapsedMs - previous.elapsedMs
        else previous.elapsedMs - current.elapsedMs
        // Avoid reposting merely because the page emits an elapsed-only snapshot every 15 seconds.
        return difference > if (current.status == "recording") 1_000L else 0L
    }
}
