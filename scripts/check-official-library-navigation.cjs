// Network integration: real uni-tingwu 2.9.82 components/router/store, local API/audio only.
// Run with: node --test scripts/check-official-library-navigation.cjs
// Reproduce the old bug with $env:TINGWU_LIBRARY_REVISION='e00a7c2' in PowerShell.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test, before, after } = require('node:test');
const { chromium } = require('playwright-core');

const cdn = 'https://g.alicdn.com/bshop/uni-tingwu/2.9.82/';
const origin = 'https://tingwu.aliyun.com';
const user = { userId: 'local-navigation-user', isNew: false, nickName: '本地导航测试', avatar: '' };
const rows = Array.from({ length: 15 }, (_, index) => ({
  transId: 'local-navigation-' + index,
  tag: { showName: index >= 12 ? 'Navigation record ' + 'ABC'[index - 12] : 'Other record ' + index, lang: 'cn' },
  status: 0,
}));
const selectedRows = rows.slice(-3);
const transcript = row => 'Transcript belonging only to ' + row.transId;
const audioUrl = row => origin + '/__local_navigation_audio__/' + row.transId + '.wav';
const librarySource = process.env.TINGWU_LIBRARY_REVISION
  ? execFileSync('git', ['show', process.env.TINGWU_LIBRARY_REVISION + ':app/src/main/assets/mobile-library.js'],
    { cwd: join(__dirname, '..'), encoding: 'utf8' })
  : readFileSync(join(__dirname, '../app/src/main/assets/mobile-library.js'), 'utf8');

// A playable one-second PCM WAV. Each selected record has its own request/source URL.
const wav = Buffer.alloc(44 + 16000 * 2);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);

let browser;
before(async () => { browser = await chromium.launch({ channel: 'chrome', headless: true }); });
after(async () => { await browser?.close(); });

async function setup() {
  const context = await browser.newContext({ viewport: { width: 390, height: 840 },
    userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36' });
  const requests = [];
  const errors = [];
  await context.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    let data;
    try { data = request.postDataJSON() || {}; } catch (_) { data = {}; }
    requests.push({ path, ...data });
    let result = {};
    let total;
    if (/user\/info|account\/info/.test(path)) result = user;
    else if (/queryUserEquityInfo/.test(path)) result = { equityAllTimeFlow: 3600000, equityExpendTimeFlow: 0,
      equityAllStorage: 1073741824, equityExpendStorage: 0 };
    else if (data.action === 'getDirList') result = [{ dirId: 12, dirName: 'Navigation folder', children: [] }];
    else if (data.action === 'getTransList') {
      result = data.filter?.dirId === 12 ? rows : selectedRows;
      total = result.length;
    } else if (data.action === 'getTransResult') {
      const row = rows.find(row => row.transId === data.transId);
      assert.ok(row, 'Unexpected detail request: ' + data.transId);
      result = { ...row, duration: 1, playback: audioUrl(row), audioSegments: '[]',
        result: JSON.stringify({ pg: [{ pi: 0, ui: 'speaker', sc: [{ si: 0, bt: 0, et: 1000, tc: transcript(row) }] }] }),
        translateResult: '{"pg":[]}', collectStatus: 0, showTime: 1790812800000 };
    } else if (data.action === 'getFileTranslation') result = { translatedDoc: '{"pg":[]}', status: 0 };
    else if (data.action === 'getAllLabInfo') result = { labCardsMap: { labInfo: [], labSummaryInfo: [], labPptInfo: [] } };
    else if (data.action === 'getTransStatus') result = [{ transId: data.transIds[0], status: 0 }];
    else if (data.action === 'getTransTag') result = rows.find(row => row.transId === data.transId)?.tag || {};
    else if (/get.*(?:List|Tasks)/i.test(data.action || '')) result = [];
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, code: '0', data: result, total }) });
  });
  await context.route('**/__local_navigation_audio__/*.wav', route => route.fulfill({ contentType: 'audio/wav', body: wav }));
  await context.addInitScript(user => {
    localStorage.setItem('__user_info__', JSON.stringify({ type: 'object', data: user }));
    localStorage.setItem('copyGuideAi', JSON.stringify({ type: 'number', data: 1 }));
    localStorage.setItem('copyGuideOrigin', JSON.stringify({ type: 'number', data: 1 }));
  }, user);
  await context.addInitScript({ content: librarySource });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.getByRole('button', { name: '打开文件夹 Navigation folder', exact: true }).waitFor();
  assert.equal(await page.locator(`script[type="module"][src="//g.alicdn.com/bshop/uni-tingwu/2.9.82/assets/index.js"]`).count(), 1,
    'This regression targets the deployed uni-tingwu 2.9.82 lifecycle at ' + cdn);
  assert.equal(await page.evaluate(() => typeof window.uni.navigateTo), 'undefined',
    'The integration must exercise the deployed empty global uni, not a fake public navigator');
  return { context, page, requests, errors };
}

// Read the actual DocResult, Vuex state and HTMLAudioElement created by the official player.
// This helper never changes component data, routing or player state.
function detailState() {
  let component = document.querySelector('.meeting')?.__vueParentComponent;
  while (component) {
    const doc = component.proxy;
    const player = doc?.$refs.audioPlayer;
    if (player) return { routeId: doc.transId, title: doc.title, text: doc.result.map(row => row.text).join(''),
      storeId: doc.$store.state.currentMetaResult.transId,
      storePlayback: doc.$store.state.currentMetaResult.playback,
      playerSource: player.innerAudioContext.src,
      mediaSource: player.innerAudioContext._audio.currentSrc,
      mediaReady: player.innerAudioContext._audio.readyState };
    component = component.parent;
  }
  return null;
}

async function verifyDetail(page, row) {
  await page.waitForURL(new RegExp('Meeting/Result\\?transId=' + row.transId));
  await page.locator('.meeting').waitFor();
  await page.waitForFunction(() => {
    let component = document.querySelector('.meeting')?.__vueParentComponent;
    while (component) {
      if (component.proxy?.$refs.audioPlayer?.innerAudioContext?._audio.readyState >= 1) return true;
      component = component.parent;
    }
    return false;
  });
  const state = await page.evaluate(detailState);
  console.log(JSON.stringify({ selected: row.transId, actual: state }));
  assert.equal(state.routeId, row.transId, 'Result onLoad must receive the newly selected record');
  assert.equal(state.title, row.tag.showName);
  assert.equal(state.text, transcript(row), 'The actual detail transcript must change with the selection');
  assert.equal(state.storeId, row.transId, 'The shared result store must belong to the newly selected record');
  assert.equal(state.storePlayback, audioUrl(row));
  assert.equal(state.playerSource, audioUrl(row), 'The official audio context must receive the new source');
  assert.equal(state.mediaSource, audioUrl(row), 'The actual HTMLAudioElement must load the new source');
  await page.getByText(row.tag.showName, { exact: true }).first().waitFor();
  await page.getByText('原文', { exact: true }).click();
  await page.getByText(transcript(row), { exact: true }).waitFor();
}

for (const back of ['official back button', 'browser history back']) {
  test('folder A -> back -> B -> back -> C loads distinct content/audio using ' + back, async () => {
    const { context, page, requests, errors } = await setup();
    try {
      await page.getByRole('button', { name: '打开文件夹 Navigation folder', exact: true }).click();
      const panel = page.locator('[data-tingwu-library-panel]');
      const scrollPositions = [];
      await panel.evaluate(element => element.addEventListener('click', event => {
        if (event.target.closest('.tw-library-record')) window.folderScrollAtClick = element.scrollTop;
      }, { capture: true }));
      await panel.evaluate(element => {
        window.scrollTimeline = [];
        const note = type => window.scrollTimeline.push({ type, top: element.scrollTop,
          max: element.scrollHeight - element.clientHeight, height: element.clientHeight, route: location.hash });
        element.addEventListener('scroll', () => note('scroll'));
        new ResizeObserver(() => note('resize')).observe(element);
        window.addEventListener('popstate', () => note('popstate'));
        window.addEventListener('hashchange', () => note('hashchange'));
      });
      for (const [index, row] of selectedRows.entries()) {
        const button = page.getByRole('button', { name: row.tag.showName + ' 查看记录 ›', exact: true });
        await button.scrollIntoViewIfNeeded();
        await button.click();
        const top = await page.evaluate(() => window.folderScrollAtClick);
        await verifyDetail(page, row);
        assert.deepEqual(requests.filter(request => request.action === 'getTransResult').map(request => request.transId),
          selectedRows.slice(0, index + 1).map(row => row.transId), 'Each selection must perform exactly its own detail read');
        if (index === selectedRows.length - 1) break;
        if (back === 'official back button') await page.locator('.meeting .back').first().click();
        else await page.goBack();
        await panel.waitFor({ state: 'visible' });
        assert.equal(await panel.locator('.tw-library-record').count(), rows.length, 'The selected folder must survive back');
        await page.waitForFunction(top => {
          const panel = document.querySelector('[data-tingwu-library-panel]');
          return panel.scrollTop === Math.min(top, panel.scrollHeight - panel.clientHeight);
        }, top);
        scrollPositions.push(await panel.evaluate((element, top) => ({ actual: element.scrollTop, saved: top,
          reachable: Math.min(top, element.scrollHeight - element.clientHeight) }), top));
        assert.equal(requests.filter(request => request.action === 'getTransList' && request.filter?.dirId === 12).length, 1,
          'Back must preserve loaded folder records without refetching the list');
      }
      assert.ok(scrollPositions.every(({ actual, reachable }) => actual === reachable),
        'Back must restore the folder scroll position: ' + JSON.stringify(scrollPositions));
      if (back === 'official back button') await page.locator('.meeting .back').first().click();
      else await page.goBack();
      await panel.waitFor({ state: 'visible' });
      await page.getByRole('button', { name: '全部记录', exact: true }).click();
      for (const tab of ['收藏', '分享']) {
        await page.locator('.myTabs .tabInner').filter({ hasText: tab }).click();
        await panel.waitFor({ state: 'hidden' });
        assert.equal(await page.locator('.myTabs .tabInner.myCurrent').innerText(), tab);
      }
      await page.locator('.myTabs .tabInner').filter({ hasText: '记录' }).click();
      await panel.waitFor({ state: 'visible' });
      assert.deepEqual(errors, []);
      console.log(JSON.stringify({ result: 'PASS', back, selected: selectedRows.map(row => row.transId), scrollPositions,
        folderReads: requests.filter(request => request.action === 'getTransList' && request.filter?.dirId === 12).length,
        originalMyTabs: 'PASS', pageErrors: errors }));
    } catch (error) {
      console.error(JSON.stringify({ url: page.url(), errors, detail: await page.evaluate(detailState),
        panel: await page.locator('[data-tingwu-library-panel]').evaluate(element => ({
          top: element.scrollTop, max: element.scrollHeight - element.clientHeight,
          height: element.clientHeight, saved: window.folderScrollAtClick,
          rect: element.getBoundingClientRect().toJSON(),
        })),
        scrollTimeline: await page.evaluate(() => window.scrollTimeline),
        detailReads: requests.filter(request => request.action === 'getTransResult'),
        text: (await page.locator('body').innerText()).slice(0, 1800) }, null, 2));
      throw error;
    } finally { await context.close(); }
  });
}
