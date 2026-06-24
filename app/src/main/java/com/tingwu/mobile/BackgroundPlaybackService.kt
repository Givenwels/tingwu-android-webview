package com.tingwu.mobile

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager

class BackgroundPlaybackService : Service() {
    private var wakeLock: PowerManager.WakeLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        ensureNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopSelf()
            return START_NOT_STICKY
        }

        val includeMicrophone =
            intent?.getBooleanExtra(EXTRA_INCLUDE_MICROPHONE, false) == true &&
                hasRecordAudioPermission()
        promoteToForeground(includeMicrophone = includeMicrophone)
        acquireWakeLock()
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        releaseWakeLock()
        super.onDestroy()
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        stopSelf()
        super.onTaskRemoved(rootIntent)
    }

    private fun promoteToForeground(includeMicrophone: Boolean) {
        val notification = buildNotification()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val requestedType =
                BackgroundPlaybackPolicy.foregroundServiceType(
                    includeMicrophone = includeMicrophone,
                )
            runCatching {
                startForeground(NOTIFICATION_ID, notification, requestedType)
            }.recoverCatching {
                startForeground(
                    NOTIFICATION_ID,
                    notification,
                    BackgroundPlaybackPolicy.foregroundServiceType(includeMicrophone = false),
                )
            }.getOrElse {
                startForeground(NOTIFICATION_ID, notification)
            }
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun acquireWakeLock() {
        if (wakeLock?.isHeld == true) return

        val powerManager = getSystemService(PowerManager::class.java)
        wakeLock =
            powerManager
                .newWakeLock(
                    PowerManager.PARTIAL_WAKE_LOCK,
                    "$packageName:BackgroundPlayback",
                ).apply {
                    setReferenceCounted(false)
                    acquire(BackgroundPlaybackPolicy.WAKE_LOCK_TIMEOUT_MS)
                }
    }

    private fun releaseWakeLock() {
        wakeLock?.takeIf { it.isHeld }?.release()
        wakeLock = null
    }

    private fun buildNotification(): Notification {
        val openIntent =
            PendingIntent.getActivity(
                this,
                0,
                Intent(this, MainActivity::class.java),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )

        val stopIntent =
            PendingIntent.getService(
                this,
                1,
                Intent(this, BackgroundPlaybackService::class.java).setAction(ACTION_STOP),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )

        return Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_tingwu)
            .setContentTitle(getString(R.string.background_playback_title))
            .setContentText(getString(R.string.background_playback_message))
            .setContentIntent(openIntent)
            .setOngoing(true)
            .setShowWhen(false)
            .addAction(
                Notification.Action.Builder(
                    R.drawable.ic_stat_tingwu,
                    getString(R.string.background_playback_stop),
                    stopIntent,
                ).build(),
            )
            .build()
    }

    private fun ensureNotificationChannel() {
        val channel =
            NotificationChannel(
                CHANNEL_ID,
                getString(R.string.background_playback_channel_name),
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = getString(R.string.background_playback_channel_description)
                setShowBadge(false)
            }
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    private fun hasRecordAudioPermission(): Boolean =
        checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

    companion object {
        private const val ACTION_START = "com.tingwu.mobile.action.START_BACKGROUND_PLAYBACK"
        private const val ACTION_STOP = "com.tingwu.mobile.action.STOP_BACKGROUND_PLAYBACK"
        private const val EXTRA_INCLUDE_MICROPHONE = "include_microphone"
        private const val CHANNEL_ID = "background_playback"
        private const val NOTIFICATION_ID = 1001

        fun start(context: Context, includeMicrophone: Boolean) {
            val intent =
                Intent(context, BackgroundPlaybackService::class.java).apply {
                    action = ACTION_START
                    putExtra(EXTRA_INCLUDE_MICROPHONE, includeMicrophone)
                }

            runCatching {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(intent)
                } else {
                    context.startService(intent)
                }
            }
        }

        fun stop(context: Context) {
            val intent =
                Intent(context, BackgroundPlaybackService::class.java).setAction(ACTION_STOP)
            runCatching { context.startService(intent) }
        }
    }
}
