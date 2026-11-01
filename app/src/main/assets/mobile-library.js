(() => {
  if (location.origin !== 'https://tingwu.aliyun.com' || window.top !== window) return;
  if (window.__tingwuMobileLibraryInstalled) return;
  window.__tingwuMobileLibraryInstalled = true;
  let scheduled = false;
  let preferredMine = false;
  let content = null;
  let panel = null;
  let tools = [];
  let active = false;
  let directoryStarted = false;
  let directoryLoading = false;
  let directoryError = '';
  let directories = [];
  let selected = null;
  let records = [];
  let recordLoading = false;
  let recordError = '';
  let pageNo = 0;
  let hasMore = false;
  let keyword = '';
  let directoryTicket = 0;
  let recordTicket = 0;
  const directoryMap = new Map();
  const hiddenAttribute = 'data-tingwu-library-hidden';
  const toolAttribute = 'data-tingwu-folder-tools-hidden';

  const css = `
    [data-tingwu-library-hidden],[data-tingwu-folder-tools-hidden]{display:none!important}
    [data-tingwu-library-panel]{box-sizing:border-box;width:100%;min-width:0;margin:0 0 16px;padding:16px;border-radius:16px;background:#fff;color:#27264d;font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
    [data-tingwu-library-panel] *{box-sizing:border-box;min-width:0}
    [data-tingwu-library-panel] button{font:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent}
    .tw-library-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}
    .tw-library-heading strong{font-size:17px}
    .tw-library-link{min-height:40px;padding:6px 10px;border:0;border-radius:10px;background:#f1efff;color:#605ce5}
    .tw-library-breadcrumb{display:flex;align-items:center;gap:6px;overflow-x:auto;margin-bottom:12px;padding-bottom:4px}
    .tw-library-breadcrumb button{flex:none;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .tw-library-folders{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:12px}
    .tw-library-folder{display:flex;align-items:center;gap:10px;min-height:64px;padding:12px 10px;text-align:left;border:1px solid #e5e3f4;border-radius:12px;background:#faf9ff;color:#27264d}
    .tw-library-folder svg{flex:none;width:24px;height:24px;color:#8074e8}
    .tw-library-folder span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .tw-library-status{padding:12px 0;color:#79768e;overflow-wrap:anywhere}
    .tw-library-search{display:flex;gap:8px;margin:12px 0}
    .tw-library-search input{flex:1;width:0;min-height:44px;padding:8px 10px;border:1px solid #e5e3f4;border-radius:10px;font:inherit;background:#fff;color:#27264d}
    .tw-library-record{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;min-height:72px;margin-top:10px;padding:14px 12px;text-align:left;border:1px solid #eeeaf8;border-radius:12px;background:#fff;color:#27264d}
    .tw-library-record-title{display:block;font-size:16px;font-weight:600;overflow-wrap:anywhere}
    .tw-library-record-meta{display:block;margin-top:4px;font-size:12px;color:#92909f}
    .tw-library-more{width:100%;margin-top:12px;min-height:44px}
  `;
  const node = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const button = (text, className, action, label) => {
    const element = node('button', className, text);
    element.type = 'button';
    if (label) element.setAttribute('aria-label', label);
    element.addEventListener('click', action);
    return element;
  };
  const visible = element => element && element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden';
  const isHomeRoute = () => {
    const route = location.hash.split('?')[0].replace(/^#/, '');
    return !route || route === '/' || /\/pages\/Start\/Start\/?$/.test(route);
  };
  const home = () => {
    if (!isHomeRoute()) return null;
    const label = Array.from(document.querySelectorAll('.tabsTools .myTab')).find(visible);
    const mine = label && label.closest('.tab');
    const inner = Array.from(document.querySelectorAll('.myTabsTools')).find(element => element.getClientRects().length);
    return mine ? { mine, inner } : null;
  };
  const syncOriginal = () => {
    if (content) Array.from(content.children).forEach(child => {
      if (child === panel) return;
      if (active && selected) child.setAttribute(hiddenAttribute, '');
      else child.removeAttribute(hiddenAttribute);
    });
    tools.forEach(tool => {
      if (active && selected) tool.setAttribute(toolAttribute, '');
      else tool.removeAttribute(toolAttribute);
    });
  };
  const request = async (url, data) => {
    if (typeof window.tingwuRequest !== 'function') throw new Error('client-unavailable');
    let timer;
    try {
      const response = await Promise.race([
        window.tingwuRequest({ url, method: 'POST', skipLogin: true, data: Object.assign({ version: '1.0' }, data) }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), 20000); }),
      ]);
      const result = response && response.data && response.data.code !== undefined ? response.data : response;
      if (!result || !['0', '200'].includes(String(result.code))) {
        const error = new Error('request-failed');
        error.code = result && result.code;
        throw error;
      }
      if (!Array.isArray(result.data)) throw new Error('invalid-list');
      return result;
    } finally { clearTimeout(timer); }
  };
  const normalizeDirectories = (items, ancestors) => items.reduce((list, item) => {
    if (!item || !/^\d+$/.test(String(item.dirId)) || directoryMap.has(String(item.dirId)) || ancestors.length > 20) return list;
    const directory = { id: item.dirId, name: String(item.dirName || '未命名文件夹'), ancestors, children: [] };
    directoryMap.set(String(item.dirId), directory);
    directory.children = normalizeDirectories(Array.isArray(item.children) ? item.children : [], ancestors.concat(directory));
    list.push(directory);
    return list;
  }, []);
  const select = directory => {
    selected = directory;
    keyword = '';
    records = [];
    recordError = '';
    recordLoading = false;
    hasMore = false;
    pageNo = 0;
    recordTicket++;
    render();
    if (selected) loadRecords(false);
  };
  const loadDirectories = async () => {
    const ticket = ++directoryTicket;
    directoryStarted = true;
    directoryLoading = true;
    directoryError = '';
    render();
    try {
      const result = await request('/api/directory/request?getDirList', { action: 'getDirList', returnDetails: true });
      if (ticket !== directoryTicket) return;
      directoryMap.clear();
      directories = normalizeDirectories(result.data, []);
      if (selected) {
        const updated = directoryMap.get(String(selected.id));
        if (updated) selected = updated;
        else select(null);
      }
    } catch (_) {
      if (ticket === directoryTicket) directoryError = '文件夹加载失败，请重试';
    } finally {
      if (ticket === directoryTicket) { directoryLoading = false; render(); }
    }
  };
  async function loadRecords(append) {
    if (!selected || recordLoading) return;
    const ticket = ++recordTicket;
    const directory = selected;
    const nextPage = append ? pageNo + 1 : 1;
    recordLoading = true;
    recordError = '';
    if (!append) records = [];
    render();
    try {
      const result = await request('/api/trans/request?getTransList', {
        action: 'getTransList', preview: 1, pageNo: nextPage, pageSize: 20, orderType: 0, orderDesc: true,
        filter: { dirId: directory.id, status: [0, 1, 2, 3], fileTypes: [], showName: keyword, searchFiled: ['title', 'docSrc'] },
      });
      if (ticket !== recordTicket || !selected || String(selected.id) !== String(directory.id)) return;
      const rows = result.data.map(item => Object.assign({}, item, item.cardInfo || {}));
      records = append ? records.concat(rows) : rows;
      pageNo = nextPage;
      hasMore = Number.isFinite(Number(result.total)) ? records.length < Number(result.total) : rows.length === 20;
    } catch (_) {
      if (ticket === recordTicket) recordError = '记录加载失败，请重试';
    } finally {
      if (ticket === recordTicket) { recordLoading = false; render(); }
    }
  }
  const openRecord = record => {
    const id = record.transId || record.demoId;
    if (id === undefined || id === null || !String(id).trim()) return;
    const url = '/pages/Meeting/Result?transId=' + encodeURIComponent(String(id));
    if (window.uni && typeof window.uni.navigateTo === 'function') window.uni.navigateTo({ url });
    else location.hash = '#' + url;
  };
  function render() {
    if (!panel) return;
    while (panel.firstChild) panel.removeChild(panel.firstChild);
    const heading = node('div', 'tw-library-heading');
    heading.append(node('strong', '', '我的文件夹'), button('刷新', 'tw-library-link', () => {
      loadDirectories();
      if (selected && !recordLoading) loadRecords(false);
    }, '刷新文件夹'));
    panel.append(heading);
    const breadcrumb = node('div', 'tw-library-breadcrumb');
    breadcrumb.append(button('全部记录', 'tw-library-link', () => select(null)));
    if (selected) selected.ancestors.concat(selected).forEach(directory => {
      breadcrumb.append(node('span', '', '›'), button(directory.name, 'tw-library-link', () => select(directory)));
    });
    panel.append(breadcrumb);
    if (directoryLoading) panel.append(node('div', 'tw-library-status', '正在加载文件夹…'));
    if (directoryError) panel.append(node('div', 'tw-library-status', directoryError));
    const folders = selected ? selected.children : directories;
    const grid = node('div', 'tw-library-folders');
    folders.forEach(directory => {
      const entry = button('', 'tw-library-folder', () => select(directory), '打开文件夹 ' + directory.name);
      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      icon.setAttribute('viewBox', '0 0 24 24');
      icon.setAttribute('aria-hidden', 'true');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M3 5h7l2 2h9v13H3z');
      path.setAttribute('fill', 'currentColor');
      icon.append(path);
      entry.append(icon, node('span', '', directory.name));
      grid.append(entry);
    });
    panel.append(grid);
    if (!selected && !directoryLoading && !directoryError && !directories.length) panel.append(node('div', 'tw-library-status', '账号中暂无文件夹'));
    if (selected) {
      const form = node('form', 'tw-library-search');
      const input = node('input');
      input.type = 'search';
      input.placeholder = '搜索此文件夹';
      input.setAttribute('aria-label', '搜索此文件夹');
      input.value = keyword;
      const submit = node('button', 'tw-library-link', '搜索');
      submit.type = 'submit';
      form.append(input, submit);
      form.addEventListener('submit', event => {
        event.preventDefault();
        keyword = input.value.trim();
        recordLoading = false;
        loadRecords(false);
      });
      panel.append(form);
      if (recordError) {
        panel.append(node('div', 'tw-library-status', recordError), button('重试记录', 'tw-library-link', () => loadRecords(false)));
      }
      if (recordLoading) panel.append(node('div', 'tw-library-status', '正在加载记录…'));
      records.forEach(record => {
        const title = record.showName || (record.tag && record.tag.showName) || record.title || record.meetingName || '未命名记录';
        const row = button('', 'tw-library-record', () => openRecord(record));
        const labels = node('span');
        labels.append(node('span', 'tw-library-record-title', String(title)), node('span', 'tw-library-record-meta', '查看记录'));
        row.append(labels, node('span', '', '›'));
        panel.append(row);
      });
      if (!recordLoading && !recordError && !records.length) panel.append(node('div', 'tw-library-status', keyword ? '没有找到匹配的记录' : '此文件夹暂无记录'));
      if (hasMore && !recordLoading) panel.append(button('加载更多', 'tw-library-link tw-library-more', () => loadRecords(true)));
    }
    syncOriginal();
  }
  const update = () => {
    scheduled = false;
    const styleParent = document.head || document.documentElement;
    if (styleParent && !style.parentNode) styleParent.appendChild(style);
    const current = home();
    if (!current) {
      active = false;
      if (panel) panel.hidden = true;
      syncOriginal();
      // Clear in-memory account data when the official home switches to its login view.
      if (isHomeRoute() && Array.from(document.querySelectorAll('.loginBlock')).some(visible)) {
        directoryTicket++;
        recordTicket++;
        if (panel) panel.remove();
        panel = null;
        content = null;
        tools = [];
        directories = [];
        directoryMap.clear();
        selected = null;
        records = [];
        preferredMine = false;
        directoryStarted = false;
        directoryLoading = false;
        recordLoading = false;
        directoryError = '';
        recordError = '';
        keyword = '';
        pageNo = 0;
        hasMore = false;
      }
      return;
    }
    if (!preferredMine) {
      if (!current.mine.classList.contains('current')) { current.mine.click(); return; }
      if (!current.inner) return;
      const recordTab = Array.from(current.inner.querySelectorAll('.tabInner')).find(item => item.textContent.trim() === '记录');
      if (recordTab && !recordTab.classList.contains('myCurrent')) { recordTab.click(); return; }
      preferredMine = true;
    }
    const recordTab = current.inner && current.inner.querySelector('.tabInner.myCurrent');
    active = current.mine.classList.contains('current') && !!recordTab && recordTab.textContent.trim() === '记录';
    if (active) {
      const container = current.inner.parentElement;
      const list = Array.from(container.querySelectorAll('.staticListMain'))[0];
      const nextContent = list && (list.querySelector('.uni-scroll-view-content') || list.querySelector('.scroller'));
      if (nextContent && (nextContent !== content || !panel || panel.parentElement !== nextContent)) {
        if (panel) panel.remove();
        content = nextContent;
        panel = node('section');
        panel.setAttribute('data-tingwu-library-panel', '');
        content.prepend(panel);
        tools = Array.from(document.querySelectorAll('.myTabsButton, .tabsTools .mySearch'));
        render();
      }
      if (panel && !directoryStarted) loadDirectories();
    }
    if (panel) panel.hidden = !active;
    syncOriginal();
  };
  function schedule() { if (!scheduled) { scheduled = true; setTimeout(update, 0); } }
  const style = node('style');
  style.textContent = css;
  new MutationObserver(schedule).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  window.addEventListener('hashchange', schedule);
  window.addEventListener('popstate', schedule);
  schedule();
})();
