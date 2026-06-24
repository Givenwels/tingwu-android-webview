package com.tingwu.mobile

import android.content.pm.ServiceInfo

object BackgroundPlaybackPolicy {
    const val MEDIA_PLAYBACK_SERVICE_TYPE: Int = ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
    const val MICROPHONE_SERVICE_TYPE: Int = ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
    const val WAKE_LOCK_TIMEOUT_MS: Long = 4 * 60 * 60 * 1000L

    fun shouldPrepareKeepAliveOnResume(): Boolean = true

    fun shouldStopKeepAliveOnResume(): Boolean = false

    fun shouldStartKeepAlive(activityIsFinishing: Boolean): Boolean = !activityIsFinishing

    fun foregroundServiceType(includeMicrophone: Boolean): Int =
        MEDIA_PLAYBACK_SERVICE_TYPE or
            if (includeMicrophone) {
                MICROPHONE_SERVICE_TYPE
            } else {
                0
            }

    fun pageVisibilityKeepAliveScript(): String =
        """
        (() => {
          if (window.__tingwuKeepVisibleInstalled) return;
          window.__tingwuKeepVisibleInstalled = true;

          const defineGetter = (target, property, value) => {
            try {
              Object.defineProperty(target, property, {
                configurable: true,
                get: () => value
              });
            } catch (_) {}
          };

          defineGetter(document, 'hidden', false);
          defineGetter(document, 'webkitHidden', false);
          defineGetter(document, 'visibilityState', 'visible');
          defineGetter(document, 'webkitVisibilityState', 'visible');

          try {
            document.hasFocus = () => true;
          } catch (_) {}

          document.addEventListener(
            'visibilitychange',
            event => event.stopImmediatePropagation(),
            true
          );
          document.addEventListener(
            'webkitvisibilitychange',
            event => event.stopImmediatePropagation(),
            true
          );
          window.addEventListener(
            'blur',
            event => event.stopImmediatePropagation(),
            true
          );
        })();
        """.trimIndent()
}
