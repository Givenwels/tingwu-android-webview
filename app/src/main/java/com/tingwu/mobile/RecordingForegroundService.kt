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
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.content.ContextCompat
import java.lang.ref.WeakReference

/** Protects an already-running, user-started web recording. It never opens the microphone. */
class RecordingForegroundService : Service() {
    private var recording = false
    private var wakeLock: PowerManager.WakeLock? = null
    private val screenReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) = updateWakeLock()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(
            CHANNEL_ID, getString(R.string.recording_notification_channel), NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = getString(R.string.recording_notification_description)
            setShowBadge(false)
            setSound(null, null)
        })
        ContextCompat.registerReceiver(this, screenReceiver, IntentFilter().apply {
            addAction(Intent.ACTION_SCREEN_ON)
            addAction(Intent.ACTION_SCREEN_OFF)
        }, ContextCompat.RECEIVER_NOT_EXPORTED)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action != ACTION_START || owner?.get() == null) {
            stopSelf()
            return START_NOT_STICKY
        }
        try {
            val notification = notification()
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
            } else startForeground(NOTIFICATION_ID, notification)
            recording = true
            updateWakeLock()
        } catch (_: RuntimeException) {
            owner?.get()?.onRecordingProtectionFailed()
            stopSelf()
        }
        // Neither a process restart nor a reboot may silently resume a microphone session.
        return START_NOT_STICKY
    }

    private fun notification(): Notification {
        val open = PendingIntent.getActivity(this, NOTIFICATION_ID,
            Intent(this, RecordingActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        return Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_tingwu)
            .setContentTitle(getString(R.string.recording_notification_title))
            .setContentText(getString(R.string.recording_notification_message))
            .setContentIntent(open)
            .setCategory(Notification.CATEGORY_SERVICE)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .apply {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE)
            }
            .build()
    }

    private fun updateWakeLock() {
        val power = getSystemService(PowerManager::class.java)
        if (!recording || power.isInteractive) {
            releaseWakeLock()
        } else if (wakeLock?.isHeld != true) {
            // Only the CPU is protected while the display is off; never light the screen,
            // keep Wi-Fi at high performance, or poll the web page to keep it alive.
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
        owner?.get()?.finish()
        stopSelf()
        super.onTaskRemoved(rootIntent)
    }

    override fun onDestroy() {
        recording = false
        releaseWakeLock()
        unregisterReceiver(screenReceiver)
        stopForeground(STOP_FOREGROUND_REMOVE)
        super.onDestroy()
    }

    companion object {
        private const val ACTION_START = "com.tingwu.mobile.action.RECORDING_ACTIVE"
        private const val CHANNEL_ID = "microphone_recording"
        private const val NOTIFICATION_ID = 1002
        private const val MAX_WAKE_LOCK_MS = 6 * 60 * 60 * 1000L
        private var owner: WeakReference<RecordingActivity>? = null

        fun start(activity: RecordingActivity): Boolean {
            owner = WeakReference(activity)
            return try {
                activity.startForegroundService(Intent(activity, RecordingForegroundService::class.java).setAction(ACTION_START))
                true
            } catch (_: RuntimeException) {
                owner = null
                false
            }
        }

        fun stop(context: Context) {
            owner = null
            context.stopService(Intent(context, RecordingForegroundService::class.java))
        }
    }
}
