(() => {
  if (window.__tingwuPlaybackObserverInstalled) return;
  window.__tingwuPlaybackObserverInstalled = true;

  // Keep real visibility/events. Adapt only the official player's background-pause policy.
  const mediaElements = new Set();
  const watched = new WeakSet();
  const owners = new WeakMap();
  const patchedPlayers = new WeakSet();
  const userPaused = new WeakSet();
  const closedMedia = new WeakSet();
  const events = ['playing', 'pause', 'ended', 'emptied', 'error', 'abort', 'waiting', 'stalled', 'canplay', 'loadedmetadata', 'durationchange', 'seeked', 'ratechange', 'timeupdate'];
  let port = null;
  let lastState = null;
  let controlsEnabled = false;
  let currentMedia = null;
  let lastProgressAt = 0;
  let lastSnapshot = null;
  const isTingwu = typeof location !== 'undefined' && location.origin === 'https://tingwu.aliyun.com';

  const adaptPlayers = () => {
    if (!isTingwu) return;
    document.querySelectorAll('.audioPlayer, .audioPlayerBg').forEach(element => {
      let instance = element.__vueParentComponent;
      for (let depth = 0; instance && depth < 30; depth++, instance = instance.parent) {
        const player = instance.proxy;
        const audio = player && player.innerAudioContext && player.innerAudioContext._audio;
        if (!player || !instance.type || instance.type.name !== 'AudioPlayer' || !(audio instanceof HTMLMediaElement)) continue;
        owners.set(audio, player);
        if (!patchedPlayers.has(player) && typeof player.toggleRevive === 'function') {
          const revive = player.toggleRevive;
          player.toggleRevive = function (action) {
            // This is the website's lifecycle pause, distinct from its user-facing pause().
            if (action === 'pause' && document.hidden && !audio.paused && !audio.ended && !userPaused.has(audio)) return;
            if (action === 'play' && userPaused.has(audio)) return;
            return revive.call(this, action);
          };
          patchedPlayers.add(player);
        }
        break;
      }
    });
    mediaElements.forEach(media => {
      const player = owners.get(media);
      if (player && player.$ && (player.$.isUnmounted || player.$.isDeactivated)) {
        mediaElements.delete(media);
        if (currentMedia === media) currentMedia = null;
      }
    });
  };

  const snapshot = () => {
    const media = currentMedia && !closedMedia.has(currentMedia) ? currentMedia : null;
    if (!media) return { type: 'playback-state', status: 'idle', title: '', positionMs: 0, durationMs: 0, speed: 1 };
    const title = isTingwu && document.querySelector('.topContainer .topBar .title');
    return {
      type: 'playback-state',
      status: media.error ? 'error' : media.ended ? 'ended' : media.paused ? 'paused' : media.readyState >= 3 ? 'playing' : 'buffering',
      title: String((title && title.textContent.trim()) || document.title || '通义听悟音频').slice(0, 160),
      positionMs: Number.isFinite(media.currentTime) ? Math.max(0, Math.round(media.currentTime * 1000)) : 0,
      durationMs: Number.isFinite(media.duration) ? Math.max(0, Math.round(media.duration * 1000)) : 0,
      speed: Number.isFinite(media.playbackRate) && media.playbackRate > 0 ? media.playbackRate : 1,
    };
  };

  const report = (force = false) => {
    if (!port) return;
    const playing = Array.from(mediaElements).some(media =>
      !media.paused && !media.ended && !media.error && media.readyState >= 2
    );
    const state = playing ? 'playing' : 'stopped';
    if (state !== lastState) {
      port.postMessage(state);
      lastState = state;
    }
    if (controlsEnabled) {
      const next = snapshot();
      if (force || !lastSnapshot || next.status !== lastSnapshot.status || next.title !== lastSnapshot.title ||
          next.durationMs !== lastSnapshot.durationMs || next.speed !== lastSnapshot.speed ||
          Math.abs(next.positionMs - lastSnapshot.positionMs) >= (document.hidden ? 5000 : 1000)) {
        port.postMessage(JSON.stringify(next));
        lastSnapshot = next;
      }
    }
  };

  const watch = media => {
    if (!(media instanceof HTMLMediaElement)) return;
    mediaElements.add(media);
    if (watched.has(media)) return;
    watched.add(media);
    events.forEach(event => media.addEventListener(event, () => {
      if (event === 'playing') currentMedia = media;
      if (event === 'timeupdate') {
        const now = Date.now();
        if (!controlsEnabled || now - lastProgressAt < (document.hidden ? 5000 : 1000)) return;
        lastProgressAt = now;
      }
      report(event === 'seeked');
    }));
  };

  document.querySelectorAll('audio, video').forEach(watch);
  document.addEventListener('play', event => {
    watch(event.target);
    report();
  }, true);

  // Also observe Audio instances that are not attached to the document.
  const originalPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...args) {
    adaptPlayers();
    currentMedia = this;
    userPaused.delete(this);
    closedMedia.delete(this);
    watch(this);
    return originalPlay.apply(this, args);
  };

  const control = command => {
    adaptPlayers();
    const media = currentMedia;
    if (!media) return report();
    const player = owners.get(media);
    if (command === 'pause' || command === 'stop') {
      userPaused.add(media);
      if (player && typeof player.pause === 'function') player.pause();
      else media.pause();
      if (command === 'stop') {
        closedMedia.add(media);
        if (player && player.innerAudioContext) player.innerAudioContext.stop();
        else media.currentTime = 0;
      }
    } else if (command === 'play') {
      userPaused.delete(media);
      closedMedia.delete(media);
      if (player && typeof player.play === 'function') player.play();
      else {
        const promise = media.play();
        if (promise && promise.catch) promise.catch(report);
      }
    } else if (/^seek:\d+$/.test(command)) {
      const seconds = Math.max(0, Math.min(Number(command.slice(5)) / 1000, Number.isFinite(media.duration) ? media.duration : 86400));
      if (player && player.innerAudioContext) player.innerAudioContext.seek(seconds);
      else media.currentTime = seconds;
    }
    report();
  };

  window.addEventListener('message', event => {
    if (event.data !== 'tingwu-media-playback' || !event.ports || !event.ports[0]) return;
    if (port) port.close();
    port = event.ports[0];
    port.onmessage = message => {
      if (message.data === 'enable-controls') {
        controlsEnabled = true;
        lastSnapshot = null;
        adaptPlayers();
        report();
      } else if (message.data === 'query-state') {
        lastState = null;
        lastSnapshot = null;
        adaptPlayers();
        report();
      } else if (controlsEnabled && typeof message.data === 'string') control(message.data);
    };
    lastState = null;
    lastSnapshot = null;
    report();
  });

  window.addEventListener('pagehide', () => {
    if (!port) return;
    port.postMessage('stopped');
    port.close();
    port = null;
  });

  if (isTingwu) {
    adaptPlayers();
    new MutationObserver(() => { adaptPlayers(); if (controlsEnabled) report(); })
      .observe(document, { childList: true, subtree: true });
  }
})();
