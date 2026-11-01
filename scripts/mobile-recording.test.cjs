const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test, before, after } = require('node:test');
const { chromium } = require('playwright-core');

const asset = name => {
  const path = join(__dirname, '../app/src/main/assets', name);
  return existsSync(path) ? readFileSync(path, 'utf8') : 'void 0;';
};
const fixture = name => readFileSync(join(__dirname, 'fixtures', name), 'utf8');
let browser;
before(async () => {
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: [
    '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
  ] });
});
after(async () => { await browser?.close(); });

test('microphone preflight is distinct from an actual recording session and pause clears protection', async () => {
  const { context, page } = await pageFor(fixture('desktop-recorder-prestart.html'));
  try {
    await page.addScriptTag({ content: asset('recorder-mobile.js') });
    await page.evaluate(async () => { window.stream = await navigator.mediaDevices.getUserMedia({ audio: true }); });
    await page.waitForFunction(() => window.messages.some(message => message.type === 'capture' && message.active && message.recording === false));
    await page.evaluate(() => {
      const controls = document.createElement('div');
      controls.className = 'bottomContain';
      controls.innerHTML = '<div class="stop-btn" data-e2e-test-id="record_finish_icon">结束</div>';
      document.querySelector('.desktop-record > .content').appendChild(controls);
    });
    await page.waitForFunction(() => window.messages.some(message => message.type === 'capture' && message.active && message.recording === true));
    await page.evaluate(() => window.stream.getTracks().forEach(track => track.stop()));
    await page.waitForFunction(() => window.messages.some(message => message.type === 'capture' && !message.active && message.recording === false));
  } finally { await context.close(); }
});

test('finish confirmation content and buttons fit a narrow phone without changing the save flow', async () => {
  const { context, page } = await pageFor(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <div class="ant-modal-wrap"><div class="ant-modal" style="width:520px"><div class="ant-modal-content"><div class="ant-modal-body">
    <div class="ant-modal-confirm-body"><span class="ant-modal-confirm-title">结束本次实时记录并保存到我的记录</span>
    <div class="ant-modal-confirm-content" style="width:400px;margin-left:38px"><div class="ant-select" style="width:380px">保存记录</div></div></div>
    <div class="ant-modal-confirm-btns"><button onclick="window.choice='cancel'">继续录音</button><button onclick="window.choice='save'">结束并保存</button></div>
    </div></div></div></div>`, { viewport: { width: 320, height: 800 } });
  try {
    await page.addScriptTag({ content: asset('recorder-mobile.js') });
    await page.waitForFunction(() => document.documentElement.dataset.tingwuRecorderStage === 'configuration');
    for (const element of await page.locator('.ant-modal-confirm-content, .ant-select, .ant-modal button').all()) {
      const box = await element.boundingBox();
      assert.ok(box.x >= 16 && box.x + box.width <= 304, `finish dialog control clipped: ${JSON.stringify(box)}`);
    }
    await page.getByRole('button', { name: '继续录音', exact: true }).click();
    assert.equal(await page.evaluate(() => window.choice), 'cancel');
    await page.getByRole('button', { name: '结束并保存', exact: true }).click();
    assert.equal(await page.evaluate(() => window.choice), 'save');
  } finally { await context.close(); }
});

async function pageFor(html, options = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 800 },
    permissions: ['microphone'], ...options });
  // Every request is fulfilled locally: no real account, room microphone, or cloud meeting.
  await context.route('**/*', route => route.fulfill({ contentType: 'text/html', body: html }));
  const page = await context.newPage();
  page.setDefaultTimeout(2500);
  await page.goto('https://tingwu.aliyun.com/home');
  return { context, page };
}

test('existing mobile realtime button opens recording without showing the PC-only modal', async () => {
  const { context, page } = await pageFor(fixture('mobile-home.html'));
  try {
    await page.addScriptTag({ content: asset('mobile-record-entry.js') });
    await page.getByText('实时记录', { exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.messages), ['open-recording']);
    assert.equal(await page.locator('#unsupported').isVisible(), false);
  } finally { await context.close(); }
});

test('the homepage keeps its viewport, other actions, and record cards', async () => {
  const { context, page } = await pageFor(fixture('mobile-home.html'));
  try {
    const original = await page.locator('meta[name=viewport]').getAttribute('content');
    await page.addScriptTag({ content: asset('mobile-record-entry.js') });
    await page.locator('#upload').click();
    await page.locator('.record-card').click();
    assert.deepEqual(await page.evaluate(() => window.messages), []);
    assert.equal(await page.locator('meta[name=viewport]').getAttribute('content'), original);
    assert.equal(await page.locator('.menuItem').count(), 2);
  } finally { await context.close(); }
});

test('recording uses the official create flow and shows a phone-sized configuration dialog', async () => {
  const { context, page } = await pageFor(fixture('desktop-recorder.html'));
  try {
    await page.addScriptTag({ content: asset('recorder-mobile.js') });
    await page.waitForFunction(() => window.messages.some(message => message.type === 'ready'));
    assert.equal(await page.locator('#begin-record').isVisible(), true);
    const box = await page.locator('.ant-modal').boundingBox();
    assert.ok(box.width <= 374, `configuration dialog too wide: ${box.width}`);
    assert.equal(await page.locator('#root').evaluate(element => getComputedStyle(element).opacity), '0');
  } finally { await context.close(); }
});

for (const width of [320, 360, 412]) {
  test(`the actual pre-record language, translation and start controls fit ${width}px`, async () => {
    const { context, page } = await pageFor(fixture('desktop-recorder-prestart.html'), {
      viewport: { width, height: 800 },
    });
    try {
      await page.addScriptTag({ content: asset('recorder-mobile.js') });
      await page.waitForFunction(() => document.querySelector('.tingwu-mobile-recording'));
      const controls = page.locator('[data-e2e-test-id="beforeRecord_start_button"], .languages > div, .translate-item-des');
      for (const control of await controls.all()) {
        const box = await control.boundingBox();
        assert.ok(box && box.x >= 10 && box.x + box.width <= width - 10,
          `pre-record control is clipped at ${width}px: ${JSON.stringify(box)}`);
        assert.ok(box.height >= 44, `pre-record touch target is too small: ${JSON.stringify(box)}`);
      }
      const start = await page.locator('[data-e2e-test-id="beforeRecord_start_button"]').boundingBox();
      assert.ok(start.y + start.height < 680, `start control is pushed below the phone screen: ${JSON.stringify(start)}`);
      await page.waitForFunction(() => window.preflightComplete);
      assert.equal(await page.evaluate(() => window.microphoneAllowed), true);
      await page.locator('[data-e2e-test-id="beforeRecord_start_button"]').click();
      await page.waitForFunction(() => window.stream?.getAudioTracks()[0].readyState === 'live');
      if (width === 412 && process.env.TINGWU_PRESTART_SCREENSHOT) {
        await page.screenshot({ path: process.env.TINGWU_PRESTART_SCREENSHOT, fullPage: true });
      }
      await page.evaluate(() => window.stream.getTracks().forEach(track => track.stop()));
    } finally { await context.close(); }
  });
}

test('the desktop homepage record card also starts the official configuration flow', async () => {
  const html = fixture('desktop-recorder.html').replace(
    '<button class="addSummaryBtn" onclick="document.querySelector(\'#new-menu\').hidden=false">新建</button>',
    '<div data-e2e-test-id="home_trans_div" class="ButtonList" onclick="showLanguage()"><div class="ButtonTitle">开启实时记录</div><div>实时语音转文字，同步翻译</div></div>',
  );
  const { context, page } = await pageFor(html);
  try {
    await page.addScriptTag({ content: asset('recorder-mobile.js') });
    await page.waitForFunction(() => window.messages.some(message => message.type === 'ready'));
    assert.equal(await page.locator('#begin-record').isVisible(), true);
  } finally { await context.close(); }
});

for (const width of [360, 412]) {
  test(`recording layout fits ${width}px and real synthetic microphone tracks release on stop`, async () => {
    const { context, page } = await pageFor(fixture('desktop-recorder.html'), {
      viewport: { width, height: 840 },
    });
    try {
      await page.addScriptTag({ content: asset('recorder-mobile.js') });
      await page.locator('#begin-record').click();
      await page.waitForFunction(() => window.messages.some(message => message.type === 'capture' && message.active));
      const metrics = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
      assert.ok(metrics.scroll <= metrics.width + 1, `horizontal overflow: ${JSON.stringify(metrics)}`);
      const button = await page.locator('.stop-btn').boundingBox();
      assert.ok(button.width >= 44 && button.height >= 44);
      assert.equal(await page.locator('.leftContain').isVisible(), false);
      if (width === 412 && process.env.TINGWU_UI_SCREENSHOT) {
        await page.screenshot({ path: process.env.TINGWU_UI_SCREENSHOT, fullPage: true });
      }
      await page.locator('.stop-btn').click();
      await page.waitForFunction(() => window.messages.some(message => message.type === 'completed'));
      assert.equal(await page.evaluate(() => window.stream.getAudioTracks()[0].readyState), 'ended');
      assert.ok(await page.evaluate(() => window.messages.some(message => message.type === 'capture' && !message.active)));
    } finally { await context.close(); }
  });
}

test('native back requests use the official finish control before returning', async () => {
  const { context, page } = await pageFor(fixture('desktop-recorder.html'));
  try {
    await page.addScriptTag({ content: asset('recorder-mobile.js') });
    await page.locator('#begin-record').click();
    await page.waitForFunction(() => window.messages.some(message => message.type === 'capture' && message.active));
    await page.evaluate(() => window.postMessage('tingwu-recorder-exit', location.origin));
    await page.waitForFunction(() => window.messages.some(message => message.type === 'completed'));
    assert.equal(await page.evaluate(() => window.stream.getAudioTracks()[0].readyState), 'ended');
  } finally { await context.close(); }
});

test('nested desktop shells and toolbar wrappers cannot keep desktop widths or fixed controls', async () => {
  const { context, page } = await pageFor(fixture('desktop-recorder.html'));
  try {
    await page.addScriptTag({ content: asset('recorder-mobile.js') });
    await page.locator('#begin-record').click();
    await page.waitForFunction(() => window.messages.some(message => message.type === 'capture' && message.active));
    await page.evaluate(() => {
      const root = document.querySelector('.tingwu-mobile-recording');
      const shell = document.createElement('div');
      shell.style.cssText = 'min-width:1140px;width:1140px;height:100vh;overflow:hidden';
      root.before(shell);
      shell.append(root);
      const top = root.querySelector('.desktop-topbar');
      const frame = document.createElement('div');
      frame.id = 'desktop-inner-topbar';
      frame.style.cssText = 'min-width:1140px;width:1140px';
      Array.from(top.children).forEach(child => frame.append(child));
      top.append(frame);
      const controls = root.querySelector('.bottomContain');
      const wrapper = document.createElement('div');
      wrapper.id = 'desktop-control-wrapper';
      wrapper.style.cssText = 'position:absolute;width:700px;min-width:700px;height:88px;bottom:20px';
      controls.before(wrapper);
      wrapper.append(controls);
    });
    await page.waitForFunction(() => {
      const top = document.querySelector('#desktop-inner-topbar');
      const controls = document.querySelector('#desktop-control-wrapper');
      return top.getBoundingClientRect().width <= innerWidth &&
        controls.getBoundingClientRect().width <= innerWidth && getComputedStyle(controls).position === 'relative';
    });
    assert.equal(await page.locator('.stop-btn').isVisible(), true);
  } finally { await context.close(); }
});

test('scripted clicks do not trigger a native recording screen', async () => {
  const { context, page } = await pageFor(fixture('mobile-home.html'));
  try {
    await page.addScriptTag({ content: asset('mobile-record-entry.js') });
    await page.locator('.menuItem').first().evaluate(element => element.click());
    assert.deepEqual(await page.evaluate(() => window.messages), []);
  } finally { await context.close(); }
});

test('older WebView message-port transport still opens the recording screen', async () => {
  const { context, page } = await pageFor(fixture('mobile-home.html'));
  try {
    await page.addScriptTag({ content: asset('mobile-record-entry.js') });
    await page.evaluate(() => {
      delete window.TingwuRecordingEntry;
      const channel = new MessageChannel();
      channel.port1.onmessage = event => window.messages.push(event.data);
      window.postMessage('tingwu-media-playback', location.origin, [channel.port2]);
    });
    await page.getByText('实时记录', { exact: true }).click();
    await page.waitForFunction(() => window.messages.length > 0);
    assert.deepEqual(await page.evaluate(() => window.messages), ['open-recording']);
    assert.equal(await page.locator('#unsupported').isVisible(), false);
  } finally { await context.close(); }
});

test('non-Tingwu pages do not receive recording UI or native actions', async () => {
  const { context, page } = await pageFor(fixture('mobile-home.html'));
  try {
    await page.goto('https://example.org/home');
    const viewport = await page.locator('meta[name=viewport]').getAttribute('content');
    await page.addScriptTag({ content: asset('mobile-record-entry.js') });
    await page.addScriptTag({ content: asset('recorder-mobile.js') });
    await page.getByText('实时记录', { exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.messages), []);
    assert.equal(await page.locator('#tingwu-recorder-mobile-style').count(), 0);
    assert.equal(await page.locator('meta[name=viewport]').getAttribute('content'), viewport);
  } finally { await context.close(); }
});

for (const width of [320, 390, 412]) {
  test(`active recording panels fit ${width}px without desktop offsets or overlapping notes`, async () => {
    const { context, page } = await pageFor(fixture('desktop-recorder-active.html'), {
      viewport: { width, height: 840 },
    });
    try {
      await page.addScriptTag({ content: asset('recorder-mobile.js') });
      await page.waitForFunction(() => document.querySelector('.tingwu-mobile-recording'));
      await page.evaluate(() => window.requestMic());
      for (const state of ['running', 'paused']) {
        if (state === 'paused') await page.locator('.play-btn').click();
        const metrics = await page.evaluate(() => {
          const rect = selector => {
            const box = document.querySelector(selector).getBoundingClientRect();
            return { x: box.x, right: box.right, y: box.y, bottom: box.bottom, height: box.height };
          };
          return { title:rect('.meeting-title'), transcript:rect('.summary-area'), toolbar:rect('.top'),
            text:rect('.summary-container'), controls:rect('.bottomContain'), notes:rect('.rightArea'),
            stop:rect('.stop-btn'), pause:rect('.play-btn') };
        });
        for (const key of ['transcript', 'controls', 'notes']) {
          const box = metrics[key];
          assert.ok(box.x >= 10 && box.x <= 16 && box.right <= width - 10,
            `${state}: ${key} retains a desktop offset: ${JSON.stringify(box)}`);
        }
        assert.ok(metrics.toolbar.y >= metrics.transcript.y && metrics.toolbar.bottom <= metrics.text.y + 1,
          `${state}: toolbar overlaps title/transcript: ${JSON.stringify(metrics)}`);
        assert.ok(metrics.text.height >= 200, `${state}: transcript viewport collapsed`);
        assert.ok(metrics.notes.y >= metrics.controls.bottom + 8, `${state}: notes overlap recording controls`);
        for (const key of ['stop', 'pause']) {
          const box = metrics[key];
          assert.ok(box.x >= metrics.controls.x && box.right <= metrics.controls.right && box.height >= 44,
            `${state}: ${key} is outside the recording control bar`);
        }
      }
      if (width === 390 && process.env.TINGWU_ACTIVE_SCREENSHOT) {
        await page.screenshot({ path: process.env.TINGWU_ACTIVE_SCREENSHOT, fullPage: true });
      }
      await page.locator('.stop-btn').click();
      await page.waitForFunction(() => window.messages.some(message => message.type === 'completed'));
      assert.equal(await page.evaluate(() => window.stream.getAudioTracks()[0].readyState), 'ended');
    } finally { await context.close(); }
  });
}
