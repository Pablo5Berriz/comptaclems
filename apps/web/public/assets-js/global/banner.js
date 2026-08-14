// apps/web/public/assets-js/global/banner.js
(function () {
  const KEY = 'cc_banner_cache_v1';
  const TTL_MS = 60_000;

  function safeJsonParse(s) {
    try { return JSON.parse(s); } catch { return null; }
  }

  function getCache() {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const obj = safeJsonParse(raw);
    if (!obj || !obj.fetchedAt) return null;
    if (Date.now() - obj.fetchedAt > TTL_MS) return null;
    return obj.data || null;
  }

  function setCache(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ fetchedAt: Date.now(), data }));
    } catch {}
  }

  function isAdminPage() {
    return window.location.pathname.startsWith('/admin/');
  }

  function hasAdminToken() {
    const raw = localStorage.getItem('cc_admin_auth');
    if (!raw) return false;
    const obj = safeJsonParse(raw);
    return !!obj?.token;
  }

  function canCloseBanner() {
    // Fermeture autorisée uniquement pour admin (page admin + token)
    return isAdminPage() && hasAdminToken();
  }

  function levelToClass(level) {
    const s = String(level || 'info').toLowerCase();
    if (s === 'warning') return 'bg-amber-500 text-slate-950';
    if (s === 'danger') return 'bg-red-600 text-white';
    return 'bg-sky-600 text-white';
  }

  function ensureContainer() {
    let el = document.getElementById('globalBanner');
    if (el) return el;

    el = document.createElement('div');
    el.id = 'globalBanner';
    el.className = 'hidden w-full';
    document.body.insertBefore(el, document.body.firstChild);
    return el;
  }

  function escapeHtml(s) {
    return String(s ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function labelForLevel(level) {
    const s = String(level || 'info').toLowerCase();
    if (s === 'warning') return 'Alerte';
    if (s === 'danger') return 'Urgent';
    return 'Info';
  }

  function render(banner) {
    const host = ensureContainer();
    const enabled = !!banner?.enabled;
    const msg = String(banner?.message || '').trim();

    if (!enabled || !msg) {
      host.classList.add('hidden');
      host.innerHTML = '';
      return;
    }

    const level = String(banner.level || 'info').toLowerCase();
    const cls = levelToClass(level);
    const closable = canCloseBanner();

    host.className = `w-full ${cls}`;
    host.innerHTML = `
      <div class="max-w-7xl mx-auto px-6">
        <div class="py-3 md:py-3.5 flex items-center justify-between gap-4">
          <div class="flex items-start gap-3">
            <span class="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold bg-white/20">
              ${escapeHtml(labelForLevel(level))}
            </span>
            <div class="leading-snug">
              <div class="text-[15px] md:text-[16px] font-semibold tracking-[0.01em]">
                ${escapeHtml(msg)}
              </div>
            </div>
          </div>

          ${
            closable
              ? `<button id="bannerCloseBtn"
                    class="shrink-0 rounded-lg px-3 py-2 text-sm font-semibold bg-white/15 hover:bg-white/25 transition"
                    type="button" aria-label="Fermer la bannière">
                    Fermer
                 </button>`
              : ''
          }
        </div>
      </div>
    `;

    host.classList.remove('hidden');

    if (closable) {
      const btn = document.getElementById('bannerCloseBtn');
      btn?.addEventListener('click', () => {
        host.classList.add('hidden');
        host.innerHTML = '';
      });
    }
  }

  async function fetchBanner() {
    const cached = getCache();
    if (cached) return cached;

    const r = await fetch('/api/public/banner', { method: 'GET', cache: 'no-store' });
    if (!r.ok) return null;

    const data = await r.json().catch(() => null);
    if (!data?.success) return null;

    setCache(data.banner);
    return data.banner;
  }

  document.addEventListener('DOMContentLoaded', async () => {
    try {
      const banner = await fetchBanner();
      render(banner);
    } catch {}
  });
})();
