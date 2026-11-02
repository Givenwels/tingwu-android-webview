// Deployed H5 AudioPlayer + real HTML audio, local silent WAV only. No account or cloud media.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { chromium } = require('playwright-core');

function silentWave(seconds = 90) {
  const bytes = Buffer.alloc(44 + seconds * 8000 * 2);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8000, 24); bytes.writeUInt32LE(16000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36); bytes.writeUInt32LE(bytes.length - 44, 40);
  return bytes;
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true,
    args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 840 },
      userAgent: 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36' });
    await context.route('**/api/**', route => route.fulfill({ contentType: 'application/json',
      body: JSON.stringify({ success: true, code: '0', data: [], total: 0 }) }));
    await context.route('**/assets/index.js', async route => {
      const response = await route.fetch(); const source = await response.text();
      assert.ok(source.includes('Ya(') && source.includes('Ii as b'), 'Inspect the changed deployed Vue runtime before adapting');
      await route.fulfill({ response, body: source + '\nwindow.__tingwuTestVue={createApp:Ya,vnode:Ii,store:q_};' });
    });
    await context.route('**/pages-Meeting-Result.*.js', async route => {
      const response = await route.fetch(); const source = await response.text();
      assert.ok(source.includes('const Mn=') && source.includes('name:"AudioPlayer"'), 'The official AudioPlayer changed');
      await route.fulfill({ response, body: source + '\nwindow.__tingwuTestAudioPlayer=Mn;' });
    });
    await context.route('**/__tingwu_test__/audio.wav', route => {
      const bytes = silentWave();
      const range = /bytes=(\d+)-(\d*)/.exec(route.request().headers().range || '');
      const start = range ? Number(range[1]) : 0;
      const end = range && range[2] ? Math.min(Number(range[2]), bytes.length - 1) : bytes.length - 1;
      const headers = { 'Accept-Ranges': 'bytes', 'Content-Length': String(end - start + 1) };
      if (range) headers['Content-Range'] = `bytes ${start}-${end}/${bytes.length}`;
      return route.fulfill({ status: range ? 206 : 200, contentType: 'audio/wav', headers, body: bytes.subarray(start, end + 1) });
    });
    const page = await context.newPage(); page.setDefaultTimeout(10000);
    await page.goto('https://tingwu.aliyun.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForFunction(() => !!window.__tingwuTestVue);
    await page.evaluate(async () => {
      await import('https://g.alicdn.com/bshop/uni-tingwu/2.9.82/assets/pages-Meeting-Result.7a768035.js');
      const original = document.querySelector('#app').__vue_app__;
      if (original) original.unmount();
      document.body.innerHTML = '<div class="topContainer"><div class="topBar"><div class="title">本地播放测试</div></div></div><div id="playback-test"></div>';
      const vue = window.__tingwuTestVue;
      const app = vue.createApp({ render() { return vue.vnode(window.__tingwuTestAudioPlayer, {
        ref: 'player', src: location.origin + '/__tingwu_test__/audio.wav', duration: 90,
        transId: 'local-audio-test', result: [], lang: 'cn',
      }); } });
      app.use(vue.store);
      window.testRoot = app.mount('#playback-test');
      window.testPlayer = window.testRoot.$refs.player;
    });
    await page.addScriptTag({ content: readFileSync(join(__dirname, '../app/src/main/assets/media-playback.js'), 'utf8') });
    await page.evaluate(() => {
      window.playbackMessages = [];
      const channel = new MessageChannel();
      window.nativePlaybackPort = channel.port1;
      channel.port1.onmessage = event => window.playbackMessages.push(event.data);
      window.postMessage('tingwu-media-playback', location.origin, [channel.port2]);
      channel.port1.postMessage('enable-controls');
    });
    await page.locator('.audioPlayer .action.play').click();
    await page.waitForFunction(() => window.testPlayer.innerAudioContext._audio.currentTime > 0.1);
    await page.evaluate(() => window.testPlayer.innerAudioContext._audio.pause());
    await page.waitForFunction(() => window.testPlayer.innerAudioContext.paused);
    assert.equal(await page.evaluate(() => window.testPlayer.playing), false,
      'An external/system pause must update the deployed AudioPlayer button state');
    await page.locator('.audioPlayer .action.play').click();
    await page.waitForFunction(() => !window.testPlayer.innerAudioContext.paused);
    // Only this test simulates visibility. Production must never forge visibility or focus.
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      window.testPlayer.toggleRevive('pause');
    });
    assert.equal(await page.evaluate(() => window.testPlayer.innerAudioContext.paused), false,
      'The deployed onHide/toggleRevive policy stopped a user-started background playback');
    await page.evaluate(() => window.nativePlaybackPort.postMessage('pause'));
    await page.waitForFunction(() => window.testPlayer.innerAudioContext.paused && !window.testPlayer.playing);
    await page.evaluate(() => window.testPlayer.toggleRevive('play'));
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => window.testPlayer.innerAudioContext.paused), true,
      'Returning to the app must not undo an explicit pause');
    await page.evaluate(() => window.nativePlaybackPort.postMessage('play'));
    await page.waitForFunction(() => !window.testPlayer.innerAudioContext.paused && window.testPlayer.playing);
    await page.evaluate(() => window.nativePlaybackPort.postMessage('seek:12000'));
    await page.waitForFunction(() => window.testPlayer.innerAudioContext.currentTime >= 12);
    await page.evaluate(() => window.nativePlaybackPort.postMessage('stop'));
    await page.waitForFunction(() => window.testPlayer.innerAudioContext.paused);
    assert.equal(await page.evaluate(() => document.hidden), true);
    assert.equal(await page.evaluate(() => document.visibilityState), 'hidden');
    console.log(JSON.stringify({ result: 'PASS', source: 'deployed official H5 AudioPlayer/innerAudioContext',
      audio: 'local silent WAV', backgroundPolicy: 'PASS', nativePauseResumeSeekStop: 'PASS', realVisibilityPreserved: 'PASS' }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
