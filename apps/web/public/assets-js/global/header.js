'use strict';

/* =========================
 *  THEME INIT
 * ========================= */
(function () {
  try {
    var key = 'cc_theme';
    var saved = localStorage.getItem(key);
    var mode = (saved === 'light' || saved === 'dark' || saved === 'auto') ? saved : 'auto';
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var shouldDark = mode === 'dark' || (mode === 'auto' && prefersDark);
    document.documentElement.classList.toggle('dark', shouldDark);
    document.documentElement.setAttribute('data-theme', shouldDark ? 'dark' : 'light');

    var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    if (mq && typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', function () {
        try {
          var v = localStorage.getItem(key);
          var m = (v === 'light' || v === 'dark' || v === 'auto') ? v : 'auto';
          if (m !== 'auto') return;
          document.documentElement.classList.toggle('dark', mq.matches);
          document.documentElement.setAttribute('data-theme', mq.matches ? 'dark' : 'light');
        } catch (_) {}
      });
    }
  } catch (_) {}
})();

/* =========================
 *  INJECTION HTML DU HEADER
 * ========================= */
document.write(`
  <!-- Bouton retour en haut -->
  <button
    id="scrollTop"
    aria-label="Retour en haut"
    type="button"
    style="
      display:none;
      position:fixed;
      bottom:2rem;
      right:2rem;
      z-index:60;
      width:44px;
      height:44px;
      border-radius:50%;
      background:var(--navy-800,#0A2540);
      color:white;
      border:none;
      cursor:pointer;
      box-shadow:var(--shadow-lg);
      align-items:center;
      justify-content:center;
      font-size:1rem;
      transition:all 0.2s ease;
    "
  >
    <i class="fas fa-chevron-up"></i>
  </button>

  <!-- HEADER -->
<header class="cc-header" id="cc-header">
  <div class="cc-header__inner">

    <!-- Logo -->
    <a href="/index.html" class="cc-header__logo" aria-label="ComptaClems — Accueil">
      <img
        src="/assets/logo/Comptaclems.png"
        alt="Logo ComptaClems"
        loading="eager"
      />
    </a>

    <!-- Navigation desktop -->
    <nav class="cc-header__nav" aria-label="Navigation principale">
      <a href="/about/index.html" class="cc-nav-link">À propos</a>
      <a href="/services/index.html" class="cc-nav-link">Services</a>
      <a href="/espace-client/declaration.html" class="cc-nav-link">Particuliers</a>
      <a href="/espace-client/autonome.html" class="cc-nav-link">Travailleurs autonomes</a>
      <a href="/espace-client/pme.html" class="cc-nav-link">PME</a>
    </nav>

    <!-- Zone droite -->
    <div class="cc-header__right">

      <!-- Téléphone (desktop) -->
      <div class="cc-header__phone">
        <span class="cc-header__phone-label">Service disponible 7j/7</span>
        <a href="tel:+15062521410" class="cc-header__phone-number">506-252-1410</a>
      </div>

      <!-- Contact rapide -->
      <a href="/contact/index.html" class="cc-header__contact">
        <span>Contact rapide</span>
      </a>

      <!-- Theme toggle -->
      <button
        id="themeToggle"
        class="cc-theme-toggle"
        aria-label="Basculer le thème"
        type="button"
      >
        <i class="fas fa-moon cc-icon-moon" aria-hidden="true"></i>
        <i class="fas fa-sun cc-icon-sun" aria-hidden="true"></i>
      </button>

      <!-- Boutons publics (non connecté) -->
      <div id="authButtons" class="cc-header__auth">
        <a href="/auth/register.html" class="cc-btn cc-btn--ghost">Inscription</a>
        <a href="/auth/login.html" class="cc-btn cc-btn--outline">Connexion</a>
      </div>

      <!-- Menu utilisateur (connecté) -->
      <div id="userMenu" class="cc-user-menu" style="display:none;">
        <button
          type="button"
          class="cc-user-trigger"
          id="userMenuTrigger"
          aria-haspopup="menu"
          aria-expanded="false"
        >
          <span class="cc-user-avatar" aria-hidden="true">
            <i class="fas fa-user"></i>
          </span>
          <span id="userFirstName">Client</span>
          <i class="fas fa-chevron-down cc-user-chevron" aria-hidden="true"></i>
        </button>

        <div id="userMenuDropdown" class="cc-user-dropdown" role="menu" aria-label="Menu utilisateur" style="display:none;">
          <a href="/espace-client/profil.html" class="cc-dropdown-item" role="menuitem">
            <i class="fas fa-id-badge" aria-hidden="true"></i>
            <span>Profil</span>
          </a>
          <a href="/espace-client/parametres.html" class="cc-dropdown-item" role="menuitem">
            <i class="fas fa-sliders-h" aria-hidden="true"></i>
            <span>Paramètres</span>
          </a>
          <div class="cc-dropdown-divider"></div>
          <button type="button" id="logoutBtn" class="cc-dropdown-item cc-dropdown-item--danger" role="menuitem">
            <i class="fas fa-right-from-bracket" aria-hidden="true"></i>
            <span>Déconnexion</span>
          </button>
        </div>
      </div>

      <!-- Burger mobile -->
      <button
        class="cc-burger"
        id="burgerBtn"
        type="button"
        aria-label="Ouvrir le menu"
        aria-expanded="false"
        aria-controls="cc-mobile-menu"
      >
        <span class="cc-burger__line"></span>
        <span class="cc-burger__line"></span>
        <span class="cc-burger__line"></span>
      </button>

    </div>
  </div>

  <!-- Nav mobile -->
  <div id="cc-mobile-menu" class="cc-mobile-nav" aria-hidden="true">
    <nav>
      <a href="/about/index.html" class="cc-mobile-link">
        <i class="fas fa-info-circle" aria-hidden="true"></i> À propos
      </a>
      <a href="/services/index.html" class="cc-mobile-link">
        <i class="fas fa-briefcase" aria-hidden="true"></i> Services
      </a>
      <a href="/espace-client/declaration.html" class="cc-mobile-link">
        <i class="fas fa-file-alt" aria-hidden="true"></i> Particuliers
      </a>
      <a href="/espace-client/autonome.html" class="cc-mobile-link">
        <i class="fas fa-laptop-house" aria-hidden="true"></i> Travailleurs autonomes
      </a>
      <a href="/espace-client/pme.html" class="cc-mobile-link">
        <i class="fas fa-building" aria-hidden="true"></i> PME
      </a>
      <!-- Contact dans le menu mobile -->
      <a href="/contact/index.html" class="cc-mobile-link">
        <i class="fas fa-envelope" aria-hidden="true"></i> Contact
      </a>
    </nav>
    <div class="cc-mobile-nav__footer" id="mobileAuthZone">
      <a href="/auth/register.html" class="cc-btn cc-btn--outline" style="width:100%;justify-content:center;" id="mobileRegisterLink">
        Inscription
      </a>
      <a href="/auth/login.html" class="cc-btn cc-btn--primary" style="width:100%;justify-content:center;" id="mobileLoginLink">
        Connexion
      </a>
    </div>
  </div>
</header>

<style>
  /* ── Header shell ── */
  .cc-header {
    position: sticky;
    top: 0;
    z-index: 30;
    background: rgba(7, 21, 38, 0.97);
    backdrop-filter: blur(20px) saturate(180%);
    -webkit-backdrop-filter: blur(20px) saturate(180%);
    border-bottom: 1px solid rgba(255,255,255,0.07);
    transition: box-shadow 0.3s ease;
  }
  .cc-header.is-scrolled {
    box-shadow: 0 4px 24px rgba(0,0,0,0.35);
  }

  /* ── Inner layout ── */
  .cc-header__inner {
    width: 100%;
    padding: 0 clamp(1.25rem, 2.5vw, 2.5rem);
    height: 100px;
    display: flex;
    align-items: center;
    gap: 0;
  }

  /* ── Logo ── */
  .cc-header__logo {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    text-decoration: none;
    margin-right: 2.5rem;
  }
  .cc-header__logo img {
    height: 150px;
    width: 120px;
    display: block;
    transition: opacity 0.2s ease;
    filter: brightness(1.15) drop-shadow(0 0 6px rgba(255,255,255,0.15));
  }
  .cc-header__logo:hover img { opacity: 0.85; }

  /* ── Nav desktop ── */
  .cc-header__nav {
    display: flex;
    align-items: center;
    gap: 3rem;
    flex: 1;
    justify-content: center;
  }
  .cc-nav-link {
    padding: 0.45rem 0.875rem;
    border-radius: 8px;
    font-size: 0.9375rem;
    font-weight: 600;
    color: rgba(255,255,255,0.78);
    text-decoration: none;
    white-space: nowrap;
    letter-spacing: 0.01em;
    transition: color 0.15s ease, background 0.15s ease;
  }
  .cc-nav-link:hover,
  .cc-nav-link.is-active {
    color: #fff;
    background: rgba(255,255,255,0.08);
  }

  /* ── Zone droite ── */
  .cc-header__right {
    display: flex;
    align-items: center;
    gap: 3rem;
    flex-shrink: 0;
  }

  /* ── Téléphone ── */
  .cc-header__phone {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    padding-right: 0.875rem;
    border-right: 1px solid rgba(255,255,255,0.12);
    line-height: 1.25;
  }
  .cc-header__phone-label {
    font-size: 0.6875rem;
    color: rgba(255,255,255,0.4);
    letter-spacing: 0.03em;
  }
  .cc-header__phone-number {
    font-size: 0.9rem;
    font-weight: 700;
    color: rgba(255,255,255,0.9);
    text-decoration: none;
    transition: color 0.15s;
  }
  .cc-header__phone-number:hover { color: #D4AF37; }

  /* ── Contact rapide ── */
  .cc-header__contact {
    display: inline-flex;
    align-items: center;
    padding: 0.4rem 1rem;
    border-radius: 9999px;
    background: #D4AF37;
    border: 1.5px solid #4f46e5;
    color: #ffffff;
    font-size: 0.8125rem;
    font-weight: 600;
    text-decoration: none;
    transition: all 0.2s ease;
    white-space: nowrap;
    letter-spacing: 0.01em;
  }
  .cc-header__contact:hover {
    background: #ffffff;
    border-color: #D4AF37;
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(67,56,202,0.4);
  }

  /* ── Theme toggle ── */
  .cc-theme-toggle {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255,255,255,0.07);
    border: 1px solid rgba(255,255,255,0.12);
    color: rgba(255,255,255,0.65);
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 0.85rem;
    flex-shrink: 0;
  }
  .cc-theme-toggle:hover {
    background: rgba(255,255,255,0.13);
    color: #fff;
    transform: rotate(18deg);
  }
  .cc-icon-sun  { display: none; }
  .cc-icon-moon { display: block; }
  [data-theme="dark"] .cc-icon-sun  { display: block; }
  [data-theme="dark"] .cc-icon-moon { display: none; }

  /* ── Boutons header ── */
  .cc-header__auth {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-left: auto;
  }
  .cc-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    padding: 0.5rem 1.125rem;
    border-radius: 9999px;
    font-size: 0.875rem;
    font-weight: 500;
    text-decoration: none;
    cursor: pointer;
    border: 1.5px solid transparent;
    transition: all 0.18s ease;
    white-space: nowrap;
    font-family: inherit;
    line-height: 1;
  }
  .cc-btn--ghost {
    background: transparent;
    border-color: rgba(255,255,255,0.2);
    color: rgba(255,255,255,0.75);
  }
  .cc-btn--ghost:hover {
    border-color: rgba(255,255,255,0.4);
    color: #fff;
    background: rgba(255,255,255,0.06);
  }
  .cc-btn--outline {
    background: rgba(255,255,255,0.08);
    border-color: rgba(255,255,255,0.25);
    color: #fff;
  }
  .cc-btn--outline:hover {
    background: rgba(255,255,255,0.15);
    border-color: rgba(255,255,255,0.45);
  }
  .cc-btn--primary {
    background: #0A2540;
    border-color: #0A2540;
    color: #fff;
    box-shadow: 0 2px 8px rgba(10,37,64,0.4);
  }
  .cc-btn--primary:hover {
    background: #0D3054;
    border-color: #0D3054;
  }
  .cc-btn--gold {
    background: #D4AF37;
    border-color: #D4AF37;
    color: #071526;
    font-weight: 600;
  }
  .cc-btn--gold:hover {
    background: #E5C87B;
    border-color: #E5C87B;
  }

  /* ── User menu ── */
  .cc-user-menu { position: relative; margin-left: auto; }
  .cc-user-trigger {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.35rem 0.75rem 0.35rem 0.35rem;
    border-radius: 9999px;
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.15);
    color: rgba(255,255,255,0.9);
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    font-family: inherit;
  }
  .cc-user-trigger:hover {
    background: rgba(255,255,255,0.13);
    border-color: rgba(255,255,255,0.3);
  }
  .cc-user-avatar {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: linear-gradient(135deg, #1A3B5C, #D4AF37);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.75rem;
    color: white;
    flex-shrink: 0;
  }
  .cc-user-chevron {
    font-size: 0.65rem;
    color: rgba(255,255,255,0.45);
    transition: transform 0.2s ease;
  }
  .cc-user-trigger[aria-expanded="true"] .cc-user-chevron {
    transform: rotate(180deg);
  }
  .cc-user-dropdown {
    position: absolute;
    right: 0;
    top: calc(100% + 8px);
    min-width: 192px;
    padding: 0.375rem;
    background: #0F1B2D;
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 14px;
    box-shadow: 0 16px 40px rgba(0,0,0,0.5);
    z-index: 40;
  }
  .cc-dropdown-item {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    width: 100%;
    padding: 0.5rem 0.625rem;
    border-radius: 8px;
    font-size: 0.85rem;
    color: rgba(255,255,255,0.78);
    text-decoration: none;
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: left;
    transition: all 0.13s ease;
    font-family: inherit;
    font-weight: 400;
  }
  .cc-dropdown-item:hover {
    background: rgba(255,255,255,0.07);
    color: #fff;
  }
  .cc-dropdown-item--danger:hover {
    background: rgba(239,68,68,0.12);
    color: #FCA5A5;
  }
  .cc-dropdown-divider {
    height: 1px;
    background: rgba(255,255,255,0.07);
    margin: 0.25rem 0.25rem;
  }
  .cc-dropdown-item i {
    width: 14px;
    text-align: center;
    opacity: 0.6;
    font-size: 0.8rem;
  }

  /* ── Burger ── */
  .cc-burger {
    display: none;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 5px;
    width: 40px;
    height: 40px;
    border-radius: 10px;
    background: rgba(255,255,255,0.07);
    border: 1px solid rgba(255,255,255,0.12);
    cursor: pointer;
    transition: all 0.15s ease;
    flex-shrink: 0;
  }
  .cc-burger:hover {
    background: rgba(255,255,255,0.12);
    border-color: rgba(255,255,255,0.25);
  }
  .cc-burger__line {
    display: block;
    width: 18px;
    height: 1.5px;
    background: rgba(255,255,255,0.85);
    border-radius: 2px;
    transform-origin: center;
    transition: transform 0.25s ease, opacity 0.15s ease, width 0.25s ease;
  }
  .cc-burger.is-open .cc-burger__line:nth-child(1) { transform: translateY(6.5px) rotate(45deg); }
  .cc-burger.is-open .cc-burger__line:nth-child(2) { opacity: 0; width: 0; }
  .cc-burger.is-open .cc-burger__line:nth-child(3) { transform: translateY(-6.5px) rotate(-45deg); }

  /* ── Nav mobile ── */
  .cc-mobile-nav {
    display: none;
    border-top: 1px solid rgba(255,255,255,0.07);
    background: rgba(7,21,38,0.99);
  }
  .cc-mobile-nav.is-open { display: block; }
  .cc-mobile-nav nav {
    padding: 0.75rem 1rem 0.5rem;
  }
  .cc-mobile-link {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.65rem 0.875rem;
    border-radius: 10px;
    font-size: 0.9rem;
    font-weight: 500;
    color: rgba(255,255,255,0.72);
    text-decoration: none;
    margin-bottom: 2px;
    transition: all 0.13s ease;
  }
  .cc-mobile-link:hover {
    background: rgba(255,255,255,0.07);
    color: #fff;
  }
  .cc-mobile-link i {
    width: 16px;
    text-align: center;
    opacity: 0.55;
    font-size: 0.85rem;
  }
  .cc-mobile-nav__footer {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    padding: 0.75rem 1rem 1rem;
    border-top: 1px solid rgba(255,255,255,0.07);
  }

  /* ── Responsive ── */
  @media (max-width: 1024px) {
    .cc-header__nav    { display: none; }
    .cc-header__phone  { display: none; }
    .cc-header__contact { display: none; } /* Caché sur tablette, visible dans menu mobile */
    .cc-burger         { display: flex; }
  }
  @media (max-width: 640px) {
    .cc-header__auth { display: none; }
    .cc-header__inner { gap: 1rem; }
  }
</style>
`);

/* =========================
 *  LOGIQUE BANNER
 * ========================= */
(function () {
  var id = 'ccBannerScript';
  if (!document.getElementById(id)) {
    var s = document.createElement('script');
    s.id = id;
    s.src = '/assets-js/global/banner.js';
    s.defer = true;
    document.head.appendChild(s);
  }
})();

/* =========================
 *  LOGIQUE AUTH + UX HEADER
 * ========================= */
(function () {
  var API_ME     = '/api/client/espace-client/me';
  var API_LOGOUT = '/api/client/espace-client/session';
  var LOGIN_URL  = '/auth/login.html';
  var DECL_URL   = '/espace-client/declaration.html';

  var els = {};
  var isAuthenticated = false;

  function getEls() {
    els.authButtons       = document.getElementById('authButtons');
    els.userMenu          = document.getElementById('userMenu');
    els.userFirstName     = document.getElementById('userFirstName');
    els.trigger           = document.getElementById('userMenuTrigger');
    els.dropdown          = document.getElementById('userMenuDropdown');
    els.logoutBtn         = document.getElementById('logoutBtn');
    els.btnStartDecl      = document.getElementById('btnStartDeclaration');
    els.mobileRegister    = document.getElementById('mobileRegisterLink');
    els.mobileLogin       = document.getElementById('mobileLoginLink');
    els.scrollTop         = document.getElementById('scrollTop');
    els.header            = document.getElementById('cc-header');
    els.burger            = document.getElementById('burgerBtn');
    els.mobileNav         = document.getElementById('cc-mobile-menu');
    els.themeToggle       = document.getElementById('themeToggle');
  }

  function firstNameFrom(data) {
    var raw = (data && (data.firstName || data.prenom || data.fullName || data.name)) || '';
    var s = String(raw).trim();
    if (!s) return 'Client';
    return s.split(' ')[0];
  }

  function setCTAStartDeclaration(isAuth) {
    if (!els.btnStartDecl) return;
    els.btnStartDecl.setAttribute('href',
      isAuth ? DECL_URL : LOGIN_URL + '?redirect=' + encodeURIComponent(DECL_URL)
    );
  }

  function applyLoggedOut() {
    isAuthenticated = false;
    if (els.authButtons) els.authButtons.style.display = '';
    if (els.userMenu)    els.userMenu.style.display    = 'none';
    setCTAStartDeclaration(false);
  }

  function applyLoggedIn(data) {
    isAuthenticated = true;
    if (els.authButtons) els.authButtons.style.display = 'none';
    if (els.userMenu)    els.userMenu.style.display    = '';
    if (els.userFirstName) els.userFirstName.textContent = firstNameFrom(data);
    setCTAStartDeclaration(true);
  }

  /* ── User dropdown ── */
  function initUserDropdown() {
    if (!els.trigger || !els.dropdown) return;

    var close = function () {
      els.dropdown.style.display = 'none';
      els.trigger.setAttribute('aria-expanded', 'false');
    };

    els.trigger.addEventListener('click', function (e) {
      e.preventDefault();
      var isOpen = els.dropdown.style.display !== 'none';
      if (isOpen) { close(); return; }
      els.dropdown.style.display = 'block';
      els.trigger.setAttribute('aria-expanded', 'true');
    });

    document.addEventListener('click', function (e) {
      if (els.userMenu && !els.userMenu.contains(e.target)) close();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });
  }

  /* ── Logout ── */
  function initLogout() {
    if (!els.logoutBtn) return;
    els.logoutBtn.addEventListener('click', async function () {
      try {
        await fetch(API_LOGOUT, { method: 'DELETE', credentials: 'include' });
      } finally {
        window.location.assign('/index.html');
      }
    });
  }

  /* ── Scroll top button ── */
  function initScrollTop() {
    if (!els.scrollTop) return;
    window.addEventListener('scroll', function () {
      var show = window.scrollY > 350;
      els.scrollTop.style.display = show ? 'flex' : 'none';
    });
    els.scrollTop.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  /* ── Header scroll effect ── */
  function initHeaderScroll() {
    if (!els.header) return;
    window.addEventListener('scroll', function () {
      els.header.classList.toggle('is-scrolled', window.scrollY > 20);
    }, { passive: true });
  }

  /* ── Active nav link ── */
  function initActiveNav() {
    var path = window.location.pathname;
    document.querySelectorAll('.cc-nav-link, .cc-mobile-link').forEach(function (a) {
      var href = a.getAttribute('href') || '';
      if (href !== '/' && path.includes(href.replace('.html', ''))) {
        a.classList.add('is-active');
      }
    });
  }

  /* ── Burger mobile ── */
  function initBurger() {
    if (!els.burger || !els.mobileNav) return;

    els.burger.addEventListener('click', function () {
      var isOpen = els.mobileNav.classList.contains('is-open');
      if (isOpen) {
        els.mobileNav.classList.remove('is-open');
        els.burger.classList.remove('is-open');
        els.burger.setAttribute('aria-expanded', 'false');
        els.mobileNav.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
      } else {
        els.mobileNav.classList.add('is-open');
        els.burger.classList.add('is-open');
        els.burger.setAttribute('aria-expanded', 'true');
        els.mobileNav.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && els.mobileNav.classList.contains('is-open')) {
        els.mobileNav.classList.remove('is-open');
        els.burger.classList.remove('is-open');
        els.burger.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
      }
    });
  }

  /* ── Theme toggle ── */
  function initThemeToggle() {
    if (!els.themeToggle) return;
    els.themeToggle.addEventListener('click', function () {
      var html    = document.documentElement;
      var current = html.getAttribute('data-theme') || 'light';
      var next    = current === 'dark' ? 'light' : 'dark';
      html.setAttribute('data-theme', next);
      html.classList.toggle('dark', next === 'dark');
      try { localStorage.setItem('cc_theme', next); } catch (_) {}
    });
  }

  /* ── Guard requires-auth ── */
  function initRequiresAuthGuard() {
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a.requires-auth');
      if (!a) return;
      if (isAuthenticated) return;
      e.preventDefault();
      var href = a.getAttribute('href') || '/';
      window.location.assign(LOGIN_URL + '?redirect=' + encodeURIComponent(href));
    });
  }

  /* ── Check auth ── */
  async function checkAuth() {
    try {
      var res = await fetch(API_ME, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        headers: { 'Accept': 'application/json' },
      });
      if (res.status === 401) return { ok: false };
      var json = await res.json().catch(function () { return null; });
      if (!res.ok || !json || json.success !== true || !json.data) return { ok: false };
      return { ok: true, data: json.data };
    } catch (_) {
      return { ok: false };
    }
  }

  /* ── Boot ── */
  async function boot() {
    getEls();
    initScrollTop();
    initHeaderScroll();
    initActiveNav();
    initUserDropdown();
    initLogout();
    initBurger();
    initThemeToggle();

    applyLoggedOut();

    var auth = await checkAuth();
    if (auth.ok) applyLoggedIn(auth.data);

    initRequiresAuthGuard();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();