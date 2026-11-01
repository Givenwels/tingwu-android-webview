package com.tingwu.mobile

import android.content.ComponentCallbacks
import android.content.Context
import android.content.res.Configuration
import android.graphics.PixelFormat
import android.graphics.Point
import android.graphics.Rect
import android.hardware.display.DisplayManager
import android.os.Build
import android.provider.Settings
import android.text.format.DateUtils
import android.view.Display
import android.view.Gravity
import android.view.LayoutInflater
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.WindowInsets
import android.view.WindowManager
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.Button
import com.tingwu.mobile.databinding.PlaybackFloatingBinding
import kotlin.math.roundToInt

/** Main-thread renderer. The caller owns session, background and preference eligibility. */
class PlaybackOverlayController(
    context: Context,
    private val onToggle: () -> Unit,
    private val onOpen: () -> Unit,
    private val onClose: () -> Unit,
) {
    private val appContext = context.applicationContext
    private val windowContext: Context by lazy {
        val display = appContext.getSystemService(DisplayManager::class.java)
            ?.getDisplay(Display.DEFAULT_DISPLAY)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && display != null) {
            appContext.createDisplayContext(display)
                .createWindowContext(WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY, null)
        } else {
            appContext
        }
    }
    private val windowManager by lazy { windowContext.getSystemService(WindowManager::class.java) }
    private val params = WindowManager.LayoutParams(
        0,
        WindowManager.LayoutParams.WRAP_CONTENT,
        WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
        PixelFormat.TRANSLUCENT,
    ).apply {
        gravity = Gravity.TOP or Gravity.LEFT
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_NEVER
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            setFitInsetsTypes(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
            setFitInsetsIgnoringVisibility(true)
        }
    }
    private var binding: PlaybackFloatingBinding? = null
    private var windowAdded = false
    private var callbacksRegistered = false
    private var positioned = false
    private var disposed = false
    private var renderedPlaying: Boolean? = null

    private val configurationCallbacks = object : ComponentCallbacks {
        override fun onConfigurationChanged(newConfig: Configuration) {
            refreshGeometry()
        }

        override fun onLowMemory() = Unit
    }
    private val layoutListener = View.OnLayoutChangeListener { _, _, _, _, _, _, _, _, _ ->
        refreshGeometry()
    }
    private val attachListener = object : View.OnAttachStateChangeListener {
        override fun onViewAttachedToWindow(view: View) = Unit

        override fun onViewDetachedFromWindow(view: View) {
            if (binding?.root === view) removeWindow()
        }
    }

    fun render(
        visible: Boolean,
        playing: Boolean,
        title: String,
        positionMs: Long,
        durationMs: Long,
    ) {
        if (disposed) return
        if (!visible || !canDrawOverlays()) {
            removeWindow()
            return
        }
        try {
            val views = binding ?: createViews().also { binding = it }
            val displayTitle = title.trim().ifEmpty { appContext.getString(R.string.playback_ui_title_fallback) }
            val duration = durationMs.coerceAtLeast(0L)
            val position = positionMs.coerceAtLeast(0L).let {
                if (duration > 0L) it.coerceAtMost(duration) else it
            }
            val positionText = DateUtils.formatElapsedTime(position / 1_000L)
            val durationText = if (duration > 0L) {
                DateUtils.formatElapsedTime(duration / 1_000L)
            } else {
                appContext.getString(R.string.playback_ui_unknown_duration)
            }
            val timeText = appContext.getString(R.string.playback_ui_time, positionText, durationText)
            val timeDescription = if (duration > 0L) {
                appContext.getString(R.string.playback_ui_time_description, positionText, durationText)
            } else {
                appContext.getString(R.string.playback_ui_time_unknown_description, positionText)
            }
            if (views.floatingPlaybackTitle.text.toString() != displayTitle) views.floatingPlaybackTitle.text = displayTitle
            if (views.floatingPlaybackPosition.text.toString() != timeText) views.floatingPlaybackPosition.text = timeText
            val openDescription = appContext.getString(R.string.playback_ui_floating_open, displayTitle, timeDescription)
            if (views.floatingPlaybackOpen.contentDescription != openDescription) {
                views.floatingPlaybackOpen.contentDescription = openDescription
            }
            if (renderedPlaying != playing) {
                views.floatingPlaybackToggle.setImageResource(
                    if (playing) R.drawable.ic_playback_pause else R.drawable.ic_playback_play,
                )
                views.floatingPlaybackToggle.contentDescription = appContext.getString(
                    if (playing) R.string.playback_ui_pause else R.string.playback_ui_play,
                )
                renderedPlaying = playing
            }
            if (!refreshGeometry()) return
            if (!windowAdded) {
                if (!canDrawOverlays()) {
                    removeWindow()
                    return
                }
                params.setTitle(appContext.getString(R.string.playback_ui_floating_window_title))
                windowManager.addView(views.root, params)
                windowAdded = true
                windowContext.registerComponentCallbacks(configurationCallbacks)
                callbacksRegistered = true
                views.root.requestApplyInsets()
            }
        } catch (_: RuntimeException) {
            // Permission can change between the check and add/updateViewLayout.
            removeWindow()
        }
    }

    fun dispose() {
        if (disposed) return
        disposed = true
        removeWindow()
    }

    private fun createViews(): PlaybackFloatingBinding {
        val views = PlaybackFloatingBinding.inflate(LayoutInflater.from(windowContext))
        views.floatingPlaybackToggle.setOnClickListener { userAction(onToggle) }
        views.floatingPlaybackClose.setOnClickListener { userAction(onClose) }
        views.floatingPlaybackOpen.setOnClickListener { userAction(onOpen) }
        views.floatingPlaybackOpen.accessibilityDelegate = object : View.AccessibilityDelegate() {
            override fun onInitializeAccessibilityNodeInfo(host: View, info: AccessibilityNodeInfo) {
                super.onInitializeAccessibilityNodeInfo(host, info)
                info.className = Button::class.java.name
            }
        }
        installDragHandle(views.floatingPlaybackOpen)
        views.root.addOnLayoutChangeListener(layoutListener)
        views.root.addOnAttachStateChangeListener(attachListener)
        views.root.setOnApplyWindowInsetsListener { _, insets ->
            refreshGeometry()
            insets
        }
        return views
    }

    private fun installDragHandle(handle: View) {
        val touchSlop = ViewConfiguration.get(windowContext).scaledTouchSlop
        var downX = 0f
        var downY = 0f
        var startX = 0
        var startY = 0
        var dragging = false
        var cancelled = false
        handle.setOnTouchListener { view, event ->
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    downX = event.rawX
                    downY = event.rawY
                    startX = params.x
                    startY = params.y
                    dragging = false
                    cancelled = false
                    view.isPressed = true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = event.rawX - downX
                    val dy = event.rawY - downY
                    if (!cancelled && (dragging || dx * dx + dy * dy > touchSlop * touchSlop)) {
                        dragging = true
                        view.isPressed = false
                        refreshGeometry(startX + dx.roundToInt(), startY + dy.roundToInt())
                    }
                }
                MotionEvent.ACTION_UP -> {
                    view.isPressed = false
                    if (!dragging && !cancelled) view.performClick()
                    cancelled = true
                }
                MotionEvent.ACTION_CANCEL, MotionEvent.ACTION_POINTER_DOWN -> {
                    view.isPressed = false
                    cancelled = true
                }
            }
            true
        }
    }

    private fun userAction(action: () -> Unit) {
        if (!disposed && windowAdded && canDrawOverlays()) action() else removeWindow()
    }

    private fun canDrawOverlays(): Boolean = try {
        Settings.canDrawOverlays(appContext)
    } catch (_: RuntimeException) {
        false
    }

    private fun dp(value: Int): Int = (value * windowContext.resources.displayMetrics.density).roundToInt()

    @Suppress("DEPRECATION")
    private fun availableSize(root: View): Point {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val metrics = windowManager.maximumWindowMetrics
            val safe = metrics.windowInsets.getInsetsIgnoringVisibility(
                WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout(),
            )
            return Point(
                metrics.bounds.width() - safe.left - safe.right,
                metrics.bounds.height() - safe.top - safe.bottom,
            )
        }
        val size = Point()
        windowManager.defaultDisplay.getSize(size)
        if (root.isAttachedToWindow) {
            val visibleFrame = Rect()
            root.getWindowVisibleDisplayFrame(visibleFrame)
            if (!visibleFrame.isEmpty) {
                size.x = minOf(size.x, visibleFrame.width())
                size.y = minOf(size.y, visibleFrame.height())
            }
        }
        return size
    }

    private fun refreshGeometry(desiredX: Int = params.x, desiredY: Int = params.y): Boolean {
        val root = binding?.root ?: return false
        if (disposed || !canDrawOverlays()) {
            removeWindow()
            return false
        }
        return try {
            val size = availableSize(root)
            val margin = dp(8)
            if (size.x < dp(180) || size.y < dp(80)) {
                removeWindow()
                return false
            }
            val width = minOf(dp(320), size.x - margin * 2)
            root.measure(
                View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY),
                View.MeasureSpec.makeMeasureSpec(size.y - margin * 2, View.MeasureSpec.AT_MOST),
            )
            // WindowManager fits bars/cutouts, so x/y are relative to the safe frame.
            val x = (if (positioned) desiredX else (size.x - width) / 2)
                .coerceIn(margin, (size.x - width - margin).coerceAtLeast(margin))
            val y = (if (positioned) desiredY else margin)
                .coerceIn(margin, (size.y - root.measuredHeight - margin).coerceAtLeast(margin))
            val changed = params.width != width || params.x != x || params.y != y
            params.width = width
            params.x = x
            params.y = y
            positioned = true
            if (windowAdded && changed) windowManager.updateViewLayout(root, params)
            true
        } catch (_: RuntimeException) {
            removeWindow()
            false
        }
    }

    private fun removeWindow() {
        val views = binding
        binding = null
        windowAdded = false
        renderedPlaying = null
        if (callbacksRegistered) {
            callbacksRegistered = false
            runCatching { windowContext.unregisterComponentCallbacks(configurationCallbacks) }
        }
        if (views == null) return
        views.root.removeOnLayoutChangeListener(layoutListener)
        views.root.removeOnAttachStateChangeListener(attachListener)
        views.root.setOnApplyWindowInsetsListener(null)
        views.floatingPlaybackOpen.setOnTouchListener(null)
        views.floatingPlaybackOpen.setOnClickListener(null)
        views.floatingPlaybackOpen.accessibilityDelegate = null
        views.floatingPlaybackToggle.setOnClickListener(null)
        views.floatingPlaybackClose.setOnClickListener(null)
        views.root.visibility = View.GONE
        runCatching { windowManager.removeViewImmediate(views.root) }
    }
}
