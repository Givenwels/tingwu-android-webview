// Optional network integration check: renders the deployed pre-record component in an isolated
// browser with fake microphone input. Meeting APIs/analytics are replaced with local no-ops;
// this never logs in, creates a cloud meeting, or captures the host microphone.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: [
    '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
  ] });
  try {
    const context = await browser.newContext({ viewport: { width: 412, height: 840 },
      permissions: ['microphone'], userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36' });
    await context.route('**/mind-meeting-assistant2/*/umi.js', async route => {
      const response = await route.fetch();
      const source = await response.text();
      assert.ok(source.includes('o.m=e,o.c=n'), 'The official bundle runtime changed; inspect before adapting the test.');
      await route.fulfill({ response, body: source.replace('o.m=e,o.c=n', 'window.__tingwuComponentRequire=o,o.m=e,o.c=n') });
    });
    const page = await context.newPage();
    await page.goto('https://tingwu.aliyun.com/home', { waitUntil: 'networkidle', timeout: 45000 });
    await page.evaluate(() => {
      const require = window.__tingwuComponentRequire;
      require('sCiz').unmountComponentAtNode(document.querySelector('#root'));
      history.replaceState({}, '', '/doc/record');
      document.body.innerHTML = '<div id="root"><nav>Desktop navigation</nav><div class="desktop-record"><div class="desktop-topbar"><div class="viewport"><div class="meeting-title">实时记录测试</div><p>已保存</p></div></div><div class="leftContain"></div><div class="content"><div class="before-record" id="official-prestart"></div><div class="rightArea">会议笔记</div></div></div></div>';
      window.messages = [];
      window.TingwuRecorder = { postMessage: value => window.messages.push(JSON.parse(value)) };
      window.officialStartRequested = 0;
      const overrides = {
        '9kvl': { w: select => select({ meetingModel: { transId: 'local-component-test' } }), v: () => () => {} },
        'jb7i': {},
        'Ht9d': { default: { syncTransTag: () => Promise.resolve(), configMeeting: () => Promise.resolve() } },
        'FGy4': { c: () => {} },
        'gOx4': { a: () => null },
      };
      const localRequire = id => Object.prototype.hasOwnProperty.call(overrides, id) ? overrides[id] : require(id);
      Object.assign(localRequire, require);
      const module = { exports: {} };
      require.m.jYMI(module, module.exports, localRequire);
      window.renderOfficialPrestart = () => require('sCiz').render(
        require('tdn7').createElement(module.exports.a, {
          meetingId: 'local-component-test', beginRecord: () => window.officialStartRequested++,
        }), document.querySelector('#official-prestart'),
      );
    });
    // Retain the real deployed site styles and supplement only the surrounding test scaffold.
    const fixture = readFileSync(join(__dirname, 'fixtures/desktop-recorder-prestart.html'), 'utf8');
    await page.addStyleTag({ content: fixture.match(/<style>([\s\S]*?)<\/style>/)[1] });
    await page.addScriptTag({ content: readFileSync(join(__dirname, '../app/src/main/assets/recorder-mobile.js'), 'utf8') });
    await page.evaluate(() => window.renderOfficialPrestart());
    await page.waitForFunction(() => document.querySelector('[data-tingwu-recorder-setup]'));
    for (const width of [320, 360, 412]) {
      await page.setViewportSize({ width, height: 840 });
      const metrics = await page.evaluate(() => {
        const language = document.querySelector('[data-e2e-test-id="beforeRecord_chooseLan_select"]');
        const translation = document.querySelector('[data-e2e-test-id="beforeRecord_chooseTransLan_select"]');
        return [document.querySelector('[data-e2e-test-id="beforeRecord_start_button"]'),
          ...language.parentElement.children, translation.parentElement].map(element => {
          const box = element.getBoundingClientRect();
          return { text: element.textContent.trim(), x: box.x, right: box.right, height: box.height };
        });
      });
      assert.ok(metrics.every(box => box.x >= 10 && box.right <= width - 10 && box.height >= 44), JSON.stringify({ width, metrics }));
      console.log(`Official jYMI pre-record controls fit ${width}px`);
    }
    // The real EDhS microphone preflight must resolve before the component permits starting.
    await page.waitForFunction(() => window.messages.some(message => message.type === 'capture' && message.active));
    await page.waitForFunction(() => window.messages.some(message => message.type === 'capture' && !message.active));
    await page.locator('[data-e2e-test-id="beforeRecord_start_button"]').click();
    await page.waitForFunction(() => window.officialStartRequested === 1);
    assert.equal(await page.locator('.versionMicTipHigh').count(), 0, 'The official component still reports a microphone failure');
    if (process.env.TINGWU_OFFICIAL_SCREENSHOT) await page.screenshot({ path: process.env.TINGWU_OFFICIAL_SCREENSHOT, fullPage: true });
    console.log('Official microphone preflight passed and the existing start control invoked beginRecord.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
