(() => {
  if (location.origin !== 'https://tingwu.aliyun.com' || window.top !== window || window.__tingwuTaskProgressInstalled) return;
  window.__tingwuTaskProgressInstalled = true;
  const patched = new WeakSet();
  const removed = new WeakSet();
  let store = null;
  let unsubscribe = null;
  let scheduled = false;
  const raw = task => task && (task.__v_raw || task);
  const phoneFile = task => task.fileObject && task.fileObject.isH5 && !task.fileObject.isByWXWebview;

  const adaptTask = candidate => {
    const task = raw(candidate);
    if (!task) return;
    const proto = Object.getPrototypeOf(task);
    if (!proto || typeof proto.unWatch !== 'function' || typeof proto.append !== 'function' ||
        typeof proto.transcribingWatch !== 'function' || typeof proto.getBasicInfo !== 'function') return;
    if (!patched.has(proto)) {
      patched.add(proto);
      const unWatch = proto.unWatch;
      const append = proto.append;
      proto.unWatch = function (force = false) {
        const key = raw(this);
        // The deployed success path unsubscribes, then destroy() unsubscribes again.
        // Its second splice(-1,1) otherwise removes another task and can stop polling.
        if (!force && removed.has(key)) return;
        removed.add(key);
        return unWatch.apply(this, arguments);
      };
      proto.append = function () {
        removed.delete(raw(this));
        return append.apply(this, arguments);
      };
      const fake = proto.fakeProgressUpdate;
      if (typeof fake === 'function') proto.fakeProgressUpdate = function () {
        if (!phoneFile(this)) return fake.apply(this, arguments);
        // H5 already receives actual XMLHttpRequest upload progress. Do not add 1% per second.
      };
    }
    if (phoneFile(task) && task.fakeProgressUpdateTimer != null) {
      clearInterval(task.fakeProgressUpdateTimer);
      task.fakeProgressUpdateTimer = null;
    }
  };
  const storeFromDOM = () => {
    const root = document.getElementById('app');
    const app = root && root.__vue_app__;
    if (app && app.config && app.config.globalProperties) return app.config.globalProperties.$store;
    const element = document.querySelector('.doingList, .floating, .tabsTools');
    for (let component = element && element.__vueParentComponent; component; component = component.parent) {
      if (component.proxy && component.proxy.$store) return component.proxy.$store;
    }
    return null;
  };
  const adaptStore = () => {
    const tasks = store && store.state && store.state.taskTransList;
    if (Array.isArray(tasks)) tasks.forEach(item => adaptTask(item && item.task));
  };
  const update = () => {
    scheduled = false;
    if (!document.documentElement) return;
    const current = storeFromDOM();
    if (current && current !== store && typeof current.subscribe === 'function') {
      if (unsubscribe) unsubscribe();
      store = current;
      unsubscribe = store.subscribe(() => { adaptStore(); schedule(); });
    }
    adaptStore();
    if (!document.getElementById('tingwu-task-progress-style')) {
      const style = document.createElement('style');
      style.id = 'tingwu-task-progress-style';
      style.textContent = '.itemBg[data-tingwu-task-cloud]>.item>.progress{display:none!important}' +
        '[data-tingwu-task-hint]{margin-top:8px;font-size:12px;line-height:1.6;color:#79768e;overflow-wrap:anywhere}';
      (document.head || document.documentElement).appendChild(style);
    }
    document.querySelectorAll('.doingList .itemBg, .itemBg').forEach(row => {
      let item = null;
      for (let component = row.__vueParentComponent; component; component = component.parent) {
        const props = component.proxy && component.proxy.$props;
        if (props && props.item && props.item.basicInfo && props.item.task) { item = props.item; break; }
      }
      const cloud = item && item.basicInfo.taskStatus === 'transcribing';
      let hint = row.querySelector('[data-tingwu-task-hint]');
      if (cloud) {
        row.setAttribute('data-tingwu-task-cloud', '');
        if (!hint) {
          hint = document.createElement('div');
          hint.setAttribute('data-tingwu-task-hint', '');
          hint.textContent = '云端处理中。预估时间仅供参考，并非实际转写百分比。';
          const content = row.querySelector('.item');
          if (content) content.appendChild(hint);
        }
      } else {
        row.removeAttribute('data-tingwu-task-cloud');
        if (hint) hint.remove();
      }
    });
  };
  function schedule() { if (!scheduled) { scheduled = true; setTimeout(update, 0); } }
  new MutationObserver(schedule).observe(document, { childList: true, subtree: true });
  window.addEventListener('pagehide', () => { if (unsubscribe) unsubscribe(); unsubscribe = null; store = null; });
  window.addEventListener('pageshow', schedule);
  schedule();
})();
