package com.tingwu.mobile

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.content.pm.PackageManager
import android.graphics.drawable.Icon
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.provider.Settings
import androidx.annotation.MainThread
import androidx.core.content.ContextCompat
import java.lang.ref.WeakReference
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/** Protects an already-running, user-started web recording. It never opens the microphone. */
class RecordingForegroundService : Service() {
    private var recording = false
    private var destroyed = false
    private var wakeLock: PowerManager.WakeLock? = null
    private var permissionExecutor: ExecutorService? = null
    private var permissionQueryPending = false
    private val mainHandler = Handler(Looper.getMainLooper())
    private val screenReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) = updateWakeLock()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        instance = WeakReference(this)
        ensureChannel(this)
        ContextCompat.registerReceiver(this, screenReceiver, IntentFilter().apply {
            addAction(Intent.ACTION_SCREEN_ON)
            addAction(Intent.ACTION_SCREEN_OFF)
        }, ContextCompat.RECEIVER_NOT_EXPORTED)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                if (owner?.get() == null || state.info.status != "recording") {
                    stopSelfResult(startId)
                    return START_NOT_STICKY
                }
                try {
                    // Always establish microphone protection using the ordinary notification first.
                    val notification = notification(this, withFocus = false)
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                        startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
                    } else startForeground(NOTIFICATION_ID, notification)
                    recording = true
                    displayed = state
                    updateWakeLock()
                    queryFocusPermission()
                } catch (_: RuntimeException) {
                    val activity = owner?.get()
                    stop(this)
                    activity?.onRecordingProtectionFailed()
                }
            }
            ACTION_PAUSE_COMMAND -> {
                val activity = owner?.get()
                if (activity == null) stop(this)
                else if (recording && state.info.status == "recording") {
                    // Wait for real capture-state confirmation before releasing protection.
                    activity.onRecordingCommand("pause-recording")
                } else stopSelfResult(startId)
            }
            else -> if (!recording) stopSelfResult(startId)
        }
        // Neither a process restart nor a reboot may silently resume a microphone session.
        return START_NOT_STICKY
    }

    /** One asynchronous capability/permission lookup per start, never on the FGS critical path. */
    private fun queryFocusPermission() {
        if (permissionQueryPending || !RecordingIslandNotification.isSupported(
                Build.MANUFACTURER, Build.BRAND, 2, true,
            )) return
        permissionQueryPending = true
        val generation = sessionGeneration
        val app = applicationContext
        val executor = permissionExecutor ?: Executors.newSingleThreadExecutor { task ->
            Thread(task, "RecordingFocusPermission").apply { isDaemon = true }
        }.also { permissionExecutor = it }
        executor.execute {
            @Suppress("DEPRECATION")
            val configuredAppId = try {
                app.packageManager.getApplicationInfo(app.packageName, PackageManager.GET_META_DATA)
                    .metaData?.get("com.xiaomi.xms.APP_ID")?.toString().orEmpty().isNotBlank()
            } catch (_: RuntimeException) { false }
            val protocol = if (!configuredAppId) 0 else try {
                Settings.System.getInt(app.contentResolver, "notification_focus_protocol", 0)
            } catch (_: RuntimeException) { 0 }
            val allowed = protocol >= 2 && try {
                app.contentResolver.call(
                    Uri.parse("content://miui.statusbar.notification.public"), "canShowFocus", null,
                    Bundle().apply { putString("package", app.packageName) },
                )?.getBoolean("canShowFocus", false) == true
            } catch (_: RuntimeException) { false }
            mainHandler.post {
                permissionQueryPending = false
                if (!destroyed && generation == sessionGeneration && instance?.get() === this) {
                    focusProtocol = protocol
                    focusAllowed = allowed
                    if (allowed && recording) postNotification(this, force = true)
                }
            }
        }
    }

    private fun leaveForeground() {
        recording = false
        releaseWakeLock()
        // Detach first: the same ID now holds paused controls without microphone FGS.
        stopForeground(STOP_FOREGROUND_DETACH)
    }

    private fun updateWakeLock() {
        val power = getSystemService(PowerManager::class.java)
        if (!recording || power.isInteractive) {
            releaseWakeLock()
        } else if (wakeLock?.isHeld != true) {
            // CPU protection only while screen off. No screen/Wi-Fi lock or keepalive.
            wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "$packageName:Recording").apply {
                setReferenceCounted(false)
                acquire(MAX_WAKE_LOCK_MS)
            }
        }
    }

    private fun releaseWakeLock() {
        wakeLock?.takeIf { it.isHeld }?.release()
        wakeLock = null
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        val activity = owner?.get()
        stop(this)
        activity?.finish()
        super.onTaskRemoved(rootIntent)
    }

    override fun onDestroy() {
        destroyed = true
        leaveForeground()
        unregisterReceiver(screenReceiver)
        permissionExecutor?.shutdownNow()
        mainHandler.removeCallbacksAndMessages(null)
        if (instance?.get() === this) instance = null
        // pause() stops the idle service. The notification survives, not a worker.
        if (state.info.status != "paused" || owner?.get() == null) {
            getSystemService(NotificationManager::class.java).cancel(NOTIFICATION_ID)
            displayed = null
        }
        super.onDestroy()
    }

    companion object {
        const val ACTION_RESUME = "com.tingwu.mobile.action.RECORDING_RESUME"
        const val ACTION_STOP_CONFIRM = "com.tingwu.mobile.action.RECORDING_STOP_CONFIRM"
        private const val ACTION_START = "com.tingwu.mobile.action.RECORDING_ACTIVE"
        private const val ACTION_PAUSE_COMMAND = "com.tingwu.mobile.action.RECORDING_PAUSE"
        private const val ACTION_RETURN = "com.tingwu.mobile.action.RECORDING_RETURN"
        private const val CHANNEL_ID = "microphone_recording"
        private const val NOTIFICATION_ID = 1002
        private const val MAX_WAKE_LOCK_MS = 6 * 60 * 60 * 1000L
        private var owner: WeakReference<RecordingActivity>? = null
        private var instance: WeakReference<RecordingForegroundService>? = null
        private var state = RecordingNotificationState()
        private var displayed: RecordingNotificationState? = null
        private var sessionGeneration = 0L
        private var focusProtocol = 0
        private var focusAllowed = false

        /** Only call from a visible Activity after actual capture has started. */
        @MainThread
        fun start(activity: RecordingActivity): Boolean {
            owner = WeakReference(activity)
            state = state.transition("recording", SystemClock.elapsedRealtime())
            sessionGeneration++
            focusAllowed = false
            focusProtocol = 0
            return try {
                activity.startForegroundService(Intent(activity, RecordingForegroundService::class.java).setAction(ACTION_START))
                true
            } catch (_: RuntimeException) {
                stop(activity)
                false
            }
        }

        /** Ends native protection/notification only, never a destructive web command. */
        @MainThread
        fun stop(context: Context) {
            sessionGeneration++
            owner = null
            state = RecordingNotificationState()
            displayed = null
            instance?.get()?.leaveForeground()
            context.getSystemService(NotificationManager::class.java).cancel(NOTIFICATION_ID)
            context.stopService(Intent(context, RecordingForegroundService::class.java))
        }

        /** Actual capture has paused. Retain controls, without FGS, wake lock or idle worker. */
        @MainThread
        fun pause(context: Context) {
            if (owner?.get() == null || state.info.status == "stopped") return
            state = state.transition("paused", SystemClock.elapsedRealtime())
            val service = instance?.get()
            service?.leaveForeground()
            postNotification(context)
            service?.stopSelf()
        }

        /** Actual JS state only. A recording snapshot never starts a background microphone FGS. */
        @MainThread
        fun update(activity: RecordingActivity, info: RecordingInfo) {
            val safe = info.normalized()
            if (safe.status == "stopped") {
                stop(activity)
                return
            }
            owner = WeakReference(activity)
            state = RecordingNotificationState(safe, SystemClock.elapsedRealtime())
            if (safe.status == "paused") pause(activity)
            else if (instance?.get()?.recording == true) postNotification(activity)
        }

        private fun ensureChannel(context: Context) {
            context.getSystemService(NotificationManager::class.java).createNotificationChannel(NotificationChannel(
                CHANNEL_ID, context.getString(R.string.recording_notification_channel), NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = context.getString(R.string.recording_notification_description)
                setShowBadge(false)
                setSound(null, null)
            })
        }

        private fun postNotification(context: Context, force: Boolean = false): Boolean {
            if (state.info.status == "stopped") return false
            val previous = displayed
            if (!force && previous != null && !state.needsRefresh(previous, SystemClock.elapsedRealtime())) return false
            return try {
                ensureChannel(context)
                context.getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, notification(context))
                displayed = state
                true
            } catch (_: RuntimeException) {
                // A vendor extension must never cost the ordinary ongoing notification.
                try {
                    context.getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, notification(context, withFocus = false))
                    displayed = state
                    true
                } catch (_: RuntimeException) { false }
            }
        }

        private fun notification(context: Context, withFocus: Boolean = focusAllowed): Notification {
            val info = state.at(SystemClock.elapsedRealtime())
            val active = info.status == "recording"
            val nowWallTime = System.currentTimeMillis()
            val status = context.getString(if (active) R.string.recording_notification_status_recording else R.string.recording_notification_status_paused)
            val network = context.getString(R.string.recording_notification_network_unstable)
            val description = buildString {
                append(status)
                if (!active) append(" · ").append(info.durationText())
                if (info.networkUnstable) append(" · ").append(network)
            }
            fun openActivity(action: String, requestCode: Int): PendingIntent = PendingIntent.getActivity(
                context, requestCode, Intent(context, RecordingActivity::class.java).setAction(action)
                    .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            val open = openActivity(ACTION_RETURN, NOTIFICATION_ID)
            val toggle = Notification.Action.Builder(
                Icon.createWithResource(context, if (active) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play),
                context.getString(if (active) R.string.recording_notification_pause else R.string.recording_notification_resume),
                if (active) PendingIntent.getService(
                    context, NOTIFICATION_ID + 1,
                    Intent(context, RecordingForegroundService::class.java).setAction(ACTION_PAUSE_COMMAND),
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                ) else openActivity(ACTION_RESUME, NOTIFICATION_ID + 2),
            ).build()
            val returnAction = Notification.Action.Builder(
                Icon.createWithResource(context, android.R.drawable.ic_menu_view),
                context.getString(R.string.recording_notification_return), open,
            ).build()
            val stopAction = Notification.Action.Builder(
                Icon.createWithResource(context, android.R.drawable.ic_menu_close_clear_cancel),
                context.getString(R.string.recording_notification_stop_confirm), openActivity(ACTION_STOP_CONFIRM, NOTIFICATION_ID + 3),
            ).build()
            val notification = Notification.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_tingwu)
                .setContentTitle(info.title.ifBlank { context.getString(if (active) R.string.recording_notification_title else R.string.recording_notification_paused_title) })
                .setContentText(description)
                .setContentIntent(open)
                .setCategory(Notification.CATEGORY_SERVICE)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setAutoCancel(false)
                .setWhen(nowWallTime - info.elapsedMs)
                .setShowWhen(active)
                .setUsesChronometer(active)
                .setChronometerCountDown(false)
                .addAction(toggle)
                .addAction(returnAction)
                .addAction(stopAction)
                .apply {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE)
                }
                .build()
            if (withFocus && RecordingIslandNotification.isSupported(Build.MANUFACTURER, Build.BRAND, focusProtocol, true)) {
                try {
                    val json = RecordingIslandNotification.buildJson(info, status, network, nowWallTime, focusProtocol)
                    if (json != null) notification.extras.putAll(Bundle().apply {
                        putString(RecordingIslandNotification.EXTRA_PARAM, json)
                        putBundle(RecordingIslandNotification.EXTRA_ACTIONS, Bundle().apply {
                            putParcelable(if (active) RecordingIslandNotification.ACTION_PAUSE else RecordingIslandNotification.ACTION_RESUME, toggle)
                            putParcelable(RecordingIslandNotification.ACTION_RETURN, returnAction)
                            putParcelable(RecordingIslandNotification.ACTION_STOP_CONFIRM, stopAction)
                        })
                        putBundle(RecordingIslandNotification.EXTRA_PICS, Bundle().apply {
                            putParcelable(RecordingIslandNotification.PIC_RECORDING, Icon.createWithResource(context, R.drawable.ic_stat_tingwu))
                        })
                    })
                } catch (_: RuntimeException) { /* Normal controls above remain intact. */ }
            }
            return notification
        }
    }
}
