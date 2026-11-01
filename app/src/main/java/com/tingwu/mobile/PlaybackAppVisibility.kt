package com.tingwu.mobile

import android.app.Activity
import android.app.Application
import android.os.Bundle
import android.os.Handler
import android.os.Looper

/** Tracks all application activities so the floating player never covers our own recorder. */
object PlaybackAppVisibility : Application.ActivityLifecycleCallbacks {
    private var installed = false
    private var started = 0
    private val handler = Handler(Looper.getMainLooper())
    private val background = Runnable { if (started == 0) BackgroundPlaybackService.setAppVisible(false) }
    fun install(application: Application) {
        if (installed) return
        installed = true
        application.registerActivityLifecycleCallbacks(this)
    }
    override fun onActivityStarted(activity: Activity) {
        started++
        handler.removeCallbacks(background)
        BackgroundPlaybackService.setAppVisible(true)
    }
    override fun onActivityStopped(activity: Activity) {
        started = (started - 1).coerceAtLeast(0)
        if (started == 0) handler.postDelayed(background, 150)
    }
    override fun onActivityCreated(activity: Activity, state: Bundle?) = Unit
    override fun onActivityResumed(activity: Activity) = Unit
    override fun onActivityPaused(activity: Activity) = Unit
    override fun onActivitySaveInstanceState(activity: Activity, state: Bundle) = Unit
    override fun onActivityDestroyed(activity: Activity) = Unit
}
