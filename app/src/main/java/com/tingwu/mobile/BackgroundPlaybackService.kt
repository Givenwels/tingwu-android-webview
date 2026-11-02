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
import android.graphics.Bitmap
import android.graphics.Canvas
import android.media.MediaMetadata
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.util.Log
import androidx.core.content.ContextCompat
import java.lang.ref.WeakReference

/** A media session controls the actual web audio; never plays silent keep-alive audio. */
class BackgroundPlaybackService : Service() {
    interface Controller {
        fun onPlaybackCommand(command: String)
        fun onPlaybackUnavailable(notifyUser: Boolean)
    }
    private lateinit var session: MediaSession
    private val handler = Handler(Looper.getMainLooper())
    private var foreground = false
    private var wakeLock: PowerManager.WakeLock? = null
    private var notifiedKey = ""
    private var metadataKey = ""
    private val startTimeout = Runnable {
        if (!latest.playing) {
            Log.w("TingwuPlayback", "Playback resume timed out; retaining paused controls")
            retainPausedSession(notifyUser = true)
        }
    }
    private val screenReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) = updateWakeLock()
    }
    private val artwork: Bitmap by lazy {
        Bitmap.createBitmap(128, 128, Bitmap.Config.ARGB_8888).also { bitmap ->
            ContextCompat.getDrawable(this, R.mipmap.ic_launcher_round)?.apply {
                setBounds(0, 0, bitmap.width, bitmap.height); draw(Canvas(bitmap))
            }
        }
    }
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        instance = WeakReference(this)
        getSystemService(NotificationManager::class.java).createNotificationChannel(NotificationChannel(
            CHANNEL_ID, getString(R.string.background_playback_channel_name), NotificationManager.IMPORTANCE_LOW,
        ).apply { setSound(null, null); setShowBadge(false) })
        session = MediaSession(this, "TingwuPlayback").apply {
            @Suppress("DEPRECATION")
            setFlags(MediaSession.FLAG_HANDLES_MEDIA_BUTTONS or MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS)
            setSessionActivity(openIntent())
            setCallback(object : MediaSession.Callback() {
                override fun onPlay() = requestPlay()
                override fun onPause() = command("pause")
                override fun onStop() = command("stop")
                override fun onSeekTo(pos: Long) = command("seek:${pos.coerceAtLeast(0)}")
                override fun onRewind() = seekBy(-15_000)
                override fun onFastForward() = seekBy(15_000)
            }, handler)
        }
        ContextCompat.registerReceiver(this, screenReceiver, IntentFilter().apply {
            addAction(Intent.ACTION_SCREEN_ON); addAction(Intent.ACTION_SCREEN_OFF)
        }, ContextCompat.RECEIVER_NOT_EXPORTED)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (controller?.get() == null || !latest.visible) { shutdown(); return START_NOT_STICKY }
        try {
            if (!foreground && (intent?.action != ACTION_RESTORE_PAUSED || latest.playing || latest.status == "buffering")) promote()
            when (intent?.action) {
                ACTION_PLAY -> requestPlay()
                ACTION_PAUSE -> command("pause")
                ACTION_STOP -> command("stop")
                ACTION_REWIND -> seekBy(-15_000)
                ACTION_FORWARD -> seekBy(15_000)
                else -> applyState()
            }
        } catch (error: RuntimeException) {
            Log.w("TingwuPlayback", "Playback service command failed", error)
            retainPausedSession(notifyUser = intent?.action == ACTION_PLAY)
        }
        return START_NOT_STICKY
    }

    private fun command(value: String) {
        val target = controller?.get()
        if (target == null) shutdown() else target.onPlaybackCommand(value)
    }
    private fun requestPlay() {
        try {
            // Resume obtains foreground status before the page requests audio focus.
            if (!foreground) promote()
            handler.removeCallbacks(startTimeout)
            handler.postDelayed(startTimeout, 15_000)
            command("play")
        } catch (error: RuntimeException) {
            Log.w("TingwuPlayback", "Playback service resume failed", error)
            retainPausedSession(notifyUser = true)
        }
    }
    private fun seekBy(delta: Long) = command("seek:${(latest.positionMs + delta).coerceIn(0,
        latest.durationMs.takeIf { it > 0 } ?: Long.MAX_VALUE)}")

    private fun retainPausedSession(notifyUser: Boolean) {
        handler.removeCallbacks(startTimeout)
        latest = latest.copy(status = "paused")
        controller?.get()?.onPlaybackUnavailable(notifyUser)
        // A failed promotion must not destroy the recording or its resume controls.
        // Republish once in case the system also removed the previous notification.
        notifiedKey = ""
        applyState()
    }

    private fun applyState() {
        val info = latest
        if (!info.visible) { shutdown(); return }
        if (info.playing) handler.removeCallbacks(startTimeout)
        session.isActive = true
        val key = "${info.title}:${info.durationMs}"
        if (key != metadataKey) {
            session.setMetadata(MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, info.title.ifBlank { getString(R.string.playback_ui_title_fallback) })
                .putString(MediaMetadata.METADATA_KEY_ARTIST, getString(R.string.app_name))
                .putLong(MediaMetadata.METADATA_KEY_DURATION, info.durationMs)
                .putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, artwork).build())
            metadataKey = key
        }
        val state = when (info.status) {
            "playing" -> PlaybackState.STATE_PLAYING
            "buffering" -> PlaybackState.STATE_BUFFERING
            else -> PlaybackState.STATE_PAUSED
        }
        session.setPlaybackState(PlaybackState.Builder().setActions(
            PlaybackState.ACTION_PLAY or PlaybackState.ACTION_PAUSE or PlaybackState.ACTION_PLAY_PAUSE or
                PlaybackState.ACTION_STOP or PlaybackState.ACTION_SEEK_TO or PlaybackState.ACTION_REWIND or PlaybackState.ACTION_FAST_FORWARD,
        ).setState(state, info.positionMs, if (info.playing) info.speed else 0f, SystemClock.elapsedRealtime()).build())
        if (info.playing || info.status == "buffering") {
            if (!foreground) promote()
        } else if (foreground) { stopForeground(STOP_FOREGROUND_DETACH); foreground = false }
        val notificationKey = "${info.status}:$key"
        if (notificationKey != notifiedKey) {
            getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, notification())
            notifiedKey = notificationKey
        }
        updateWakeLock()
    }

    private fun notification(): Notification {
        val info = latest
        return Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_tingwu).setLargeIcon(artwork)
            .setContentTitle(info.title.ifBlank { getString(R.string.playback_ui_title_fallback) })
            .setContentText(getString(R.string.app_name)).setContentIntent(openIntent())
            .setVisibility(Notification.VISIBILITY_PRIVATE).setCategory(Notification.CATEGORY_TRANSPORT)
            .setOngoing(info.playing).setOnlyAlertOnce(true).setShowWhen(false)
            .setDeleteIntent(actionIntent(ACTION_STOP))
            .addAction(Notification.Action.Builder(android.R.drawable.ic_media_rew,
                getString(R.string.playback_rewind), actionIntent(ACTION_REWIND)).build())
            .addAction(Notification.Action.Builder(if (info.playing) R.drawable.ic_playback_pause else R.drawable.ic_playback_play,
                getString(if (info.playing) R.string.playback_ui_pause else R.string.playback_ui_play),
                actionIntent(if (info.playing) ACTION_PAUSE else ACTION_PLAY)).build())
            .addAction(Notification.Action.Builder(android.R.drawable.ic_media_ff,
                getString(R.string.playback_forward), actionIntent(ACTION_FORWARD)).build())
            .setStyle(Notification.MediaStyle().setMediaSession(session.sessionToken).setShowActionsInCompactView(0, 1, 2)).build()
    }
    private fun promote() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) startForeground(NOTIFICATION_ID, notification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
        else startForeground(NOTIFICATION_ID, notification())
        foreground = true
    }
    private fun actionIntent(action: String): PendingIntent = PendingIntent.getForegroundService(this,
        action.hashCode(), Intent(this, BackgroundPlaybackService::class.java).setAction(action),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    private fun openIntent(): PendingIntent = PendingIntent.getActivity(this, 0,
        Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

    private fun updateWakeLock() {
        val power = getSystemService(PowerManager::class.java)
        if (!latest.playing || power.isInteractive) {
            wakeLock?.takeIf { it.isHeld }?.release(); wakeLock = null
        } else if (wakeLock?.isHeld != true) {
            wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "$packageName:BackgroundPlayback").apply {
                setReferenceCounted(false); acquire(4 * 60 * 60 * 1000L)
            }
        }
    }
    private fun shutdown() { latest = PlaybackInfo(); stopSelf() }
    override fun onTaskRemoved(rootIntent: Intent?) {
        controller?.get()?.onPlaybackCommand("stop"); shutdown(); super.onTaskRemoved(rootIntent)
    }
    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        wakeLock?.takeIf { it.isHeld }?.release(); wakeLock = null
        unregisterReceiver(screenReceiver); session.release()
        stopForeground(STOP_FOREGROUND_REMOVE)
        getSystemService(NotificationManager::class.java).cancel(NOTIFICATION_ID)
        if (instance?.get() === this) instance = null
        super.onDestroy()
    }

    companion object {
        private const val CHANNEL_ID = "background_playback"
        private const val NOTIFICATION_ID = 1001
        private const val ACTION_SYNC = "com.tingwu.mobile.playback.SYNC"
        private const val ACTION_RESTORE_PAUSED = "com.tingwu.mobile.playback.RESTORE_PAUSED"
        private const val ACTION_PLAY = "com.tingwu.mobile.playback.PLAY"
        private const val ACTION_PAUSE = "com.tingwu.mobile.playback.PAUSE"
        private const val ACTION_STOP = "com.tingwu.mobile.playback.STOP"
        private const val ACTION_REWIND = "com.tingwu.mobile.playback.REWIND"
        private const val ACTION_FORWARD = "com.tingwu.mobile.playback.FORWARD"
        private var instance: WeakReference<BackgroundPlaybackService>? = null
        private var controller: WeakReference<Controller>? = null
        private var latest = PlaybackInfo()
        fun update(context: Context, owner: Controller, info: PlaybackInfo, restorePaused: Boolean = false) {
            controller = WeakReference(owner); latest = info
            val running = instance?.get()
            try {
                if (running != null) running.applyState()
                else if (info.playing || info.status == "buffering") context.startForegroundService(
                    Intent(context, BackgroundPlaybackService::class.java).setAction(ACTION_SYNC))
                else if (restorePaused && info.status == "paused") context.startService(
                    Intent(context, BackgroundPlaybackService::class.java).setAction(ACTION_RESTORE_PAUSED))
            } catch (error: RuntimeException) {
                Log.w("TingwuPlayback", "Playback state update failed: ${info.status}", error)
                if (running != null) running.retainPausedSession(notifyUser = false)
                else {
                    latest = info.copy(status = "paused")
                    owner.onPlaybackUnavailable(notifyUser = false)
                }
            }
        }
        fun stop(context: Context) {
            latest = PlaybackInfo(); controller = null
            context.stopService(Intent(context, BackgroundPlaybackService::class.java))
        }
    }
}
