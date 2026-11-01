(() => {
  if (location.origin !== 'https://tingwu.aliyun.com' || window.top !== window) return;
  if (window.__tingwuMobileRecordEntryInstalled) return;
  window.__tingwuMobileRecordEntryInstalled = true;
  let port = null;
  let lastOpen = 0;
  window.addEventListener('message', event => {
    if (event.data === 'tingwu-media-playback' && event.ports && event.ports[0]) port = event.ports[0];
  });
  document.addEventListener('click', event => {
    if (!event.isTrusted || (window._SYSTEM_CONFIG_ && window._SYSTEM_CONFIG_.upgradeFeatureDisabled === '1')) return;
    const button = event.target && typeof event.target.closest === 'function'
      ? event.target.closest('.menuItem, .menu, .button') : null;
    if (!button) return;
    const label = button.querySelector('.menuItemImageText, .menuTitle, .buttonTitle');
    if (!/^(?:开启)?实时记录(?:转写)?$/.test(label ? label.textContent.trim() : '')) return;
    const bridge = window.TingwuRecordingEntry;
    if (!(bridge && bridge.postMessage) && !port) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (Date.now() - lastOpen < 1000) return;
    lastOpen = Date.now();
    if (bridge && bridge.postMessage) bridge.postMessage('open-recording');
    else port.postMessage('open-recording');
  }, true);
})();
