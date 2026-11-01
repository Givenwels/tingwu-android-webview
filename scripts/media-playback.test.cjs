const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');

const script = readFileSync(join(__dirname, '../app/src/main/assets/media-playback.js'), 'utf8');

function fixture(initialPlaying = 0) {
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
  const document = Object.assign(new Events(), {
    hidden: true,
    visibilityState: 'hidden',
    hasFocus: () => false,
    querySelectorAll: () => elements,
  });
  const context = { window, document, HTMLMediaElement: Media };
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
  return { window, document, Media, elements, connect, context };
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
