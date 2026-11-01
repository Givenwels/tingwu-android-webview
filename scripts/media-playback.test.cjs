const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');
const { execFileSync } = require('node:child_process');

const script = process.env.TINGWU_PLAYBACK_REVISION
  ? execFileSync('git', ['show', process.env.TINGWU_PLAYBACK_REVISION + ':app/src/main/assets/media-playback.js'],
    { cwd: join(__dirname, '..'), encoding: 'utf8' })
  : readFileSync(join(__dirname, '../app/src/main/assets/media-playback.js'), 'utf8');

function fixture(initialPlaying = 0, options = {}) {
  class Events {
    listeners = new Map();
    addEventListener(type, listener) {
      const listeners = this.listeners.get(type) || [];
      listeners.push(listener);
      this.listeners.set(type, listeners);
    }
    emit(type, fields = {}) {
      for (const listener of this.listeners.get(type) || []) listener(fields);
    }
  }
  class Media extends Events {
    paused = true;
    ended = false;
    error = null;
    readyState = 4;
    currentTime = 0;
    duration = 120;
    playbackRate = 1;
    play() {
      this.paused = false;
      this.ended = false;
      this.emit('playing');
      return Promise.resolve();
    }
    pause() { this.paused = true; this.emit('pause'); }
    end() { this.paused = true; this.ended = true; this.emit('ended'); }
  }
  const window = new Events();
  const elements = Array.from({ length: initialPlaying }, () => {
    const media = new Media();
    media.paused = false;
    return media;
  });
  const audio = new Media();
  const player = {
    playing: false,
    $: { isUnmounted: false, isDeactivated: false },
    innerAudioContext: { _audio: audio, play: () => audio.play(), pause: () => audio.pause(),
      stop: () => { audio.pause(); audio.currentTime = 0; }, seek: seconds => { audio.currentTime = seconds; audio.emit('seeked'); } },
    play() { this.playing = true; return this.innerAudioContext.play(); },
    pause() { this.playing = false; this.innerAudioContext.pause(); },
    toggleRevive(action) {
      if (action === 'pause' && !audio.paused) this.innerAudioContext.pause();
      else if (action === 'play' && this.playing) this.innerAudioContext.play();
    },
  };
  const originalRevive = player.toggleRevive;
  const audioRoot = { __vueParentComponent: { type: { name: 'AudioPlayer' }, proxy: player, parent: null } };
  const title = { textContent: '当前录音' };
  const document = Object.assign(new Events(), {
    hidden: true,
    visibilityState: 'hidden',
    title: '网页标题',
    hasFocus: () => false,
    querySelector: selector => selector === '.topContainer .topBar .title' ? title : null,
    querySelectorAll: selector => options.official && selector === '.audioPlayer, .audioPlayerBg' ? [audioRoot] : elements,
  });
  let mutation;
  let now = 10000;
  const context = { window, document, HTMLMediaElement: Media, Date: { now: () => now },
    MutationObserver: class { constructor(callback) { mutation = callback; } observe() {} },
  };
  if (options.official) context.location = { origin: options.origin || 'https://tingwu.aliyun.com' };
  runInNewContext(script, context);
  function connect(data = 'tingwu-media-playback') {
    const messages = [];
    const port = {
      closed: false,
      postMessage(message) { assert.equal(this.closed, false); messages.push(message); },
      close() { this.closed = true; },
    };
    window.emit('message', { data, ports: [port] });
    return { port, messages };
  }
  return { window, document, Media, elements, connect, context, audio, player, title, originalRevive,
    mutate: () => mutation(), advance: milliseconds => { now += milliseconds; } };
}

test('opening an idle page reports stopped, never playing', () => {
  const { connect } = fixture();
  assert.deepEqual(connect().messages, ['stopped']);
});

test('a detached Audio instance starts and stops playback reporting', async () => {
  const f = fixture();
  const { messages } = f.connect();
  const media = new f.Media();
  await media.play();
  media.emit('playing');
  media.pause();
  assert.deepEqual(messages, ['stopped', 'playing', 'stopped']);
});

test('pausing one of multiple players does not stop the remaining player', async () => {
  const f = fixture();
  const { messages } = f.connect();
  const first = new f.Media();
  const second = new f.Media();
  await first.play();
  await second.play();
  first.pause();
  assert.deepEqual(messages, ['stopped', 'playing']);
  second.end();
  assert.deepEqual(messages, ['stopped', 'playing', 'stopped']);
});

test('connection detects audio that was already playing', () => {
  const f = fixture(1);
  const { messages } = f.connect();
  assert.deepEqual(messages, ['playing']);
  f.elements[0].end();
  assert.deepEqual(messages, ['playing', 'stopped']);
});

test('new document media is observed through play events', () => {
  const f = fixture();
  const { messages } = f.connect();
  const media = new f.Media();
  media.paused = false;
  f.document.emit('play', { target: media });
  media.pause();
  assert.deepEqual(messages, ['stopped', 'playing', 'stopped']);
});

test('unrelated messages cannot connect a playback reporting port', async () => {
  const f = fixture();
  const { messages } = f.connect('unrelated');
  await new f.Media().play();
  assert.deepEqual(messages, []);
});

test('reconnecting replaces the port and keeps the current playback state', async () => {
  const f = fixture();
  const old = f.connect();
  const media = new f.Media();
  await media.play();
  runInNewContext(script, f.context);
  const current = f.connect();
  assert.equal(old.port.closed, true);
  assert.deepEqual(current.messages, ['playing']);
  media.pause();
  assert.deepEqual(current.messages, ['playing', 'stopped']);
  assert.deepEqual(old.messages, ['stopped', 'playing']);
});

test('leaving the page releases playback even if audio was still playing', async () => {
  const f = fixture();
  const { port, messages } = f.connect();
  const media = new f.Media();
  await media.play();
  f.window.emit('pagehide');
  media.pause();
  assert.equal(port.closed, true);
  assert.deepEqual(messages, ['stopped', 'playing', 'stopped']);
});

test('page visibility, focus, and visibility events keep their real values', () => {
  const f = fixture();
  f.connect();
  assert.equal(f.document.hidden, true);
  assert.equal(f.document.visibilityState, 'hidden');
  assert.equal(f.document.hasFocus(), false);
  let delivered = false;
  f.document.addEventListener('visibilitychange', () => { delivered = true; });
  f.document.emit('visibilitychange', { stopImmediatePropagation() { assert.fail(); } });
  assert.equal(delivered, true);
});

test('fatal media errors stop playback even when paused and ended remain false', async () => {
  const f = fixture();
  const { messages } = f.connect();
  const media = new f.Media();
  await media.play();
  media.error = { code: 3 };
  media.emit('error');
  assert.equal(media.paused, false);
  assert.equal(media.ended, false);
  assert.deepEqual(messages, ['stopped', 'playing', 'stopped']);
});

test('an emptied media element cannot keep the service active', async () => {
  const f = fixture();
  const { messages } = f.connect();
  const media = new f.Media();
  await media.play();
  media.readyState = 0;
  media.emit('emptied');
  assert.deepEqual(messages, ['stopped', 'playing', 'stopped']);
});

test('resume queries report unchanged playback so a rejected service start can retry', async () => {
  const f = fixture();
  const media = new f.Media();
  await media.play();
  const { port, messages } = f.connect();
  port.onmessage({ data: 'query-state' });
  assert.deepEqual(messages, ['playing', 'playing']);
  media.pause();
  port.onmessage({ data: 'query-state' });
  assert.deepEqual(messages, ['playing', 'playing', 'stopped', 'stopped']);
});

function controls(f) {
  const connection = f.connect();
  connection.port.onmessage({ data: 'enable-controls' });
  return { ...connection, send: data => connection.port.onmessage({ data }),
    snapshots: () => connection.messages.filter(value => value.startsWith('{')).map(value => JSON.parse(value)) };
}

test('native controls negotiate structured state without changing legacy reporting', () => {
  const f = fixture(0, { official: true });
  const connection = f.connect();
  assert.deepEqual(connection.messages, ['stopped']);
  connection.port.onmessage({ data: 'enable-controls' });
  assert.equal(JSON.parse(connection.messages.at(-1)).status, 'idle');
});

test('official lifecycle hide keeps user-started audio playing without forging visibility', async () => {
  const f = fixture(0, { official: true });
  const native = controls(f);
  await f.player.play();
  f.player.toggleRevive('pause');
  assert.equal(f.audio.paused, false);
  assert.equal(f.document.hidden, true);
  assert.equal(f.document.hasFocus(), false);
  assert.equal(native.snapshots().at(-1).status, 'playing');
});

test('native pause and resume update the official player and onShow respects an explicit pause', async () => {
  const f = fixture(0, { official: true });
  const native = controls(f);
  await f.player.play();
  native.send('pause');
  assert.equal(f.audio.paused, true);
  assert.equal(f.player.playing, false);
  f.player.toggleRevive('play');
  assert.equal(f.audio.paused, true);
  native.send('play');
  assert.equal(f.audio.paused, false);
  assert.equal(f.player.playing, true);
  assert.equal(native.snapshots().at(-1).status, 'playing');
});

test('native seek preserves pause, clamps to duration, and stop clears the session', async () => {
  const f = fixture(0, { official: true });
  const native = controls(f);
  await f.player.play();
  native.send('pause');
  native.send('seek:12500');
  assert.equal(f.audio.currentTime, 12.5);
  assert.equal(f.audio.paused, true);
  native.send('seek:13500');
  assert.equal(native.snapshots().at(-1).positionMs, 13500);
  native.send('seek:999999');
  assert.equal(f.audio.currentTime, 120);
  native.send('stop');
  assert.equal(f.audio.paused, true);
  assert.equal(f.audio.currentTime, 0);
  assert.equal(native.snapshots().at(-1).status, 'idle');
});

test('network starvation releases the playing state and canplay restores it without a progress timer', async () => {
  const f = fixture(0, { official: true });
  const native = controls(f);
  await f.player.play();
  f.audio.readyState = 2; f.audio.emit('waiting');
  assert.equal(native.snapshots().at(-1).status, 'buffering');
  f.audio.readyState = 3; f.audio.emit('canplay');
  assert.equal(native.snapshots().at(-1).status, 'playing');
});

test('unrelated HTTPS origins keep their own lifecycle policy', async () => {
  const f = fixture(0, { official: true, origin: 'https://example.org' });
  controls(f);
  await f.player.play();
  assert.equal(f.player.toggleRevive, f.originalRevive);
  f.player.toggleRevive('pause');
  assert.equal(f.audio.paused, true);
});

test('background progress reports are bounded while an explicit query refreshes the current state', async () => {
  const f = fixture(0, { official: true });
  const native = controls(f);
  await f.player.play();
  f.audio.emit('timeupdate');
  const count = native.snapshots().length;
  for (let second = 1; second <= 4; second++) {
    f.advance(1000); f.audio.currentTime = second; f.audio.emit('timeupdate');
  }
  assert.equal(native.snapshots().length, count);
  f.advance(1000); f.audio.currentTime = 5; f.audio.emit('timeupdate');
  assert.equal(native.snapshots().at(-1).positionMs, 5000);
  native.send('query-state');
  assert.equal(native.snapshots().length, count + 2);
});

test('unmounting the actual player clears its media session instead of retaining a stale recording', async () => {
  const f = fixture(0, { official: true });
  const native = controls(f);
  await f.player.play();
  f.player.$.isUnmounted = true;
  f.mutate();
  assert.equal(native.snapshots().at(-1).status, 'idle');
  assert.equal(native.messages.filter(value => value === 'stopped').length, 2);
});

test('reconnecting native controls preserves the selected recording metadata and source state', async () => {
  const f = fixture(0, { official: true });
  const first = controls(f);
  await f.player.play();
  f.title.textContent = '第二条录音'; f.audio.currentTime = 23;
  const second = controls(f);
  assert.equal(first.port.closed, true);
  assert.equal(second.snapshots().at(-1).title, '第二条录音');
  assert.equal(second.snapshots().at(-1).positionMs, 23000);
  second.send('pause');
  assert.equal(second.snapshots().at(-1).status, 'paused');
});
