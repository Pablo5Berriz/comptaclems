// /public/assets-js/global/theme.js
'use strict';

(function () {
  const KEY = 'cc_theme'; // auto | light | dark

  function safeGet() {
    try { return localStorage.getItem(KEY); } catch { return null; }
  }

  function safeSet(v) {
    try { localStorage.setItem(KEY, v); } catch {}
  }

  function normalize(v) {
    return (v === 'light' || v === 'dark' || v === 'auto') ? v : 'auto';
  }

  function prefersDark() {
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  function computeIsDark(mode) {
    return mode === 'dark' || (mode === 'auto' && prefersDark());
  }

  function apply(mode, opts) {
    const m = normalize(mode);
    const isDark = computeIsDark(m);

    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.setAttribute('data-theme', m);

    if (!opts || !opts.silent) safeSet(m);
    return { mode: m, isDark };
  }

  function getMode() {
    return normalize(safeGet());
  }

  function init() {
    apply(getMode(), { silent: true });

    // Si auto, on suit le système
    const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    if (mq && typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', () => {
        if (getMode() === 'auto') apply('auto', { silent: true });
      });
    }
  }

  // API globale optionnelle
  window.CC_THEME = {
    init,
    apply,
    getMode,
  };

  init();
})();
