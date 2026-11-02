package com.tingwu.harness

import android.app.Activity
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioManager
import android.os.Bundle
import android.os.Process
import android.util.Log
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.VideoView
import java.io.File

/** Separate test-app UID, real VideoView/audio focus, local AndroidX sample only. */
class VideoInterruptionActivity : Activity() {
    private lateinit var video: VideoView
    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        if (intent.getBooleanExtra("close_video", false)) { finishAndRemoveTask(); return }
        val layout = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        val status = TextView(this).apply { text = "正在准备外部测试视频"; textSize = 20f }
        video = VideoView(this).apply {
            setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_MOVIE).build())
            setAudioFocusRequest(intent.getIntExtra("focus_gain", AudioManager.AUDIOFOCUS_GAIN))
        }
        val finishButton = Button(this).apply {
            text = "退出测试视频"; isEnabled = false
            setOnClickListener { video.stopPlayback(); finishAndRemoveTask() }
        }
        layout.addView(status)
        layout.addView(video, LinearLayout.LayoutParams(-1, 600))
        layout.addView(finishButton)
        setContentView(layout)
        val asset = File(cacheDir, "focus-video.mp4")
        assets.open("focus-video.mp4").use { input -> asset.outputStream().use { input.copyTo(it) } }
        video.setOnPreparedListener { player ->
            player.isLooping = true
            status.text = "外部测试视频播放中"
            finishButton.isEnabled = true
            Log.i("TingwuFocusTest", "VIDEO_PLAY uid=${Process.myUid()} focus=${intent.getIntExtra("focus_gain", AudioManager.AUDIOFOCUS_GAIN)}")
            video.start()
        }
        video.setOnErrorListener { _, what, extra ->
            status.text = "测试视频失败 $what/$extra"; finishButton.isEnabled = true; true
        }
        video.setVideoPath(asset.absolutePath)
    }
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        if (intent.getBooleanExtra("close_video", false)) {
            video.stopPlayback(); finishAndRemoveTask()
        }
    }
    override fun onDestroy() { if (::video.isInitialized) video.stopPlayback(); super.onDestroy() }
}
