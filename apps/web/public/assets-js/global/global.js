// web/public/assets-js/global/global.js
'use strict';

// ====================================
// ÉTAT GLOBAL EXPOSÉ
// ====================================
window.ccState = {
  isAuthenticated: false,
  user: null,
  firstName: 'Client',
  isReady: false
};

// ====================================
// LISTE DES PAGES PUBLIQUES
// ====================================
const PUBLIC_PAGES = [
  '/auth/login.html',
  '/auth/register.html',
  '/auth/forgot-password.html',
  '/auth/reset-password.html',
  '/index.html',
  '/',
  '/about/',
  '/services/',
  '/contact/',
  '/mentions-legales.html',
  '/politique-confidentialite.html'
];

// Vérifier si la page actuelle est publique
function isPublicPage() {
  const currentPath = window.location.pathname;
  return PUBLIC_PAGES.some(page => currentPath === page || currentPath.endsWith(page));
}

document.addEventListener('DOMContentLoaded', function () {
  /* ============================
   *  SCROLL TOP
   * ============================ */
  const scrollTopBtn = document.getElementById('scrollTop');
  if (scrollTopBtn) {
    window.addEventListener('scroll', toggleScrollTopButton);
    scrollTopBtn.addEventListener('click', scrollToTop);
    toggleScrollTopButton();
  }

  /* ============================
   *  FAQ 
   * ============================ */
  const faqButtons = document.querySelectorAll('.faq-question');
  if (faqButtons.length > 0) {
    faqButtons.forEach((btn) => {
      const answer =
        btn.closest('.faq-item')?.querySelector('.faq-answer') ||
        btn.parentElement?.nextElementSibling;

      if (answer) {
        btn.setAttribute('aria-expanded', answer.classList.contains('hidden') ? 'false' : 'true');
      }

      btn.addEventListener('click', () => {
        const ans =
          btn.closest('.faq-item')?.querySelector('.faq-answer') ||
          btn.parentElement?.nextElementSibling;

        const icon = btn.querySelector('i');
        if (!ans) return;

        const isHidden = ans.classList.contains('hidden');
        ans.classList.toggle('hidden', !isHidden);

        if (isHidden) {
          faqButtons.forEach((otherBtn) => {
            if (otherBtn === btn) return;

            const otherAnswer =
              otherBtn.closest('.faq-item')?.querySelector('.faq-answer') ||
              otherBtn.parentElement?.nextElementSibling;

            const otherIcon = otherBtn.querySelector('i');

            if (otherAnswer && !otherAnswer.classList.contains('hidden')) {
              otherAnswer.classList.add('hidden');
              otherIcon?.classList.remove('rotate-180');
              otherBtn.setAttribute('aria-expanded', 'false');
            }
          });
        }

        icon?.classList.toggle('rotate-180', isHidden);
        btn.setAttribute('aria-expanded', String(isHidden));
      });
    });
  }

  /* ============================
   *  NAV CENTRÉE (desktop)
   * ============================ */
  adjustHeaderNav();
  window.addEventListener('load', adjustHeaderNav);
  window.addEventListener('resize', debounce(adjustHeaderNav, 100));

  /* ============================
   *  TESTIMONIALS (home)
   * ============================ */
  const testimonialsContainer = document.getElementById('testimonialsList');
  if (testimonialsContainer) {
    const TESTIMONIALS_API_URL = '/api/public/testimonials';
    const TESTIMONIALS_MAX_ITEMS = 3;

    function escapeHtml(str) {
      return String(str ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
    }

    function formatDate(iso) {
      if (!iso) return '';
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '';
      return d.toLocaleDateString('fr-CA', { year: 'numeric', month: 'long', day: 'numeric' });
    }

    function renderStars(rating) {
      const r = Math.max(0, Math.min(5, Number(rating) || 0));
      let html = '';
      for (let i = 1; i <= 5; i++) {
        html += i <= r
          ? '<i class="fas fa-star text-amber-400"></i>'
          : '<i class="far fa-star text-slate-300"></i>';
      }
      return html;
    }

    function clampText(text, max = 180) {
      const t = String(text ?? '').trim();
      if (t.length <= max) return t;
      return t.slice(0, max - 1).trimEnd() + '…';
    }

    function testimonialCard(t) {
      const name = escapeHtml(t.client_name || 'Client');
      const raw = t.content || t.full_text || '';
      const content = escapeHtml(clampText(raw, 180));
      const date = escapeHtml(formatDate(t.created_at));
      const stars = renderStars(t.rating);

      return `
        <article class="bg-slate-50 border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
          <div class="flex items-center justify-between mb-4">
            <div class="font-bold text-slate-900">${name}</div>
            <div class="flex items-center gap-1" aria-label="Note ${escapeHtml(t.rating)} sur 5">
              ${stars}
            </div>
          </div>

          <p class="text-slate-700 leading-relaxed min-h-[92px]">
            “${content}”
          </p>

          <div class="mt-5 text-xs text-slate-500 flex items-center justify-between">
            <span>${date}</span>
            <span class="inline-flex items-center gap-2">
              <i class="fas fa-badge-check text-emerald-600"></i>
              Approuvé
            </span>
          </div>
        </article>
      `;
    }

    async function loadTestimonialsHome() {
      try {
        const res = await fetch(TESTIMONIALS_API_URL, {
          credentials: 'include',
          cache: 'no-store',
        });

        const json = await res.json().catch(() => null);
        if (!res.ok || !json || json.success !== true) {
          testimonialsContainer.innerHTML = '';
          return;
        }

        const items = Array.isArray(json.testimonials) ? json.testimonials : [];
        // L'API retourne status = 'published' pour les témoignages publiés
        const approved = items.filter((t) => t && t.status === 'published');

        approved.sort((a, b) => {
          const da = new Date(a.created_at || 0).getTime();
          const db = new Date(b.created_at || 0).getTime();
          return db - da; 
        });

        testimonialsContainer.innerHTML = approved
          .slice(0, TESTIMONIALS_MAX_ITEMS)
          .map(testimonialCard)
          .join('');
      } catch (e) {
        console.error('Testimonials home load failed:', e);
        testimonialsContainer.innerHTML = '';
      }
    }

    loadTestimonialsHome();
  }

  /* ============================
   *  AUTH UI (cookie backend)
   * ============================ */
  const state = {
    isAuthenticated: false,
    firstName: 'Client',
    me: null,
  };

  function firstNameFromClient(client) {
    const first = String(client?.first_name || '').trim();
    if (first) return first;

    const full = String(client?.fullName || '').trim();
    if (!full) return 'Client';

    const parts = full.split(' ').filter(Boolean);
    return parts[0] || 'Client';
  }

  function setHeaderAuthenticated(firstName) {
    state.isAuthenticated = true;
    state.firstName = firstName || 'Client';

    // Mettre à jour l'état global
    window.ccState.isAuthenticated = true;
    window.ccState.firstName = state.firstName;
    window.ccState.user = state.me;

    const authButtons = document.getElementById('authButtons');
    const userMenu = document.getElementById('userMenu');
    const userFirstName = document.getElementById('userFirstName');

    if (authButtons) authButtons.style.display = 'none';
    if (userMenu) userMenu.style.display = '';
    if (userFirstName) userFirstName.textContent = state.firstName;

    const mobileRegister = document.getElementById('mobileRegisterLink');
    const mobileLogin = document.getElementById('mobileLoginLink');
    if (mobileRegister) mobileRegister.style.display = 'none';
    if (mobileLogin) mobileLogin.style.display = 'none';

    toggleUserMenu();
    
    // Déclencher l'événement de changement d'authentification
    window.dispatchEvent(new CustomEvent('auth-change', { 
      detail: { 
        isAuthenticated: true, 
        user: state.me,
        firstName: state.firstName
      }
    }));
  }

  function setHeaderPublic() {
    state.isAuthenticated = false;
    state.firstName = 'Client';
    state.me = null;

    // Mettre à jour l'état global
    window.ccState.isAuthenticated = false;
    window.ccState.user = null;
    window.ccState.firstName = 'Client';

    const authButtons = document.getElementById('authButtons');
    const userMenu = document.getElementById('userMenu');

    if (authButtons) authButtons.style.display = '';
    if (userMenu) userMenu.style.display = 'none';

    const mobileRegister = document.getElementById('mobileRegisterLink');
    const mobileLogin = document.getElementById('mobileLoginLink');
    if (mobileRegister) mobileRegister.style.display = '';
    if (mobileLogin) mobileLogin.style.display = '';
    
    // Déclencher l'événement de changement d'authentification
    window.dispatchEvent(new CustomEvent('auth-change', { 
      detail: { isAuthenticated: false }
    }));
  }

  async function fetchAuthMe() {
    // Si c'est une page publique, ne pas faire d'appel API
    if (isPublicPage()) {
      console.log('Page publique - pas de vérification d\'authentification');
      return { authenticated: false };
    }

    try {
      const json = window.http
        ? await window.http.get('/api/auth/me')
        : await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' }).then((r) => r.json());

      const ok = json && json.success === true && json.authenticated === true;
      if (!ok) return { authenticated: false };

      return { authenticated: true, client: json.client || null };
    } catch {
      return { authenticated: false };
    }
  }

  // Guard supprimé — header.js gère déjà tous les liens .requires-auth
  // via document.addEventListener('click') après résolution de checkAuth().
  // Avoir deux guards en parallèle causait une double interception :
  // celui de global.js (state.isAuthenticated encore false) bloquait
  // le clic même quand header.js avait déjà confirmé la connexion.

  async function logout() {
    try {
      if (window.http) {
        await window.http.post('/api/auth/logout', {});
      } else {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      }
    } catch {}
    
    // Mettre à jour l'état avant redirection
    setHeaderPublic();
    
    window.location.href = '/';
  }

  function bindLogout() {
    const logoutBtns = document.querySelectorAll('#logoutBtn, .logout-btn, [data-logout]');
    
    logoutBtns.forEach(btn => {
      btn.removeEventListener('click', handleLogout);
      btn.addEventListener('click', handleLogout);
    });
  }

  async function handleLogout(e) {
    e.preventDefault();
    
    // Désactiver le bouton pour éviter les clics multiples
    const btn = e.currentTarget;
    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Déconnexion...';
    
    try {
      if (window.http) {
        await window.http.post('/api/auth/logout', {});
      } else {
        await fetch('/api/auth/logout', { 
          method: 'POST', 
          credentials: 'include' 
        });
      }
      
      // Mettre à jour l'état avant redirection
      setHeaderPublic();
      
      // Petite pause pour montrer le feedback
      setTimeout(() => {
        window.location.href = '/';
      }, 500);
      
    } catch (error) {
      console.error('Erreur déconnexion:', error);
      // Restaurer le bouton en cas d'erreur
      btn.disabled = false;
      btn.innerHTML = originalHtml;
      
      // Rediriger quand même vers la page d'accueil
      window.location.href = '/';
    }
  }

  function toggleUserMenu() {
    const userMenuTrigger = document.querySelector('.user-menu-trigger');
    const userMenuDropdown = document.querySelector('.user-menu-dropdown');
    if (!userMenuTrigger || !userMenuDropdown) return;

    if (!userMenuDropdown.classList.contains('hidden')) {
      userMenuDropdown.classList.add('hidden');
    }

    userMenuTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      userMenuDropdown.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
      if (!userMenuTrigger.contains(e.target) && !userMenuDropdown.contains(e.target)) {
        userMenuDropdown.classList.add('hidden');
      }
    });
  }

  async function bootAuthUI() {
    if (isPublicPage()) {
      setHeaderPublic();
      window.ccState.isReady = true;
      window.dispatchEvent(new CustomEvent('auth-ready'));
      return;
    }

    setHeaderPublic();

    const auth = await fetchAuthMe();
    if (auth.authenticated) {
      state.me = auth.client;
      setHeaderAuthenticated(firstNameFromClient(auth.client));
    }

    window.ccState.isReady = true;
    window.dispatchEvent(new CustomEvent('auth-ready'));
  }

  bindLogout();
  bootAuthUI();
});

/* ============================
 *  SCROLL TOP helpers
 * ============================ */
function toggleScrollTopButton() {
  const scrollTopBtn = document.getElementById('scrollTop');
  if (!scrollTopBtn) return;

  if (window.scrollY > 300) {
    scrollTopBtn.classList.remove('hidden');
    scrollTopBtn.setAttribute('aria-label', 'Retour en haut de la page');
  } else {
    scrollTopBtn.classList.add('hidden');
  }
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ============================
 *  NAV CENTRÉE
 * ============================ */
function adjustHeaderNav() {
  const headerNav = document.querySelector('.header-nav');
  const header = document.querySelector('.header-gradient');

  if (!headerNav || !header) return;

  if (window.innerWidth >= 1024) {
    const headerWidth = header.offsetWidth;
    const navWidth = headerNav.offsetWidth;
    const leftPosition = (headerWidth - navWidth) / 2;

    if (Math.abs(leftPosition - headerNav.offsetLeft) > 10) {
      headerNav.style.left = `${leftPosition}px`;
      headerNav.style.transform = 'none';
    }
  } else {
    headerNav.style.left = '50%';
    headerNav.style.transform = 'translateX(-50%)';
  }
}

/* ============================
 *  UTILITAIRES
 * ============================ */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

document.addEventListener('click', function (e) {
  const mobileNav = document.getElementById('mobileNav');
  const burgerBtn = document.querySelector('.burger-btn');

  if (
    mobileNav &&
    !mobileNav.contains(e.target) &&
    burgerBtn &&
    !burgerBtn.contains(e.target) &&
    e.target.closest('a')
  ) {
    mobileNav.classList.add('hidden');
  }
});

// Exposer également une fonction utilitaire pour vérifier l'authentification
window.isAuthenticated = function() {
  return window.ccState?.isAuthenticated === true;
};

// Exposer une fonction pour obtenir les infos utilisateur
window.getCurrentUser = function() {
  return window.ccState?.user || null;
};