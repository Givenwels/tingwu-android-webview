(() => {
  if (location.origin !== 'https://tingwu.aliyun.com' || window.top !== window) return;
  if (window.__tingwuMobileRecorderInstalled) return;
  window.__tingwuMobileRecorderInstalled = true;
  let port = null;
  let lastReady = null;
  let captureActive = false;
  let enteredRecord = false;
  let completed = false;
  let menuOpened = false;
  let recordClicked = false;
  let scheduled = false;
  const audioTracks = new Set();

  const send = message => {
    const data = JSON.stringify(message);
    if (window.TingwuRecorder && window.TingwuRecorder.postMessage) window.TingwuRecorder.postMessage(data);
    else if (port) port.postMessage(data);
  };
  const ready = stage => {
    if (lastReady && lastReady.stage === stage) return;
    lastReady = { type: 'ready', stage };
    send(lastReady);
  };
  const visible = element => !!element && !!element.getClientRects().length &&
    getComputedStyle(element).display !== 'none' && getComputedStyle(element).visibility !== 'hidden';
  const findVisible = selector => Array.from(document.querySelectorAll(selector)).find(visible);
  const reportCapture = () => {
    for (const track of audioTracks) if (track.readyState === 'ended') audioTracks.delete(track);
    const active = Array.from(audioTracks).some(track => track.readyState === 'live');
    if (active !== captureActive) {
      captureActive = active;
      send({ type: 'capture', active });
      schedule();
    }
  };
  const mediaDevices = navigator.mediaDevices;
  if (mediaDevices && typeof mediaDevices.getUserMedia === 'function') {
    const getUserMedia = mediaDevices.getUserMedia.bind(mediaDevices);
    mediaDevices.getUserMedia = function (...args) {
      return getUserMedia(...args).then(stream => {
        stream.getAudioTracks().forEach(track => {
          audioTracks.add(track);
          track.addEventListener('ended', reportCapture);
          const stop = track.stop;
          track.stop = function (...stopArgs) {
            const result = stop.apply(this, stopArgs);
            reportCapture();
            return result;
          };
        });
        reportCapture();
        return stream;
      });
    };
  }

  const css = `
    html,body,#root { min-width:0!important; width:100%!important; margin:0!important; }
    html,body { min-height:100%; background:#f7f7ff!important; overflow-x:hidden!important; }
    html:not([data-tingwu-recorder-stage="recording"]) #root { opacity:0!important; pointer-events:none!important; }
    [data-tingwu-recorder-hidden] { display:none!important; }
    .tingwu-recorder-shell { width:100%!important; min-width:0!important; height:auto!important; min-height:100vh; overflow:visible!important; display:block!important; }
    .tingwu-mobile-recording { width:100%!important; min-width:0!important; min-height:100vh!important; height:auto!important; position:relative!important; display:flex!important; flex-direction:column!important; margin:0!important; overflow:visible!important; box-sizing:border-box; background:#f7f7ff!important; }
    .tingwu-mobile-recording * { min-width:0!important; max-width:100%!important; box-sizing:border-box; }
    .tingwu-mobile-recording > .content { display:flex!important; flex-direction:column!important; width:100%!important; min-width:0!important; height:auto!important; min-height:calc(100vh - 64px)!important; margin:0!important; padding:0 12px 20px!important; flex:none!important; position:relative!important; inset:auto!important; gap:12px; }
    .tingwu-mobile-recording > .content > * { width:100%!important; min-width:0!important; max-width:100%!important; flex:none!important; }
    .tingwu-mobile-recording > .content > :first-child:not(.left-area) { min-height:0!important; }
    .tingwu-mobile-recording > .content > .left-area { height:auto!important; display:flex!important; flex-direction:column!important; position:relative!important; inset:auto!important; margin:0!important; gap:12px; }
    .tingwu-mobile-recording .leftContain,.tingwu-mobile-recording .backBox,.tingwu-mobile-recording .bottombg,.tingwu-mobile-recording .rightbg,.tingwu-mobile-recording .iconArrowGray { display:none!important; }
    [data-tingwu-recorder-topbar] { width:100%!important; min-width:0!important; height:auto!important; flex:none!important; }
    .tingwu-mobile-recording .center-area { min-width:0!important; height:auto!important; flex-wrap:wrap; }
    .tingwu-mobile-recording .viewport { width:100%!important; min-width:0!important; height:auto!important; padding:16px!important; display:block!important; }
    .tingwu-mobile-recording .viewport > .left-area { width:100%!important; height:auto!important; display:block!important; }
    .tingwu-mobile-recording .titleContain,.tingwu-mobile-recording .titleContainBig { width:100%!important; max-width:100%!important; margin:0!important; display:flex!important; flex-direction:column!important; gap:4px; }
    .tingwu-mobile-recording .meeting-title-shell { width:100%!important; min-height:28px; }
    .tingwu-mobile-recording .save-message { position:static!important; inset:auto!important; margin:0!important; line-height:20px!important; }
    .tingwu-mobile-recording .meeting-title { font-size:18px!important; max-width:calc(100vw - 56px)!important; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .tingwu-mobile-recording .summary-area { width:100%!important; min-width:0!important; min-height:0!important; height:auto!important; flex:none!important; display:flex!important; flex-direction:column!important; gap:12px; margin:0!important; padding:16px!important; border-radius:20px!important; background:#fff!important; }
    .tingwu-mobile-recording .summary-area > .top { position:relative!important; inset:auto!important; width:100%!important; height:auto!important; min-height:44px; display:flex!important; flex-wrap:wrap; align-items:center; gap:8px; margin:0!important; padding:0!important; }
    .tingwu-mobile-recording .top > .top-button { flex:0 0 44px!important; width:44px!important; height:44px!important; margin:0!important; float:none!important; }
    .tingwu-mobile-recording .summary-area > .searchNew { position:relative!important; inset:auto!important; width:100%!important; height:auto!important; }
    .tingwu-mobile-recording .summary-container { width:100%!important; min-width:0!important; max-width:none!important; height:280px!important; height:clamp(240px,40vh,420px)!important; min-height:240px!important; max-height:none!important; flex:none!important; display:flex!important; flex-direction:column!important; overflow:hidden!important; margin:0!important; font-size:16px; line-height:1.8; word-break:break-word; overflow-wrap:anywhere; }
    .tingwu-mobile-recording .summary-container > * { width:100%!important; height:100%!important; min-height:0!important; flex:1!important; overflow:auto!important; }
    .tingwu-mobile-recording .summary-container .container { width:100%!important; padding:0 4px!important; }
    .tingwu-mobile-recording .rightArea,.tingwu-mobile-recording .rightAreaDragon { width:100%!important; min-width:0!important; flex:none!important; height:320px!important; position:relative!important; inset:auto!important; transform:none!important; margin:0!important; padding:0!important; border-radius:20px; overflow:hidden; }
    .tingwu-mobile-recording .rightArea > *,.tingwu-mobile-recording .rightAreaDragon > * { width:100%!important; height:100%!important; min-height:0!important; }
    .tingwu-mobile-recording .rightArea iframe { width:100%!important; height:100%!important; border:0; }
    .tingwu-mobile-recording .bottomContain { position:relative!important; inset:auto!important; width:100%!important; min-width:0!important; max-width:100%!important; height:auto!important; min-height:80px; margin:0!important; padding:16px!important; border-radius:20px!important; display:flex!important; align-items:center; justify-content:space-between; gap:12px; background:#fff!important; }
    .tingwu-mobile-recording .bottomContain > .content { min-width:0!important; flex:1!important; padding:0!important; margin:0!important; display:flex!important; flex-direction:column!important; align-items:flex-start!important; gap:4px; }
    [data-tingwu-recorder-controls] { width:100%!important; min-width:0!important; height:auto!important; position:relative!important; inset:auto!important; }
    .tingwu-mobile-recording .ball,.tingwu-mobile-recording .ballShadow { display:none!important; }
    .tingwu-mobile-recording .running-text { font-size:14px!important; line-height:20px!important; margin:0!important; white-space:nowrap; }
    .tingwu-mobile-recording .running-time { font-size:18px!important; line-height:24px!important; padding:0!important; margin:0!important; }
    .tingwu-mobile-recording .right-btn { display:flex!important; flex:none!important; gap:8px; padding:0!important; margin:0!important; }
    .tingwu-mobile-recording .play-btn { margin:0!important; }
    .tingwu-mobile-recording .stop-btn,.tingwu-mobile-recording .play-btn { min-width:48px!important; min-height:48px!important; width:48px!important; height:48px!important; flex:none!important; }
    [data-tingwu-recorder-setup-frame] { display:block!important; width:100%!important; height:auto!important; min-height:0!important; flex:none!important; margin:0!important; padding:0!important; }
    [data-tingwu-recorder-setup] { display:flex!important; flex-direction:column!important; align-items:stretch!important; width:100%!important; margin:0!important; padding:16px!important; border-radius:20px; background:#fff; }
    [data-tingwu-recorder-fields] { display:flex!important; flex-direction:column!important; align-items:stretch!important; width:100%!important; gap:16px; }
    [data-tingwu-recorder-fields] > * { width:100%!important; flex:none!important; margin:0!important; padding:0!important; }
    [data-tingwu-recorder-fields] .langLineSpan { font-size:14px!important; line-height:22px!important; }
    [data-tingwu-recorder-languages] { display:grid!important; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; width:100%!important; }
    [data-tingwu-recorder-languages] > * { width:100%!important; height:44px!important; margin:0!important; padding:4px!important; font-size:14px!important; }
    [data-tingwu-recorder-fields] .translate-item-des,[data-tingwu-recorder-fields] .translate-disabled { width:100%!important; height:44px!important; font-size:14px!important; }
    [data-tingwu-recorder-setup] [data-e2e-test-id="beforeRecord_start_button"] { width:100%!important; height:52px!important; flex:none!important; margin:20px 0 0!important; font-size:18px!important; }
    [data-tingwu-recorder-illustration] { width:160px!important; height:108px!important; flex:none!important; align-self:center; position:relative!important; margin:0 0 16px!important; }
    [data-tingwu-recorder-illustration] > * { width:100%!important; height:100%!important; position:static!important; background-position:center!important; background-size:contain!important; }
    [data-tingwu-recorder-setup] .versionMicTipHigh { position:static!important; width:100%!important; height:auto!important; min-height:44px; margin:0 0 16px!important; padding:12px!important; white-space:normal!important; }
    [data-tingwu-recorder-setup] .micTipDescribe { flex:1; overflow-wrap:anywhere; }
    [data-tingwu-recorder-setup] .triple { display:none!important; }
    .ant-modal { width:calc(100vw - 32px)!important; max-width:420px!important; min-width:0!important; margin:16px auto!important; top:16px; padding-bottom:16px; box-sizing:border-box; }
    .ant-modal-content { border-radius:20px!important; }
    .ant-modal-body { max-height:calc(100vh - 180px)!important; overflow:auto!important; padding:20px!important; }
    .ant-modal-confirm-body { min-width:0!important; }
    .ant-modal-confirm-content { width:auto!important; min-width:0!important; max-width:100%!important; margin:12px 0 0!important; overflow-wrap:anywhere; }
    .ant-modal-confirm-title { white-space:normal!important; overflow-wrap:anywhere; }
    .ant-modal-confirm-content .ant-select { width:100%!important; min-width:0!important; max-width:100%!important; }
    .ant-modal-confirm-btns { display:flex; flex-wrap:wrap; gap:8px; }
    .ant-modal button { min-height:40px; }
    .ant-select-dropdown { max-width:calc(100vw - 24px)!important; }
    .aliyun-login-wrapper { width:calc(100vw - 32px)!important; max-width:420px!important; min-width:0!important; border-radius:20px!important; overflow:hidden; }
    #aliyun-login-box { width:100%!important; max-width:100%!important; min-width:0!important; }
  `;

  const applyLayout = () => {
    if (!document.documentElement) return;
    try { Object.defineProperty(navigator, 'platform', { configurable: true, get: () => 'Win32' }); } catch (_) {}
    if (!document.getElementById('tingwu-recorder-mobile-style')) {
      const style = document.createElement('style');
      style.id = 'tingwu-recorder-mobile-style';
      style.textContent = css;
      (document.head || document.documentElement).append(style);
    }
    let metas = Array.from(document.querySelectorAll('meta[name="viewport"]'));
    if (!metas.length && document.head) {
      const meta = document.createElement('meta');
      meta.name = 'viewport';
      document.head.append(meta);
      metas = [meta];
    }
    metas.forEach(meta => { meta.content = 'width=device-width, initial-scale=1, user-scalable=yes'; });
  };
  const recordingRoot = () => {
    let node = document.querySelector('.leftContain, .summary-area');
    while (node && node !== document.body) {
      if (Array.from(node.children).some(child => child.classList.contains('content'))) return node;
      node = node.parentElement;
    }
    return null;
  };
  const exposeRecording = root => {
    root.classList.add('tingwu-mobile-recording');
    let node = root;
    while (node.parentElement && node.parentElement !== document.body) {
      node.parentElement.classList.add('tingwu-recorder-shell');
      for (const sibling of node.parentElement.children) {
        if (sibling !== node && !['SCRIPT','STYLE','LINK'].includes(sibling.tagName)) {
          sibling.setAttribute('data-tingwu-recorder-hidden', '');
        }
      }
      node = node.parentElement;
    }
    let topbar = root.querySelector('.meeting-title');
    while (topbar && topbar.parentElement && topbar.parentElement !== root) topbar = topbar.parentElement;
    if (topbar) topbar.setAttribute('data-tingwu-recorder-topbar', '');
    const controls = root.querySelector('.bottomContain');
    if (controls && controls.parentElement && !controls.parentElement.classList.contains('left-area')) {
      controls.parentElement.setAttribute('data-tingwu-recorder-controls', '');
    }
    // jYMI's pre-record form has independent desktop dimensions; the transcript rules do not reach it.
    const start = root.querySelector('[data-e2e-test-id="beforeRecord_start_button"]');
    const language = root.querySelector('[data-e2e-test-id="beforeRecord_chooseLan_select"]');
    if (start && language) {
      const setup = start.parentElement;
      const languages = language.parentElement;
      const fields = languages && languages.parentElement && languages.parentElement.parentElement;
      if (setup && fields && setup.contains(fields)) {
        setup.setAttribute('data-tingwu-recorder-setup', '');
        fields.setAttribute('data-tingwu-recorder-fields', '');
        languages.setAttribute('data-tingwu-recorder-languages', '');
        if (fields.previousElementSibling) fields.previousElementSibling.setAttribute('data-tingwu-recorder-illustration', '');
        let frame = setup.parentElement;
        while (frame && frame !== root && !frame.classList.contains('content')) {
          frame.setAttribute('data-tingwu-recorder-setup-frame', '');
          frame = frame.parentElement;
        }
      }
    }
    document.documentElement.dataset.tingwuRecorderStage = 'recording';
    enteredRecord = true;
    ready('recording');
  };
  const update = () => {
    scheduled = false;
    applyLayout();
    if (!document.documentElement) return;
    const root = recordingRoot();
    if (root && /\/doc\/(?:edit\/)?record\/?$/.test(location.pathname)) {
      exposeRecording(root);
      return;
    }
    if (enteredRecord && !captureActive && /^\/(?:home\/?$|(?:doc|discover)\/transcripts\/[^/]+\/?$)/.test(location.pathname)) {
      if (!completed) { completed = true; send({ type: 'completed' }); }
      return;
    }
    const dialog = findVisible('.ant-modal-wrap, [role="dialog"]');
    if (dialog) {
      document.documentElement.dataset.tingwuRecorderStage = 'configuration';
      ready('configuration');
      return;
    }
    if (enteredRecord || recordClicked) return;
    document.documentElement.dataset.tingwuRecorderStage = 'preparing';
    const entry = Array.from(document.querySelectorAll('.AddSummaryPopover_AddSummary, [class*="AddSummaryPopover_AddSummary"], [data-e2e-test-id="home_trans_div"]'))
      .find(element => {
        const label = element.querySelector('.ButtonTitle, .AddSummaryPopover_AddSummaryText');
        return visible(element) && (label ? label.textContent : element.textContent).trim() === '开启实时记录';
      });
    if (entry) {
      recordClicked = true;
      entry.click();
    } else if (!menuOpened) {
      const menu = findVisible('.addSummaryBtn');
      if (menu) {
        menuOpened = true;
        menu.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        menu.click();
      }
    }
  };
  function schedule() {
    if (!scheduled) { scheduled = true; setTimeout(update, 0); }
  }
  const requestExit = () => {
    const finish = findVisible('[data-e2e-test-id="record_finish_icon"], .stop-btn');
    if (finish) finish.click();
    else {
      const back = document.querySelector('.leftContain .backBox');
      if (back) back.click();
      else if (!enteredRecord && !captureActive) send({ type: 'dismissed' });
      else send({ type: 'back-unavailable' });
    }
  };
  window.addEventListener('message', event => {
    if (event.data === 'tingwu-recorder-exit') { requestExit(); return; }
    if (event.data !== 'tingwu-recorder' || !event.ports || !event.ports[0]) return;
    if (port) port.close();
    port = event.ports[0];
    port.onmessage = message => {
      if (message.data === 'request-exit') requestExit();
      if (message.data === 'query-state') {
        if (lastReady) send(lastReady);
        send({ type: 'capture', active: captureActive });
        schedule();
      }
    };
    if (lastReady) send(lastReady);
    send({ type: 'capture', active: captureActive });
    schedule();
  });
  window.addEventListener('popstate', schedule);
  window.addEventListener('pagehide', () => {
    audioTracks.forEach(track => track.stop());
    send({ type: 'capture', active: false });
  });
  new MutationObserver(schedule).observe(document, { childList: true, subtree: true });
  schedule();
})();
