// Layout integration check using the deployed recording shell, title and recording controls.
// Transcript text and notes are local placeholders; no account or cloud meeting is created.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 840 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36' });
    await context.route('**/mind-meeting-assistant2/*/umi.js', async route => {
      const response = await route.fetch();
      const source = await response.text();
      assert.ok(source.includes('o.m=e,o.c=n'), 'The official runtime changed');
      await route.fulfill({ response, body: source.replace('o.m=e,o.c=n', 'window.__tingwuLayoutRequire=o,o.m=e,o.c=n') });
    });
    await context.route('**/layouts__index.p__docNew__pageLive.p__docNew__pageRecord.*.async.js', async route => {
      const response = await route.fetch();
      const source = await response.text();
      const marker = 'n.d(t,"a",(function(){return mn}));';
      assert.ok(source.includes(marker), 'The official recording controls changed');
      await route.fulfill({ response, body: source.replace(marker,
        marker + 'n.d(t,"__phoneControls",function(){return ve});n.d(t,"__phoneHeader",function(){return T});') });
    });
    const page = await context.newPage();
    await page.goto('https://tingwu.aliyun.com/home', { waitUntil: 'networkidle', timeout: 45000 });
    await page.evaluate(async () => {
      const require = window.__tingwuLayoutRequire;
      await Promise.all([0, 1, 2, 3, 4, 5].map(id => require.e(id)));
      const React = require('tdn7');
      const DOM = require('sCiz');
      const Root = require('FJt9').a;
      const HeaderFrame = require('+vzo').__phoneHeader;
      const Header = require('ytgv').b;
      const Controls = require('+vzo').__phoneControls;
      const recoil = Object.values(require.c).map(module => module.exports).find(value => value && value.RecoilRoot);
      if (!recoil) throw new Error('The official layout state provider is unavailable');
      DOM.unmountComponentAtNode(document.querySelector('#root'));
      history.replaceState({}, '', '/doc/record');
      document.body.innerHTML = '<div id="root"></div>';
      window.messages = [];
      window.TingwuRecorder = { postMessage: value => window.messages.push(JSON.parse(value)) };
      window.recordingState = 'running';
      const h = React.createElement;
      const setState = state => { window.recordingState = state; window.renderActiveRecorder(); };
      window.renderActiveRecorder = () => DOM.render(h(recoil.RecoilRoot, null, h(Root, null,
        h(HeaderFrame, null, h(Header, { transId: 'local-layout-test', meetingName: '2026-11-01 会议记录', readonly: true })),
        h('div', { className: 'leftContain' }),
        h('div', { className: 'content' },
          h('div', { className: 'left-area' },
            h('div', { className: 'summary-area' },
              h('div', { className: 'top' }, ...['搜索', '筛选', '翻译', '热词'].map(label => h('div', { className: 'top-button', key: label }, label))),
              h('div', { className: 'summary-container' }, h('div', { style: { height: 0, flexGrow: 1, overflow: 'hidden' } },
                h('div', { className: 'container' }, h('p', null, '00:00　发言人 1'),
                  h('p', null, '会议内容会在这里实时转写。手机屏幕应完整显示每一行文字。'),
                  h('p', null, '00:08　发言人 2'), h('p', null, '录音控制和会议笔记依次排列，互不遮挡。')))),
            ),
            h(Controls, { recordStatus: window.recordingState, onRecordStatusChange: setState,
              meetingState: require('R80P').b.InMeeting, formatTime: '00:20' }),
          ),
          h('div', { className: 'rightArea' }, h('div', { className: 'local-note-editor' },
            h('div', { className: 'local-note-toolbar' }, '正文　11　B　A　···'),
            h('div', { className: 'local-note-body', contentEditable: true, suppressContentEditableWarning: true }, '会议笔记'),
            h('div', { className: 'local-note-footer' }, '万语千言，心领神悟'))),
        ),
      )), document.querySelector('#root'));
      window.renderActiveRecorder();
    });
    await page.addStyleTag({ content: `body{margin:0;font-family:Arial,"Microsoft YaHei",sans-serif}
      .local-note-editor{height:100%;display:flex;flex-direction:column;background:#fff}
      .local-note-toolbar{padding:12px 16px;white-space:nowrap;overflow-x:auto}
      .local-note-body{flex:1;padding:16px}.local-note-footer{padding:8px;text-align:center;color:#aaa;border-top:1px solid #eee}` });
    await page.addScriptTag({ content: readFileSync(join(__dirname, '../app/src/main/assets/recorder-mobile.js'), 'utf8') });
    await page.waitForFunction(() => document.querySelector('.tingwu-mobile-recording'));
    const overflow = await page.evaluate(() => ({ body: getComputedStyle(document.body).overflowY,
      html: getComputedStyle(document.documentElement).overflowY }));
    assert.ok(!['hidden', 'clip'].includes(overflow.body) && !['hidden', 'clip'].includes(overflow.html),
      `The official desktop page still locks phone scrolling: ${JSON.stringify(overflow)}`);
    for (const width of [320, 390, 412]) {
      await page.setViewportSize({ width, height: 840 });
      for (const state of ['running', 'pause']) {
        await page.evaluate(value => { window.recordingState = value; window.renderActiveRecorder(); }, state);
        const metrics = await page.evaluate(() => {
          const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect();
            return { x:r.x, right:r.right, y:r.y, bottom:r.bottom, height:r.height }; };
          return { title:rect('.meeting-title'), toolbar:rect('.top'), text:rect('.summary-container'),
            transcript:rect('.summary-area'), controls:rect('.bottomContain'), notes:rect('.rightArea'),
            stop:rect('.stop-btn'), pause:rect('.play-btn') };
        });
        for (const key of ['transcript', 'controls', 'notes']) {
          const box = metrics[key];
          assert.ok(box.x >= 10 && box.x <= 16 && box.right <= width - 10, JSON.stringify({ width, state, key, box }));
        }
        assert.ok(metrics.toolbar.y >= metrics.transcript.y && metrics.toolbar.bottom <= metrics.text.y + 1, JSON.stringify(metrics));
        assert.ok(metrics.text.height >= 200 && metrics.notes.y >= metrics.controls.bottom + 8, JSON.stringify(metrics));
        for (const key of ['stop', 'pause']) assert.ok(metrics[key].height >= 44 && metrics[key].right <= metrics.controls.right);
        console.log(`Official active recorder fits ${width}px (${state})`);
        if (width === 390 && state === 'running' && process.env.TINGWU_OFFICIAL_ACTIVE_SCREENSHOT) {
          await page.screenshot({ path: process.env.TINGWU_OFFICIAL_ACTIVE_SCREENSHOT, fullPage: true });
        }
      }
    }
    await page.locator('.play-btn').click();
    await page.waitForFunction(() => window.recordingState === 'running');
    await page.locator('.stop-btn').click();
    await page.waitForFunction(() => window.recordingState === 'stop');
    await page.mouse.wheel(0, 1600);
    await page.waitForFunction(() => {
      const element = document.querySelector('.local-note-footer');
      const r = element.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= innerHeight && element.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    });
    console.log('Official resume and stop controls remain interactive.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
