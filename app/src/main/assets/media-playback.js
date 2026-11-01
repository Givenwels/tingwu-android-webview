(() => {
  if (window.__tingwuPlaybackObserverInstalled) return;
  window.__tingwuPlaybackObserverInstalled = true;

  // Report playback only; leave document visibility and page events unchanged.
  const mediaElements = new Set();
  const events = ['playing', 'pause', 'ended', 'emptied', 'error', 'abort'];
  let port = null;
  let lastState = null;

  const report = () => {
    if (!port) return;
    const playing = Array.from(mediaElements).some(media =>
      !media.paused && !media.ended && !media.error && media.readyState >= 2
    );
    const state = playing ? 'playing' : 'stopped';
    if (state !== lastState) {
      port.postMessage(state);
      lastState = state;
    }
  };

  const watch = media => {
    if (!(media instanceof HTMLMediaElement) || mediaElements.has(media)) return;
    mediaElements.add(media);
    events.forEach(event => media.addEventListener(event, report));
  };

  document.querySelectorAll('audio, video').forEach(watch);
  document.addEventListener('play', event => {
    watch(event.target);
    report();
  }, true);

  // Also observe Audio instances that are not attached to the document.
  const originalPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...args) {
    watch(this);
    return originalPlay.apply(this, args);
  };

  window.addEventListener('message', event => {
    if (event.data !== 'tingwu-media-playback' || !event.ports || !event.ports[0]) return;
    if (port) port.close();
    port = event.ports[0];
    port.onmessage = message => {
      if (message.data !== 'query-state') return;
      lastState = null;
      report();
    };
    lastState = null;
    report();
  });

  window.addEventListener('pagehide', () => {
    if (!port) return;
    port.postMessage('stopped');
    port.close();
    port = null;
  });
})();
