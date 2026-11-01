package com.tingwu.mobile

import android.text.format.DateUtils
import android.view.View
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.Button
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.doOnAttach
import com.tingwu.mobile.databinding.ActivityMainBinding

class PlaybackMiniController(
    private val binding: ActivityMainBinding,
    onToggle: () -> Unit,
    onOpen: () -> Unit,
    onClose: () -> Unit,
) {
    private var renderedPlaying: Boolean? = null

    init {
        val root = binding.root
        val paddingLeft = root.paddingLeft
        val paddingTop = root.paddingTop
        val paddingRight = root.paddingRight
        val paddingBottom = root.paddingBottom
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val safe = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout(),
            )
            view.setPadding(
                paddingLeft + safe.left,
                paddingTop + safe.top,
                paddingRight + safe.right,
                paddingBottom + safe.bottom,
            )
            // The root owns these edges; preserve any remaining IME insets for the WebView.
            insets.inset(safe)
        }
        root.doOnAttach { ViewCompat.requestApplyInsets(it) }

        binding.playbackToggle.setOnClickListener { onToggle() }
        binding.playbackOpen.setOnClickListener { onOpen() }
        binding.playbackClose.setOnClickListener { onClose() }
        binding.playbackOpen.accessibilityDelegate = object : View.AccessibilityDelegate() {
            override fun onInitializeAccessibilityNodeInfo(host: View, info: AccessibilityNodeInfo) {
                super.onInitializeAccessibilityNodeInfo(host, info)
                info.className = Button::class.java.name
            }
        }
    }

    fun render(
        visible: Boolean,
        playing: Boolean,
        title: String,
        positionMs: Long,
        durationMs: Long,
    ) {
        binding.playbackMiniContainer.visibility = if (visible) View.VISIBLE else View.GONE
        if (!visible) return

        val context = binding.root.context
        val displayTitle = title.trim().ifEmpty { context.getString(R.string.playback_ui_title_fallback) }
        val duration = durationMs.coerceAtLeast(0L)
        val position = positionMs.coerceAtLeast(0L).let {
            if (duration > 0L) it.coerceAtMost(duration) else it
        }
        val positionText = DateUtils.formatElapsedTime(position / 1_000L)
        val durationText = if (duration > 0L) {
            DateUtils.formatElapsedTime(duration / 1_000L)
        } else {
            context.getString(R.string.playback_ui_unknown_duration)
        }
        val timeText = context.getString(R.string.playback_ui_time, positionText, durationText)
        val timeDescription = if (duration > 0L) {
            context.getString(R.string.playback_ui_time_description, positionText, durationText)
        } else {
            context.getString(R.string.playback_ui_time_unknown_description, positionText)
        }
        if (binding.playbackTitle.text.toString() != displayTitle) binding.playbackTitle.text = displayTitle
        if (binding.playbackPosition.text.toString() != timeText) binding.playbackPosition.text = timeText
        val openDescription = context.getString(R.string.playback_ui_open, displayTitle, timeDescription)
        if (binding.playbackOpen.contentDescription != openDescription) {
            binding.playbackOpen.contentDescription = openDescription
        }

        if (renderedPlaying != playing) {
            binding.playbackToggle.setImageResource(
                if (playing) R.drawable.ic_playback_pause else R.drawable.ic_playback_play,
            )
            binding.playbackToggle.contentDescription = context.getString(
                if (playing) R.string.playback_ui_pause else R.string.playback_ui_play,
            )
            renderedPlaying = playing
        }
    }
}
