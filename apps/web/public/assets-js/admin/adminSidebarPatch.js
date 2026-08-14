// adminSidebarPatch.js — Injecte dynamiquement les nouveaux liens dans le sidebar admin
// À inclure dans tous les pages admin (après le DOM chargé)
(function () {
  const NAV_ITEMS = [
    {
      href: '/admin/adminMessages.html',
      nav: 'messages.html',
      icon: 'fa-envelope',
      label: 'Messages',
      badgeId: 'sidebarMsgBadge'
    },
    {
      href: '/admin/adminInterac.html',
      nav: 'interac.html',
      icon: 'fa-file-invoice-dollar',
      label: 'Factures Interac',
      badgeId: 'sidebarInteracBadge'
    },
    {
      href: '/admin/adminCampagnes.html',
      nav: 'campagnes.html',
      icon: 'fa-bullhorn',
      label: 'Campagnes marketing',
      badgeId: 'sidebarCampBadge'
    }
  ];

  function buildNavLink({ href, nav, icon, label, badgeId }) {
    const a = document.createElement('a');
    a.href = href;
    a.setAttribute('data-nav', nav);
    a.className = 'flex items-center px-4 py-3 rounded-xl transition-all group';
    a.style.cssText = 'color: rgba(255,255,255,0.75);';
    a.innerHTML = `
      <i class="fas ${icon} mr-3 w-4 text-center"></i>
      ${label}
      <span id="${badgeId}" class="hidden ml-auto px-2 py-0.5 rounded-full text-xs font-bold bg-red-500 text-white">0</span>
    `;
    // Active state
    const current = window.location.pathname.split('/').pop();
    if (current === nav.split('/').pop()) {
      a.classList.add('active');
      a.style.cssText = 'background: linear-gradient(135deg, var(--navy-700), var(--navy-600)); border-left: 3px solid var(--gold-400); box-shadow: 0 4px 12px rgba(0,0,0,0.25);';
      a.style.color = '#fff';
    }
    // Hover
    a.addEventListener('mouseenter', () => {
      if (!a.classList.contains('active')) {
        a.style.background = 'rgba(255,255,255,0.08)';
        a.style.color = '#fff';
      }
    });
    a.addEventListener('mouseleave', () => {
      if (!a.classList.contains('active')) {
        a.style.background = '';
        a.style.color = 'rgba(255,255,255,0.75)';
      }
    });
    return a;
  }

  function injectLinks() {
    const nav = document.getElementById('adminSidebarNav');
    if (!nav) return;

    // Éviter les doublons
    if (nav.querySelector('[data-nav="messages.html"]')) return;

    // Trouver le séparateur avant "Paramètres" pour insérer avant lui
    const links = nav.querySelectorAll('a');
    let settingsLink = null;
    links.forEach(a => {
      if (a.getAttribute('data-nav') === 'settings.html') settingsLink = a;
    });

    NAV_ITEMS.forEach(item => {
      const link = buildNavLink(item);
      if (settingsLink) {
        nav.insertBefore(link, settingsLink);
      } else {
        nav.appendChild(link);
      }
    });

    // Charger le badge des messages non lus
    loadUnreadBadge();
  }

  function loadUnreadBadge() {
    const auth = (() => {
      try { return JSON.parse(localStorage.getItem('cc_admin_auth') || '{}'); } catch { return {}; }
    })();
    if (!auth.token) return;

    fetch('/api/admin/messages/stats', {
      headers: { Authorization: `Bearer ${auth.token}` }
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        const badge = document.getElementById('sidebarMsgBadge');
        if (badge && data.unread_count > 0) {
          badge.textContent = data.unread_count;
          badge.classList.remove('hidden');
        }
      })
      .catch(() => {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectLinks);
  } else {
    injectLinks();
  }
})();
