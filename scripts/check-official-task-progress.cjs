// Deployed H5 task class/store with local API responses; never uploads a real file or creates a cloud task.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 840 },
      userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36' });
    const user = { userId: 'local-task-progress-user', isNew: false, nickName: '本地任务测试', avatar: '' };
    await context.addInitScript(user => localStorage.setItem('__user_info__', JSON.stringify({ type: 'object', data: user })), user);
    await context.addInitScript({ content: readFileSync(join(__dirname, '../app/src/main/assets/task-progress.js'), 'utf8') });
    const requests = [];
    let finishSecond = false;
    await context.route('**/api/**', async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      let data;
      try { data = request.postDataJSON() || {}; } catch (_) { data = {}; }
      let result = {};
      if (/user\/info|account\/info/.test(path)) result = user;
      else if (data.action === 'getTransStatus') {
        requests.push(data.transIds);
        result = data.transIds.map(transId => ({ transId, status: transId === 'local-first' || finishSecond ? 0 : 1,
          transStartTime: Date.now() - 120000, forecastTransDoneTime: Date.now() + 120000,
          tag: { fileType: 'local', showName: transId } }));
      } else if (/get.*(?:List|Tasks)/i.test(data.action || '')) result = [];
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, code: '0', data: result }) });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.stack));
    await page.goto('https://tingwu.aliyun.com/', { waitUntil: 'networkidle', timeout: 45000 });
    await page.evaluate(async () => {
      const { T: Task, t: queue } = await import('https://g.alicdn.com/bshop/uni-tingwu/2.9.82/assets/TaskTransList.209b1273.js');
      window.localQueue = queue;
      window.LocalTask = Task;
      window.localTasks = ['local-first', 'local-second'].map(transId => {
        const task = new Task();
        task.trans({ transId, status: 1, fileSize: 25000000, tag: { fileType: 'local', showName: transId } });
        queue.append(task); return task;
      });
    });
    await page.waitForFunction(() => {
      const root = document.querySelector('#app');
      const store = root.__vue_app__.config.globalProperties.$store;
      return store.state.taskTransList.length === 1 && store.state.taskTransList[0].basicInfo.transId === 'local-second';
    });
    await page.waitForTimeout(2200);
    assert.ok(requests.some(ids => ids.length === 1 && ids[0] === 'local-second'),
      'Finishing the first task stopped the deployed watcher for the second: ' + JSON.stringify(requests));
    await page.evaluate(() => {
      for (let node = document.querySelector('.floating').__vueParentComponent; node; node = node.parent) {
        if (typeof node.proxy.show === 'function') { node.proxy.show(); return; }
      }
      throw Error('Cannot open the actual official task panel');
    });
    await page.locator('[data-tingwu-task-hint]').waitFor();
    assert.equal(await page.locator('[data-tingwu-task-cloud] .progress').isVisible(), false);
    finishSecond = true;
    await page.waitForFunction(() => document.querySelector('#app').__vue_app__.config.globalProperties.$store.state.taskTransList.length === 0);
    await page.evaluate(() => {
      const upload = new LocalTask(); upload.transId = 'local-upload'; upload.taskStatus = 'feUploading';
      upload.fileObject = { isH5: true, isByWXWebview: false, tag: { fileType: 'local' } };
      localQueue.append(upload); upload.fakeProgressUpdate(); window.localUpload = upload;
    });
    await page.waitForTimeout(1200);
    assert.equal(await page.evaluate(() => localUpload.taskProgress), 0, 'The real task class still adds an artificial 1% each second');
    await page.evaluate(() => localUpload.destroy());
    assert.deepEqual(errors, []);
    console.log('Real H5 task queue keeps the second task polling, completes both, and uses actual H5 upload progress.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
