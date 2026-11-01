// Optional network integration check of the deployed H5 home and its real request client.
// Account and record responses are local fixtures in a fresh browser, never a user's account.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { EventEmitter, once } = require('node:events');
const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const touchScroll = process.env.TINGWU_TOUCH_SCROLL === '1';
    const context = await browser.newContext({ viewport: { width: 390, height: 840 }, isMobile: touchScroll, hasTouch: touchScroll,
      userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36' });
    const user = { userId: 'local-test-user', isNew: false, nickName: '本地测试', avatar: '' };
    await context.addInitScript(user => {
      localStorage.setItem('__user_info__', JSON.stringify({ type: 'object', data: user }));
    }, user);
    const requests = [];
    const apiEvents = new EventEmitter();
    const folderRows = Array.from({ length: 27 }, (_, index) => ({
      transId: 'local-record-13-' + index, tag: { showName: '周会测试记录 ' + index }, status: 0,
    }));
    let releaseNext;
    const nextPageGate = new Promise(resolve => { releaseNext = resolve; });
    const folderReads = () => requests.filter(request => request.action === 'getTransList' && request.filter && request.filter.dirId === 13);
    await context.route('**/api/**', async route => {
      const request = route.request();
      const url = new URL(request.url());
      let data;
      try { data = request.postDataJSON() || {}; } catch (_) { data = {}; }
      requests.push({ path: url.pathname, action: data.action, filter: data.filter, pageNo: data.pageNo, pageSize: data.pageSize });
      let result = {};
      let total;
      let totalNum;
      if (/user\/info|account\/info/.test(url.pathname)) result = user;
      else if (data.action === 'getDirList') result = [{ dirId: 0, dirName: '未分类', children: [] },
        { dirId: 12, dirName: '项目资料', children: [{ dirId: 13, dirName: '周会', children: [] }] }];
      else if (data.action === 'getTransList') {
        if (data.filter && data.filter.dirId === 13) {
          const size = Math.min(7, data.pageSize);
          const start = (data.pageNo - 1) * size;
          result = folderRows.slice(start, start + size);
          total = null;
          totalNum = String(folderRows.length);
          if (data.pageNo === 2) { apiEvents.emit('next-page'); await nextPageGate; }
        } else {
          result = data.filter && data.filter.dirId !== undefined ? [] : [{ transId: 'local-original', tag: { showName: '原有测试卡片' }, status: 0 }];
          total = result.length;
        }
      } else if (/get.*(?:List|Tasks)/i.test(data.action || '')) result = [];
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, code: '0', data: result, total, totalNum }) });
    });
    await context.addInitScript({ content: readFileSync(join(__dirname, '../app/src/main/assets/mobile-library.js'), 'utf8') });
    const page = await context.newPage();
    const touchSession = touchScroll ? await context.newCDPSession(page) : null;
    const scrollPanel = async () => {
      const box = await page.locator('[data-tingwu-library-panel]').boundingBox();
      const x = box.x + box.width / 2;
      const y = Math.min(800, box.y + box.height - 40);
      if (touchSession) {
        await touchSession.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        const distance = Math.min(500, y - Math.max(40, box.y + 20));
        for (let step = 1; step <= 30; step++) {
          await touchSession.send('Input.dispatchTouchEvent', {
            type: 'touchMove', touchPoints: [{ x, y: y - distance * step / 30 }],
          });
          await page.waitForTimeout(16);
        }
        await touchSession.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      }
      else {
        await page.mouse.move(x, y);
        await page.mouse.wheel(0, 2000);
      }
    };
    if (touchScroll) await page.addInitScript(() => {
      window.touchDiagnostics = [];
      ['touchstart', 'touchmove', 'touchend', 'scroll'].forEach(type => document.addEventListener(type, event => {
        const target = event.target;
        queueMicrotask(() => {
          if (window.touchDiagnostics.length < 20) window.touchDiagnostics.push({
            type, prevented: event.defaultPrevented, target: target.tagName + '.' + target.className,
          });
        });
      }, { capture: true, passive: true }));
    });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('https://tingwu.aliyun.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    try {
      await page.getByRole('button', { name: '打开文件夹 项目资料', exact: true }).waitFor({ timeout: 20000 });
    } catch (error) {
      console.error(JSON.stringify({ url: page.url(), errors, requests, dom: await page.evaluate(() => ({
        client: typeof window.tingwuRequest, installed: !!window.__tingwuMobileLibraryInstalled,
        my: document.querySelectorAll('.tabsTools .myTab').length,
        text: document.body.innerText.slice(0, 1400),
      })) }, null, 2));
      throw error;
    }
    assert.equal(await page.locator('.tabsTools .tab.current .myTab').count(), 1, 'The actual H5 home did not open My');
    const panel = page.locator('[data-tingwu-library-panel]');
    const nativeStyle = await panel.evaluate(element => {
      const list = element.closest('uni-swiper-item').querySelector('.staticListMain');
      const style = list.getAttribute('style');
      list.style.display = 'none';
      return style;
    });
    assert.equal(await page.getByRole('button', { name: '打开文件夹 项目资料', exact: true }).isVisible(), true,
      'The folder panel must remain usable when the official mobile list is hidden');
    await panel.evaluate((element, style) => {
      const list = element.closest('uni-swiper-item').querySelector('.staticListMain');
      if (style === null) list.removeAttribute('style');
      else list.setAttribute('style', style);
    }, nativeStyle);
    await page.getByRole('button', { name: '打开文件夹 项目资料', exact: true }).click();
    await page.getByRole('button', { name: '打开文件夹 周会', exact: true }).click();
    await page.getByText('周会测试记录 6', { exact: true }).waitFor();
    assert.equal(await page.locator('.tw-library-record').count(), 7);
    await page.waitForTimeout(150);
    assert.equal(folderReads().length, 1, 'Opening a folder must not prefetch subsequent pages');
    for (const width of [320, 390, 412]) {
      await page.setViewportSize({ width, height: 840 });
      await page.waitForTimeout(150);
      const box = await panel.boundingBox();
      assert.ok(box.x >= -1 && box.x + box.width <= width + 1, `Actual H5 folder panel clipped at ${width}px: ${JSON.stringify(box)}`);
    }
    await page.setViewportSize({ width: 390, height: 840 });
    // Expose the swiper using the real outer scroll view, then wheel inside the folder panel.
    await page.locator('.main>.uni-scroll-view>.uni-scroll-view').evaluate(element => { element.scrollTop = element.scrollHeight; });
    const nextRequested = once(apiEvents, 'next-page', { signal: AbortSignal.timeout(5000) });
    await scrollPanel();
    try { await nextRequested; }
    catch (error) {
      console.error(JSON.stringify(await page.evaluate(() => {
        const panel = document.querySelector('[data-tingwu-library-panel]');
        const box = panel.getBoundingClientRect();
        const hit = document.elementFromPoint(box.x + box.width / 2, Math.min(800, box.y + box.height - 40));
        return { box: box.toJSON(), top: panel.scrollTop, height: panel.clientHeight, totalHeight: panel.scrollHeight,
          touchAction: getComputedStyle(panel).touchAction, hit: hit && hit.outerHTML.slice(0, 180), events: window.touchDiagnostics };
      }), null, 2));
      throw error;
    }
    await page.waitForFunction(() => document.querySelector('.tw-library-more')?.disabled);
    assert.equal(folderReads().length, 2, 'A downward scroll must request exactly the next page');
    assert.equal(await page.getByRole('button', { name: '加载更多', exact: true }).evaluate(button => {
      const rect = button.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= innerHeight && button.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
    }), true, 'Load more must be reachable in the deployed H5 nested scroll layout');
    releaseNext();
    await page.getByText('周会测试记录 13', { exact: true }).waitFor();
    await page.waitForTimeout(150);
    assert.equal(folderReads().length, 2, 'Appending a page must not trigger another fetch');
    for (const last of [20, 26]) {
      const before = folderReads().length;
      // A finger swipe travels less than a large mouse wheel gesture. Longer lists can
      // require several real swipes before the user actually reaches the next-page boundary.
      for (let swipe = 0; swipe < (touchScroll ? 6 : 1) && folderReads().length === before; swipe++) {
        await scrollPanel();
        await page.waitForTimeout(50);
      }
      await page.getByText('周会测试记录 ' + last, { exact: true }).waitFor();
    }
    assert.equal(await page.locator('.tw-library-record').count(), 27);
    assert.equal(await page.getByRole('button', { name: '加载更多', exact: true }).count(), 0);
    assert.deepEqual(folderReads().map(request => request.pageNo), [1, 2, 3, 4]);
    assert.ok(folderReads().every(request => request.pageSize === 20));
    await page.getByRole('button', { name: '全部记录', exact: true }).click();
    await panel.locator('..').locator('.staticListMain').first().getByText('原有测试卡片', { exact: true }).waitFor();
    await page.locator('.myTabs .tabInner').filter({ hasText: '收藏' }).click();
    await panel.waitFor({ state: 'hidden' });
    await page.locator('.myTabs .tabInner').filter({ hasText: '记录' }).click();
    await page.getByRole('button', { name: '打开文件夹 项目资料', exact: true }).click();
    await page.getByRole('button', { name: '打开文件夹 周会', exact: true }).click();
    await page.getByText('周会测试记录 0', { exact: true }).click();
    await page.waitForURL(/Meeting\/Result\?transId=local-record-13-0/);
    assert.ok(requests.some(request => request.action === 'getDirList'), 'The official request client did not read folders');
    assert.ok(requests.some(request => request.action === 'getTransList' && request.filter.dirId === 13), 'The official request client lost the selected directory');
    console.log(JSON.stringify({ result: 'PASS', source: 'deployed official H5 home/client', widths: [320, 390, 412],
      folderAndRecordData: 'local fixtures', pagination: { serverPageSize: 7, requestedPageSize: 20,
        counts: { total: null, totalNum: '27' }, pages: [1, 2, 3, 4], records: 27,
        hiddenNativeList: 'PASS', loadMoreReachable: 'PASS', scrollGesture: touchScroll ? 'touch' : 'wheel', originalCardsAndTabs: 'PASS' }, pageErrors: errors }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
