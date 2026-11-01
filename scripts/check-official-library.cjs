// Optional network integration check of the deployed H5 home and its real request client.
// Account and record responses are local fixtures in a fresh browser, never a user's account.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 840 },
      userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36' });
    const user = { userId: 'local-test-user', isNew: false, nickName: '本地测试', avatar: '' };
    await context.addInitScript(user => {
      localStorage.setItem('__user_info__', JSON.stringify({ type: 'object', data: user }));
    }, user);
    const requests = [];
    await context.route('**/api/**', async route => {
      const request = route.request();
      const url = new URL(request.url());
      let data;
      try { data = request.postDataJSON() || {}; } catch (_) { data = {}; }
      requests.push({ path: url.pathname, action: data.action, filter: data.filter });
      let result = {};
      let total;
      if (/user\/info|account\/info/.test(url.pathname)) result = user;
      else if (data.action === 'getDirList') result = [{ dirId: 0, dirName: '未分类', children: [] },
        { dirId: 12, dirName: '项目资料', children: [{ dirId: 13, dirName: '周会', children: [] }] }];
      else if (data.action === 'getTransList') {
        result = data.filter && data.filter.dirId === 13 ? [{ transId: 'local-record-13', tag: { showName: '周会测试记录' }, status: 0 }] : [];
        total = result.length;
      } else if (/get.*(?:List|Tasks)/i.test(data.action || '')) result = [];
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, code: '0', data: result, total }) });
    });
    await context.addInitScript({ content: readFileSync(join(__dirname, '../app/src/main/assets/mobile-library.js'), 'utf8') });
    const page = await context.newPage();
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
    await page.getByRole('button', { name: '打开文件夹 项目资料', exact: true }).click();
    await page.getByRole('button', { name: '打开文件夹 周会', exact: true }).click();
    await page.getByText('周会测试记录', { exact: true }).waitFor();
    for (const width of [320, 390, 412]) {
      await page.setViewportSize({ width, height: 840 });
      await page.waitForTimeout(150);
      const box = await page.locator('[data-tingwu-library-panel]').boundingBox();
      assert.ok(box.x >= -1 && box.x + box.width <= width + 1, `Actual H5 folder panel clipped at ${width}px: ${JSON.stringify(box)}`);
    }
    await page.getByText('周会测试记录', { exact: true }).click();
    await page.waitForURL(/Meeting\/Result\?transId=local-record-13/);
    assert.ok(requests.some(request => request.action === 'getDirList'), 'The official request client did not read folders');
    assert.ok(requests.some(request => request.action === 'getTransList' && request.filter.dirId === 13), 'The official request client lost the selected directory');
    console.log(JSON.stringify({ result: 'PASS', source: 'deployed official H5 home/client', widths: [320, 390, 412],
      folderAndRecordData: 'local fixtures', pageErrors: errors }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
