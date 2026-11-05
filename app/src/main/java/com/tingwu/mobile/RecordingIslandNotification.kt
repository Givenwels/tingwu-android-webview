package com.tingwu.mobile

/**
 * Pure Xiaomi focus/island payload builder. No SDK, credentials, permissions or Android runtime.
 * Schema: https://dev.mi.com/xiaomihyperos/documentation/detail?pId=2131
 * Linked 小米超级岛模板库20260129.pdf: expanded recording template 13 (p14), highlightInfo
 * and timerInfo (pp36-37), actions (pp47-49), compact template 6 (p86), sameWidthDigitInfo
 * (pp106-107), imageTextInfoLeft (pp95-96), small-island picInfo (p110).
 * Field tables document timerSystemCurrent; some illustrative JSON has a timerCurrent typo.
 */
internal object RecordingIslandNotification {
    const val EXTRA_PARAM = "miui.focus.param"
    const val EXTRA_ACTIONS = "miui.focus.actions"
    const val EXTRA_PICS = "miui.focus.pics"
    const val PIC_RECORDING = "miui.focus.pic_recording"
    const val ACTION_PAUSE = "miui.focus.action_recording_pause"
    const val ACTION_RESUME = "miui.focus.action_recording_resume"
    const val ACTION_RETURN = "miui.focus.action_recording_return"
    const val ACTION_STOP_CONFIRM = "miui.focus.action_recording_stop_confirm"

    fun isSupported(manufacturer: String, brand: String, protocolVersion: Int, hasPermission: Boolean): Boolean =
        protocolVersion >= 2 && hasPermission && listOf(manufacturer, brand).any { value ->
            listOf("xiaomi", "redmi", "poco").any { it.equals(value, ignoreCase = true) }
        }

    fun payload(
        info: RecordingInfo,
        statusText: String,
        networkText: String,
        nowWallTimeMs: Long,
        protocolVersion: Int = 3,
    ): Map<String, Any>? {
        val safe = info.normalized()
        if (safe.status == "stopped" || protocolVersion < 2) return null
        val timer = mapOf<String, Any>(
            "timerType" to if (safe.status == "recording") 1 else 2,
            "timerWhen" to nowWallTimeMs.coerceAtLeast(0) - safe.elapsedMs,
            "timerTotal" to safe.elapsedMs,
            "timerSystemCurrent" to nowWallTimeMs.coerceAtLeast(0),
        )
        val pic = mapOf("type" to 1, "pic" to PIC_RECORDING)
        val param = linkedMapOf<String, Any>(
            "protocol" to 1,
            "business" to "recording",
            "updatable" to true,
            "timeout" to 360,
            "reopen" to "reopen",
            "enableFloat" to false,
            "islandFirstFloat" to false,
            "filterWhenNoPermission" to false,
            "ticker" to statusText,
            "aodTitle" to statusText,
            "highlightInfo" to mapOf(
                "timerInfo" to timer,
                "picFunction" to PIC_RECORDING,
                "content" to safe.title,
                "subContent" to if (safe.networkUnstable) "$statusText · $networkText" else statusText,
            ),
            "actions" to listOf(
                mapOf("action" to if (safe.status == "recording") ACTION_PAUSE else ACTION_RESUME),
                mapOf("action" to ACTION_RETURN),
                mapOf("action" to ACTION_STOP_CONFIRM),
            ),
        )
        if (protocolVersion >= 3) {
            param["param_island"] = mapOf(
                "islandProperty" to 2,
                "islandTimeout" to 21_600,
                "islandOrder" to false,
                "bigIslandArea" to mapOf(
                    "imageTextInfoLeft" to mapOf(
                        "type" to 1,
                        "picInfo" to pic,
                        "textInfo" to mapOf("title" to statusText),
                    ),
                    "sameWidthDigitInfo" to mapOf("timerInfo" to timer),
                ),
                "smallIslandArea" to mapOf("picInfo" to pic),
            )
        }
        return mapOf("param_v2" to param)
    }

    fun buildJson(
        info: RecordingInfo,
        statusText: String,
        networkText: String,
        nowWallTimeMs: Long,
        protocolVersion: Int = 3,
    ): String? = payload(info, statusText, networkText, nowWallTimeMs, protocolVersion)?.let(::json)

    // Fixed schema and primitive values only; avoids Android's mocked org.json in local unit tests.
    private fun json(value: Any): String = when (value) {
        is String -> buildString {
            append('"')
            for (char in value) when (char) {
                '"' -> append("\\\"")
                '\\' -> append("\\\\")
                else -> if (char.code < 0x20 || char.isSurrogate()) {
                    append("\\u").append(char.code.toString(16).padStart(4, '0'))
                } else append(char)
            }
            append('"')
        }
        is Map<*, *> -> value.entries.joinToString(",", "{", "}") { (key, item) -> json(key as String) + ":" + json(item!!) }
        is List<*> -> value.joinToString(",", "[", "]") { json(it!!) }
        is Long, is Int, is Boolean -> value.toString()
        else -> error("Unsupported focus notification value")
    }
}
