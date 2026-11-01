// Instrumentation-only harness for the real deployed uFvF recorder and same-origin Opus worker.
window.officialEncoderStats = { phase: 'loading', pages: 0, bytes: 0, oggPages: 0, error: null };
window.officialEncoderTracks = [];
window.officialEncoderStart = async function () {
  const stats = window.officialEncoderStats;
  try {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/__tingwu_test__/official-runtime.js';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Official recorder runtime failed to load'));
      document.head.appendChild(script);
    });
    const Recorder = window.__tingwuEncoderRequire('uFvF').a;
    const recorder = new Recorder();
    window.officialEncoder = recorder;
    recorder.setExtConfig({
      encoderPath4Safari: location.origin + '/public/opusEncoderWorker.js',
      onRecorderError: error => { stats.error = error.name + ': ' + error.message; stats.phase = 'error'; },
    });
    recorder.on('dataavailable', event => {
      const data = event.data;
      stats.pages++;
      stats.bytes += data.length;
      if (data[0] === 79 && data[1] === 103 && data[2] === 103 && data[3] === 83) stats.oggPages++;
    });
    await window.officialEncoderBegin();
    stats.startedAt = Date.now();
    stats.phase = 'running';
  } catch (error) { stats.error = error.name + ': ' + error.message; stats.phase = 'error'; }
};
window.officialEncoderBegin = async function () {
  const start = window.officialEncoder.start();
  const inner = window.officialEncoder.fakeRecorder;
  await inner.initialize;
  inner.encoder.addEventListener('error', event => {
    window.officialEncoderStats.error = event.message || 'Opus worker error';
    window.officialEncoderStats.phase = 'error';
  });
  await start;
  inner.stream.getAudioTracks().forEach(track => window.officialEncoderTracks.push(track));
};
window.officialEncoderPause = async function () {
  try {
    await window.officialEncoder.pause();
    window.officialEncoderStats.phase = 'paused';
    window.officialEncoderStats.pausedAt = Date.now();
  } catch (error) { window.officialEncoderStats.error = error.message; window.officialEncoderStats.phase = 'error'; }
};
window.officialEncoderResume = async function () {
  try {
    await window.officialEncoderBegin();
    window.officialEncoderStats.phase = 'resumed';
  } catch (error) { window.officialEncoderStats.error = error.message; window.officialEncoderStats.phase = 'error'; }
};
window.officialEncoderStop = async function () {
  try {
    await window.officialEncoder.stop();
    window.officialEncoderStats.phase = 'stopped';
  } catch (error) { window.officialEncoderStats.error = error.message; window.officialEncoderStats.phase = 'error'; }
};
