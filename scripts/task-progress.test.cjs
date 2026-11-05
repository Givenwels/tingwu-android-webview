const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const { test, before, after } = require('node:test');
const { chromium } = require('playwright-core');
const sourcePath = join(__dirname, '../app/src/main/assets/task-progress.js');
const source = () => existsSync(sourcePath) ? readFileSync(sourcePath, 'utf8') : 'void 0;';
let browser;
before(async () => { browser = await chromium.launch({ channel: 'chrome', headless: true }); });
after(async () => { await browser?.close(); });

async function setup() {
  const context = await browser.newContext({ viewport: { width: 390, height: 800 } });
  await context.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<div id="app"></div>' }));
  const page = await context.newPage();
  page.setDefaultTimeout(2000);
  await page.goto('https://tingwu.aliyun.com/');
  await page.evaluate(() => {
    const watching = [];
    const subscribers = [];
    window.store = { state: { taskTransList: [] }, subscribe(fn) { subscribers.push(fn); return () => {}; },
      commit(type, entry) {
        if (type === 'appendTaskTransList') this.state.taskTransList.push(entry);
        if (type === 'removeTaskTransList') this.state.taskTransList = this.state.taskTransList.filter(item => item.task !== entry.task);
        subscribers.forEach(fn => fn({ type }, this.state));
      } };
    // Preserve the deployed task queue's behavior: finishing calls unWatch(), then destroy().
    window.Task = class {
      constructor(id, status = 'transcribing') { this.transId = id; this.uuid = id; this.taskStatus = status; this.taskProgress = 0; this.fileObject = { isH5: true, tag: { fileType: 'local' } }; }
      getBasicInfo() { return { transId: this.transId, uuid: this.uuid, taskStatus: this.taskStatus, taskProgress: this.taskProgress }; }
      append() { if (!watching.includes(this)) watching.push(this); window.store.commit('appendTaskTransList', { task: this, basicInfo: this.getBasicInfo() }); }
      unWatch(force = false) { watching.splice(watching.findIndex(task => task.transId === this.transId), 1); if (force || !watching.length) window.polling = false; }
      destroy() { this.unWatch(); window.store.commit('removeTaskTransList', { task: this }); }
      transcribingWatch() {}
      fakeProgressUpdate() { this.fakeProgressUpdateTimer = setInterval(() => { this.taskProgress++; }, 20); }
      update() { window.store.commit('updateTaskTransList', { task: this }); }
    };
    window.watching = watching;
    window.polling = true;
    document.querySelector('#app').__vue_app__ = { config: { globalProperties: { $store: window.store } } };
    window.first = new Task('first'); window.second = new Task('second'); first.append(); second.append();
    window.renderTask = task => {
      const row = document.createElement('div'); row.className = 'itemBg';
      row.innerHTML = '<div class="item"><div class="progress"><div class="innerProgress" style="width:42%"></div></div><div class="bottom"><span class="text">转写中，预估时间17:49</span><button>取消</button></div></div>';
      row.__vueParentComponent = { proxy: { $props: { item: { task, basicInfo: task.getBasicInfo() } }, $store: window.store } };
      document.querySelector('#app').append(row); return row;
    };
    renderTask(second);
  });
  await page.addScriptTag({ content: source() });
  await page.waitForTimeout(40);
  return { context, page };
}

test('completing one task cannot remove the next task from the status watcher', async () => {
  const { context, page } = await setup();
  try {
    await page.evaluate(() => { first.unWatch(); first.destroy(); });
    assert.deepEqual(await page.evaluate(() => watching.map(task => task.transId)), ['second']);
    assert.equal(await page.evaluate(() => window.polling), true);
    await page.evaluate(() => { second.taskStatus = 'success'; second.unWatch(); second.destroy(); });
    assert.equal(await page.evaluate(() => window.polling), false);
  } finally { await context.close(); }
});

test('a re-appended task can leave its next subscription normally and force cleanup still runs', async () => {
  const { context, page } = await setup();
  try {
    await page.evaluate(() => { first.unWatch(); first.append(); first.unWatch(); first.unWatch(true); });
    assert.equal(await page.evaluate(() => window.polling), false);
  } finally { await context.close(); }
});

test('new phone uploads use real progress callbacks instead of a timer that increases the percentage', async () => {
  const { context, page } = await setup();
  try {
    await page.evaluate(() => { window.upload = new Task('upload', 'feUploading'); upload.append(); upload.fakeProgressUpdate(); });
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => upload.taskProgress), 0);
    await page.evaluate(() => { upload.taskProgress = 65; upload.update(); });
    assert.equal(await page.evaluate(() => upload.getBasicInfo().taskProgress), 65);
  } finally { await context.close(); }
});

test('cloud processing never displays the estimated timer as a measured percentage', async () => {
  const { context, page } = await setup();
  try {
    await page.locator('[data-tingwu-task-hint]').waitFor();
    assert.equal(await page.locator('.progress').isVisible(), false);
    assert.match(await page.locator('[data-tingwu-task-hint]').textContent(), /云端.*预估/);
    assert.equal(await page.getByRole('button', { name: '取消', exact: true }).isVisible(), true);
  } finally { await context.close(); }
});

test('the compatibility hook can be injected repeatedly without double wrapping subscriptions', async () => {
  const { context, page } = await setup();
  try {
    await page.addScriptTag({ content: source() });
    await page.evaluate(() => { first.unWatch(); first.destroy(); });
    assert.deepEqual(await page.evaluate(() => watching.map(task => task.transId)), ['second']);
  } finally { await context.close(); }
});
