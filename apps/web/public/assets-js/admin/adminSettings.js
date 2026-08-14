// /assets-js/admin/adminSettings.js
'use strict';

const SettingsManager = (() => {
  // ====================================
  // 1. CONSTANTES & CONFIGURATION
  // ====================================
  
  const CONFIG = {
    API: {
      BASE: '/api/admin',
      SETTINGS: '/settings',
      ME: '/dashboard/me',
      CACHE: '/settings/cache/clear',
      DB: '/settings/database/optimize',
      PROFILE: '/settings/profile',
      PROFILE_PWD: '/settings/profile/password',
      SMTP_TEST: '/settings/smtp/test',
      SYSTEM_INFO: '/settings/system/info'
    },
    AUTH_KEY: 'cc_admin_auth',
    BANNER_CACHE_KEY: 'cc_banner_cache_v1',
    BANNER_REFRESH_KEY: 'cc_banner_refresh_v1',
    DEFAULTS: {
      maintenance: {
        enabled: false,
        message: 'Le site est en maintenance. Merci de revenir plus tard.'
      },
      banner: {
        enabled: false,
        level: 'info',
        message: ''
      },
      security: {
        session_ttl_minutes: 480,
        force_logout_at: null
      },
      uploads: {
        max_mb: 10,
        allowed_types: ['application/pdf', 'image/jpeg', 'image/png']
      },
      declarations: {
        default_year: new Date().getFullYear()
      },
      contact: {
        phone: '',
        email: '',
        address: ''
      },
      seo: {
        title_suffix: ' | ComptaClems',
        meta_description: 'Services comptables professionnels pour PME, travailleurs autonomes et particuliers. Déclarations fiscales, tenue de livres et conseil.',
        meta_keywords: 'comptabilité, fiscalité, PME, travailleur autonome, déclaration impôts'
      }
    },
    BANNER_LEVELS: {
      info: { label: 'Info', color: 'banner-info', icon: 'fa-circle-info', bg: 'bg-blue-600' },
      warning: { label: 'Alerte', color: 'banner-warning', icon: 'fa-triangle-exclamation', bg: 'bg-amber-500' },
      danger: { label: 'Urgent', color: 'banner-danger', icon: 'fa-circle-exclamation', bg: 'bg-red-600' }
    }
  };

  // ====================================
  // 2. STATE MANAGEMENT
  // ====================================
  
  const state = {
    isReadOnly: false,
    baselineStable: '',
    lastLoadedSettings: null,
    isSaving: false,
    isLoading: false,
    activeTab: 'tab-maint',
    currentUser: null
  };

  // ====================================
  // 3. ÉLÉMENTS DOM
  // ====================================
  
  const elements = {
    // Alertes & Toasts
    alertBox: document.getElementById('pageAlert'),
    toastHost: document.getElementById('toastHost'),
    
    // En-tête
    lastUpdate: document.getElementById('lastUpdate'),
    lastUpdateBy: document.getElementById('lastUpdateBy'),
    lastBackup: document.getElementById('lastBackup'),
    
    // Contrôles
    readOnlyBox: document.getElementById('readOnlyBox'),
    dirtyState: document.getElementById('dirtyState'),
    
    // Profil admin
    adminName: document.getElementById('adminName'),
    adminRole: document.getElementById('adminRole'),
    adminInitials: document.getElementById('adminInitials'),
    headerAdminName: document.getElementById('headerAdminName'),
    headerAdminRole: document.getElementById('headerAdminRole'),
    headerAdminInitials: document.getElementById('headerAdminInitials'),
    
    // Tabs
    tabs: Array.from(document.querySelectorAll('.tab-btn')),
    panels: Array.from(document.querySelectorAll('.tabPanel')),
    
    // Maintenance
    m_enabled: document.getElementById('m_enabled'),
    m_message: document.getElementById('m_message'),
    maintenancePreview: document.getElementById('maintenancePreview'),
    
    // Banner
    b_enabled: document.getElementById('b_enabled'),
    b_level: document.getElementById('b_level'),
    b_message: document.getElementById('b_message'),
    bannerPreview: document.getElementById('bannerPreview'),
    
    // Security
    s_ttl: document.getElementById('s_ttl'),
    s_force: document.getElementById('s_force'),
    securityPreview: document.getElementById('securityPreview'),
    sessionPreview: document.getElementById('sessionPreview'),
    
    // Uploads
    u_max: document.getElementById('u_max'),
    u_types: document.getElementById('u_types'),
    uploadMaxPreview: document.getElementById('uploadMaxPreview'),
    
    // Declarations
    d_year: document.getElementById('d_year'),
    
    // Contact
    c_phone: document.getElementById('c_phone'),
    c_email: document.getElementById('c_email'),
    c_address: document.getElementById('c_address'),
    
    // SEO
    seo_suffix: document.getElementById('seo_suffix'),
    seo_description: document.getElementById('seo_description'),
    seo_keywords: document.getElementById('seo_keywords'),
    
    // Actions
    btnReload: document.getElementById('btnReload'),
    btnSave: document.getElementById('btnSave'),
    btnExport: document.getElementById('btnExport'),
    btnImport: document.getElementById('btnImport'),
    btnDefaults: document.getElementById('btnDefaults'),
    importFile: document.getElementById('importFile'),
    
    // Avancé
    clearCacheBtn: document.getElementById('clearCacheBtn'),
    optimizeDbBtn: document.getElementById('optimizeDbBtn'),
    
    // Modal confirmation
    confirmModal: document.getElementById('confirmModal'),
    confirmTitle: document.getElementById('confirmTitle'),
    confirmSubtitle: document.getElementById('confirmSubtitle'),
    confirmMessage: document.getElementById('confirmMessage'),
    confirmAction: document.getElementById('confirmAction'),
    confirmIcon: document.getElementById('confirmIcon'),
    confirmButtonText: document.getElementById('confirmButtonText'),
    confirmBackdrop: document.getElementById('confirmBackdrop'),
    confirmCancel: document.getElementById('confirmCancel'),

    // Mon compte — Profil
    p_firstname: document.getElementById('p_firstname'),
    p_lastname: document.getElementById('p_lastname'),
    p_email: document.getElementById('p_email'),
    btnSaveProfile: document.getElementById('btnSaveProfile'),

    // Mon compte — Mot de passe
    p_old_pwd: document.getElementById('p_old_pwd'),
    p_new_pwd: document.getElementById('p_new_pwd'),
    p_confirm_pwd: document.getElementById('p_confirm_pwd'),
    btnChangePwd: document.getElementById('btnChangePwd'),
    pwdStrengthBar: document.getElementById('pwdStrengthBar'),
    pwdStrengthText: document.getElementById('pwdStrengthText'),

    // Avancé — SMTP
    btnTestSmtp: document.getElementById('btnTestSmtp'),
    smtpTestEmail: document.getElementById('smtpTestEmail'),

    // Avancé — Système
    systemInfoContainer: document.getElementById('systemInfoContainer')
  };

  // ====================================
  // 4. UTILITAIRES
  // ====================================
  
  /**
   * Échappe les caractères HTML (anti-XSS)
   */
  function escapeHtml(text) {
    if (!text && text !== 0) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Formate une date en français
   */
  function formatDate(dateString, options = {}) {
    if (!dateString) return '—';
    try {
      const date = new Date(dateString);
      if (Number.isNaN(date.getTime())) return '—';
      
      return new Intl.DateTimeFormat('fr-FR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        ...options
      }).format(date);
    } catch {
      return '—';
    }
  }

  /**
   * Affiche une notification toast
   */
  function showToast(message, type = 'info', duration = 5000) {
    if (!elements.toastHost) return;
    
    const icons = {
      success: 'fa-circle-check',
      error: 'fa-circle-exclamation',
      warning: 'fa-triangle-exclamation',
      info: 'fa-circle-info'
    };
    
    const colors = {
      success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
      error: 'bg-red-50 border-red-200 text-red-800',
      warning: 'bg-amber-50 border-amber-200 text-amber-800',
      info: 'bg-blue-50 border-blue-200 text-blue-800'
    };
    
    const toast = document.createElement('div');
    toast.className = `toast ${colors[type]} border rounded-2xl px-5 py-4 flex items-start gap-4 shadow-2xl animate-slideIn`;
    toast.innerHTML = `
      <i class="fas ${icons[type]} text-lg mt-0.5"></i>
      <div class="flex-1 text-sm font-medium">${escapeHtml(message)}</div>
      <button class="toast-close hover:opacity-70 transition">
        <i class="fas fa-times"></i>
      </button>
    `;
    
    toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());
    elements.toastHost.appendChild(toast);
    
    setTimeout(() => {
      if (toast.parentNode) {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
      }
    }, duration);
  }

  /**
   * Affiche une alerte dans la page
   */
  function showAlert(message, type = 'error') {
    if (!elements.alertBox) return;
    
    const styles = {
      success: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-800', icon: 'fa-circle-check' },
      error: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', icon: 'fa-circle-exclamation' },
      warning: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-800', icon: 'fa-triangle-exclamation' },
      info: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800', icon: 'fa-circle-info' }
    };
    
    const style = styles[type] || styles.info;
    
    elements.alertBox.innerHTML = `
      <div class="flex items-start gap-3 w-full">
        <i class="fas ${style.icon} text-lg mt-0.5"></i>
        <div class="flex-1 font-medium">${escapeHtml(message)}</div>
        <button class="alert-close text-slate-400 hover:text-slate-600 transition">
          <i class="fas fa-times"></i>
        </button>
      </div>
    `;
    
    elements.alertBox.className = `${style.bg} ${style.border} ${style.text} mb-8 rounded-2xl border px-5 py-4 text-sm flex items-start gap-3 animate-slideIn`;
    elements.alertBox.classList.remove('hidden');
    
    elements.alertBox.querySelector('.alert-close')?.addEventListener('click', () => {
      elements.alertBox.classList.add('hidden');
    });
    
    setTimeout(() => elements.alertBox.classList.add('hidden'), 5000);
  }

  function hideAlert() {
    elements.alertBox?.classList.add('hidden');
  }

  // ====================================
  // 5. AUTHENTIFICATION
  // ====================================
  
  function getAuth() {
    try {
      return JSON.parse(localStorage.getItem(CONFIG.AUTH_KEY) || '{}');
    } catch {
      return { token: null, admin: null };
    }
  }

  function getToken() {
    return getAuth()?.token || null;
  }

  function hardLogout() {
    localStorage.removeItem(CONFIG.AUTH_KEY);
    localStorage.removeItem('cc_admin_user');
    sessionStorage.clear();
    
    const redirect = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/admin/adminLogin.html?redirect=${redirect}&session=expired`;
  }

  async function api(path, opts = {}) {
    const token = getToken();
    if (!token) {
      showToast('Session expirée', 'error');
      hardLogout();
      throw new Error('Non authentifié');
    }

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {})
    };

    try {
      const res = await fetch(`${CONFIG.API.BASE}${path}`, { 
        ...opts, 
        headers 
      });

      if (res.status === 401 || res.status === 403) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) hardLogout();
        throw new Error(data?.error || `Accès refusé (${res.status})`);
      }

      const data = await res.json().catch(() => ({}));
      
      if (!res.ok) {
        throw new Error(data?.error || data?.message || `Erreur ${res.status}`);
      }

      return data;
    } catch (error) {
      if (error.message.includes('Failed to fetch')) {
        throw new Error('Impossible de contacter le serveur');
      }
      throw error;
    }
  }

  // ====================================
  // 6. CHARGEMENT ADMIN
  // ====================================
  
  async function loadAdminInfo() {
    try {
      const data = await api(CONFIG.API.ME).catch(() => ({ admin: getAuth()?.admin }));
      const admin = data?.admin || getAuth()?.admin;
      
      if (admin) {
        state.currentUser = admin;
        const isSuperAdmin = admin.role === 'superadmin';
        
        const fullName = `${admin.first_name || ''} ${admin.last_name || ''}`.trim() || admin.email || 'Administrateur';
        const firstName = admin.first_name || 'Admin';
        const initials = (admin.first_name?.[0] || '') + (admin.last_name?.[0] || '') || 'AD';
        
        // Mettre à jour les éléments du profil
        if (elements.adminName) elements.adminName.textContent = fullName;
        if (elements.headerAdminName) elements.headerAdminName.textContent = firstName;
        if (elements.adminInitials) elements.adminInitials.textContent = initials;
        if (elements.headerAdminInitials) elements.headerAdminInitials.textContent = initials;
        
        const roleDisplay = isSuperAdmin ? 'Super Admin' : admin.role === 'admin' ? 'Admin' : 'Support';
        if (elements.adminRole) elements.adminRole.textContent = roleDisplay;
        if (elements.headerAdminRole) {
          elements.headerAdminRole.textContent = isSuperAdmin ? 'Super Administrateur' : 
                                                admin.role === 'admin' ? 'Administrateur' : 'Support';
        }
        
        setReadOnly(!isSuperAdmin);
      }
    } catch (error) {
      console.error('Erreur chargement admin:', error);
    }
  }

  // ====================================
  // 7. MODE LECTURE SEULE
  // ====================================
  
  function setReadOnly(isReadOnly) {
    state.isReadOnly = isReadOnly;
    
    if (elements.readOnlyBox) {
      elements.readOnlyBox.classList.toggle('hidden', !isReadOnly);
      elements.readOnlyBox.classList.toggle('flex', isReadOnly);
    }
    
    // Désactiver tous les champs de formulaire
    const formElements = document.querySelectorAll('input:not([type="file"]), textarea, select, button:not(#adminLogoutBtn):not(.tab-btn)');
    formElements.forEach((el) => {
      if (el.id === 'btnReload' || el.id === 'btnExport' || el.id === 'btnImport' || el.id === 'btnDefaults') {
        return; 
      }
      
      if (el.tagName === 'BUTTON') {
        el.disabled = isReadOnly;
        el.classList.toggle('opacity-50', isReadOnly);
        el.classList.toggle('cursor-not-allowed', isReadOnly);
      } else {
        el.disabled = isReadOnly;
        el.classList.toggle('opacity-60', isReadOnly);
      }
    });
    
    // Cacher le bouton sauvegarder en lecture seule
    if (elements.btnSave) {
      elements.btnSave.classList.toggle('hidden', isReadOnly);
    }
  }

  // ====================================
  // 8. GESTION DES TABS
  // ====================================
  
  function getTabFromUrl() {
    const hash = window.location.hash;
    const match = hash.match(/tab=([a-z0-9_-]+)/i);
    if (!match) return 'tab-maint';
    
    const tabId = `tab-${match[1].replace(/^tab-/, '')}`;
    return elements.panels.some(p => p.id === tabId) ? tabId : 'tab-maint';
  }

  function setActiveTab(tabId) {
    state.activeTab = tabId;
    
    // Mettre à jour les boutons
    document.querySelectorAll('.tab-btn').forEach(btn => {
      const isActive = btn.dataset.tab === tabId;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      
      if (isActive) {
        btn.classList.remove('bg-white', 'text-slate-900', 'border-slate-200');
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
        btn.classList.add('bg-white', 'text-slate-900', 'border-slate-200');
      }
    });
    
    // Mettre à jour les panneaux
    document.querySelectorAll('.tabPanel').forEach(panel => {
      panel.classList.toggle('hidden', panel.id !== tabId);
    });
    
    // Mettre à jour l'URL
    const shortName = tabId.replace(/^tab-/, '');
    window.location.hash = `tab=${encodeURIComponent(shortName)}`;
  }

  // ====================================
  // 9. PRÉVISUALISATIONS
  // ====================================
  
  function renderBannerPreview() {
    if (!elements.bannerPreview) return;
    
    const enabled = elements.b_enabled?.checked || false;
    const level = elements.b_level?.value || 'info';
    const message = elements.b_message?.value?.trim() || '';
    
    if (!enabled || !message) {
      elements.bannerPreview.classList.add('hidden');
      elements.bannerPreview.classList.remove('flex');
      return;
    }

    const config = CONFIG.BANNER_LEVELS[level] || CONFIG.BANNER_LEVELS.info;
    
    elements.bannerPreview.className = `${config.bg} text-white text-sm px-5 py-4 text-center rounded-xl flex items-start gap-3`;
    elements.bannerPreview.innerHTML = `
      <i class="fas ${config.icon} mt-0.5"></i>
      <span class="flex-1">${escapeHtml(message)}</span>
    `;
    elements.bannerPreview.classList.remove('hidden');
  }

  function renderMaintenancePreview() {
    if (!elements.maintenancePreview) return;
    
    const enabled = elements.m_enabled?.checked || false;
    const message = elements.m_message?.value?.trim() || CONFIG.DEFAULTS.maintenance.message;
    
    if (!enabled) {
      elements.maintenancePreview.classList.add('hidden');
      elements.maintenancePreview.classList.remove('flex');
      return;
    }
    
    elements.maintenancePreview.className = 'rounded-xl border-2 border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900 flex items-start gap-3';
    elements.maintenancePreview.innerHTML = `
      <i class="fas fa-tools mt-0.5"></i>
      <span class="flex-1">${escapeHtml(message)}</span>
    `;
    elements.maintenancePreview.classList.remove('hidden');
  }

  function renderSecurityPreview() {
    if (!elements.securityPreview || !elements.sessionPreview) return;
    
    const ttl = parseInt(elements.s_ttl?.value || '', 10);
    const force = elements.s_force?.value || '';
    
    const ttlValid = !isNaN(ttl) && ttl >= 15 && ttl <= 10080;
    const ttlDisplay = ttlValid ? ttl : 480;
    
    // Mettre à jour le préview de la durée
    if (elements.sessionPreview) {
      const hours = Math.floor(ttlDisplay / 60);
      const minutes = ttlDisplay % 60;
      elements.sessionPreview.textContent = hours > 0 
        ? `${hours}h${minutes > 0 ? minutes + 'min' : ''}`
        : `${minutes}min`;
    }
    
    // Mettre à jour le panneau de prévisualisation
    const forceDate = force ? new Date(force) : null;
    const forceValid = forceDate && !isNaN(forceDate.getTime());
    
    elements.securityPreview.innerHTML = `
      <div class="flex flex-wrap items-center gap-4">
        <div class="flex items-center gap-2">
          <i class="fas fa-hourglass-half text-slate-400"></i>
          <span class="text-slate-600">Session expire après:</span>
          <span class="font-semibold text-slate-900">${ttlValid ? ttlDisplay : '480'} min</span>
          <span class="text-xs text-slate-500">(${elements.sessionPreview.textContent})</span>
        </div>
        <span class="text-slate-300 hidden md:inline">|</span>
        <div class="flex items-center gap-2">
          <i class="fas fa-calendar-xmark text-slate-400"></i>
          <span class="text-slate-600">Déconnexion forcée:</span>
          <span class="font-semibold text-slate-900">
            ${forceValid ? formatDate(force) : 'Aucune'}
          </span>
        </div>
      </div>
    `;
  }

  function renderUploadPreview() {
    if (!elements.uploadMaxPreview) return;
    
    const maxMb = parseInt(elements.u_max?.value || '', 10);
    const maxValid = !isNaN(maxMb) && maxMb >= 1 && maxMb <= 100;
    elements.uploadMaxPreview.textContent = `${maxValid ? maxMb : 10} MB`;
  }

  // ====================================
  // 10. VALIDATION & UTILITAIRES
  // ====================================
  
  function isValidEmail(email) {
    if (!email) return true;
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email.trim());
  }

  function isValidIsoDate(dateStr) {
    if (!dateStr) return true;
    try {
      const date = new Date(dateStr);
      return !isNaN(date.getTime()) && dateStr.includes('T');
    } catch {
      return false;
    }
  }

  function cleanMimeList(raw) {
    const lines = String(raw || '')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && /^[\w.+-]+\/[\w.+-]+$/.test(l));
    
    const unique = [...new Set(lines.map(l => l.toLowerCase()))];
    return unique.slice(0, 50); 
  }

  function stableStringify(obj) {
    const sortKeys = (x) => {
      if (Array.isArray(x)) return x.map(sortKeys);
      if (x && typeof x === 'object') {
        return Object.keys(x)
          .sort()
          .reduce((acc, key) => {
            acc[key] = sortKeys(x[key]);
            return acc;
          }, {});
      }
      return x;
    };
    return JSON.stringify(sortKeys(obj));
  }

  // ====================================
  // 11. LECTURE/ÉCRITURE FORMULAIRE
  // ====================================
  
  function fillForm(settings) {
    const s = settings || {};
    
    // Maintenance
    if (elements.m_enabled) elements.m_enabled.checked = !!s.maintenance?.enabled;
    if (elements.m_message) {
      elements.m_message.value = s.maintenance?.message ?? CONFIG.DEFAULTS.maintenance.message;
    }
    
    // Banner
    if (elements.b_enabled) elements.b_enabled.checked = !!s.banner?.enabled;
    if (elements.b_level) elements.b_level.value = s.banner?.level ?? CONFIG.DEFAULTS.banner.level;
    if (elements.b_message) elements.b_message.value = s.banner?.message ?? CONFIG.DEFAULTS.banner.message;
    
    // Security
    if (elements.s_ttl) {
      elements.s_ttl.value = s.security?.session_ttl_minutes ?? CONFIG.DEFAULTS.security.session_ttl_minutes;
    }
    if (elements.s_force) {
      elements.s_force.value = s.security?.force_logout_at ? 
        s.security.force_logout_at.slice(0, 16) : '';
    }
    
    // Uploads
    if (elements.u_max) {
      elements.u_max.value = s.uploads?.max_mb ?? CONFIG.DEFAULTS.uploads.max_mb;
    }
    if (elements.u_types) {
      const types = Array.isArray(s.uploads?.allowed_types) 
        ? s.uploads.allowed_types 
        : CONFIG.DEFAULTS.uploads.allowed_types;
      elements.u_types.value = types.join('\n');
    }
    
    // Declarations
    if (elements.d_year) {
      elements.d_year.value = s.declarations?.default_year ?? CONFIG.DEFAULTS.declarations.default_year;
    }
    
    // Contact
    if (elements.c_phone) elements.c_phone.value = s.contact?.phone ?? CONFIG.DEFAULTS.contact.phone;
    if (elements.c_email) elements.c_email.value = s.contact?.email ?? CONFIG.DEFAULTS.contact.email;
    if (elements.c_address) elements.c_address.value = s.contact?.address ?? CONFIG.DEFAULTS.contact.address;
    
    // SEO
    if (elements.seo_suffix) {
      elements.seo_suffix.value = s.seo?.title_suffix ?? CONFIG.DEFAULTS.seo.title_suffix;
    }
    if (elements.seo_description) {
      elements.seo_description.value = s.seo?.meta_description ?? CONFIG.DEFAULTS.seo.meta_description;
    }
    if (elements.seo_keywords) {
      elements.seo_keywords.value = s.seo?.meta_keywords ?? CONFIG.DEFAULTS.seo.meta_keywords;
    }
    
    // Rafraîchir les prévisualisations
    renderBannerPreview();
    renderMaintenancePreview();
    renderSecurityPreview();
    renderUploadPreview();
  }

  function readForm() {
    return {
      maintenance: {
        enabled: !!elements.m_enabled?.checked,
        message: elements.m_message?.value?.trim() || CONFIG.DEFAULTS.maintenance.message
      },
      banner: {
        enabled: !!elements.b_enabled?.checked,
        level: elements.b_level?.value || CONFIG.DEFAULTS.banner.level,
        message: elements.b_message?.value?.trim() || ''
      },
      security: {
        session_ttl_minutes: parseInt(elements.s_ttl?.value || CONFIG.DEFAULTS.security.session_ttl_minutes, 10),
        force_logout_at: (() => {
          const v = elements.s_force?.value?.trim();
          if (!v) return null;
          try { return new Date(v).toISOString(); } catch { return null; }
        })()
      },
      uploads: {
        max_mb: parseInt(elements.u_max?.value || CONFIG.DEFAULTS.uploads.max_mb, 10),
        allowed_types: cleanMimeList(elements.u_types?.value)
      },
      declarations: {
        default_year: parseInt(elements.d_year?.value || CONFIG.DEFAULTS.declarations.default_year, 10)
      },
      contact: {
        phone: elements.c_phone?.value?.trim() || '',
        email: elements.c_email?.value?.trim() || '',
        address: elements.c_address?.value?.trim() || ''
      },
      seo: {
        title_suffix: elements.seo_suffix?.value?.trim() || CONFIG.DEFAULTS.seo.title_suffix,
        meta_description: elements.seo_description?.value?.trim() || CONFIG.DEFAULTS.seo.meta_description,
        meta_keywords: elements.seo_keywords?.value?.trim() || CONFIG.DEFAULTS.seo.meta_keywords
      }
    };
  }

  // ====================================
  // 12. GESTION DES MODIFICATIONS
  // ====================================
  
  function setDirtyState(isDirty) {
    if (!elements.dirtyState) return;
    
    const dot = elements.dirtyState.querySelector('.dirty-dot');
    const text = elements.dirtyState.querySelector('span:last-child');
    
    if (dot) {
      dot.className = `dirty-dot w-3 h-3 rounded-full ${isDirty ? 'bg-amber-500 active' : 'bg-slate-300'}`;
    }
    
    if (text) {
      text.textContent = isDirty ? 'Modifications en attente' : 'Aucune modification';
    }
    
    if (elements.btnSave) {
      elements.btnSave.disabled = !isDirty || state.isReadOnly;
      elements.btnSave.classList.toggle('opacity-50', !isDirty || state.isReadOnly);
      elements.btnSave.classList.toggle('cursor-not-allowed', !isDirty || state.isReadOnly);
    }
  }

  function computeDirty() {
    const current = stableStringify(readForm());
    setDirtyState(current !== state.baselineStable);
  }

  function validateBeforeSave(payload) {
    const errors = [];
    
    // Validation sécurité
    const ttl = payload.security.session_ttl_minutes;
    if (!Number.isFinite(ttl) || ttl < 15 || ttl > 10080) {
      errors.push('La durée de session doit être entre 15 et 10080 minutes.');
    }
    
    if (payload.security.force_logout_at && !isValidIsoDate(payload.security.force_logout_at)) {
      errors.push('Le format de la date de déconnexion forcée est invalide.');
    }
    
    // Validation uploads
    const maxMb = payload.uploads.max_mb;
    if (!Number.isFinite(maxMb) || maxMb < 1 || maxMb > 100) {
      errors.push('La taille maximale des fichiers doit être entre 1 et 100 Mo.');
    }
    
    if (payload.uploads.allowed_types.length === 0) {
      errors.push('Au moins un type MIME doit être autorisé.');
    }
    
    // Validation déclarations
    const year = payload.declarations.default_year;
    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      errors.push("L'année fiscale doit être entre 2000 et 2100.");
    }
    
    // Validation contact
    if (payload.contact.email && !isValidEmail(payload.contact.email)) {
      errors.push("L'email de contact n'est pas valide.");
    }
    
    // Validation bannière
    if (payload.banner.enabled && !payload.banner.message) {
      errors.push('La bannière est activée mais le message est vide.');
    }
    
    return errors;
  }

  // ====================================
  // 13. CHARGEMENT / SAUVEGARDE
  // ====================================
  
  async function loadSettings() {
    if (state.isLoading) return;
    
    state.isLoading = true;
    hideAlert();
    
    try {
      const data = await api(CONFIG.API.SETTINGS);
      const settings = data?.settings || {};
      
      state.lastLoadedSettings = settings;
      
      fillForm(settings);
      
      // Mettre à jour la baseline
      state.baselineStable = stableStringify(readForm());
      computeDirty();
      
      // Mettre à jour les métadonnées
      if (elements.lastUpdate) {
        elements.lastUpdate.textContent = data?.updated_at 
          ? formatDate(data.updated_at) 
          : '—';
      }
      
      if (elements.lastUpdateBy) {
        elements.lastUpdateBy.textContent = data?.updated_by_name
          ? data.updated_by_name.trim()
          : data?.updated_by_admin_id
            ? `#${data.updated_by_admin_id}`
            : '—';
      }

      if (elements.lastBackup) {
        elements.lastBackup.textContent = formatDate(new Date());
      }
      
      showToast('Paramètres chargés avec succès', 'success', 2000);
      
    } catch (error) {
      console.error('Erreur chargement settings:', error);
      showAlert(error.message, 'error');
      showToast(error.message, 'error');
    } finally {
      state.isLoading = false;
    }
  }

  async function saveSettings() {
    if (state.isSaving || state.isReadOnly) return;
    
    const payload = readForm();
    const errors = validateBeforeSave(payload);
    
    if (errors.length > 0) {
      showAlert(errors.join(' '), 'warning');
      showToast('Veuillez corriger les erreurs avant de sauvegarder.', 'warning');
      return;
    }
    
    openConfirmModal({
      title: 'Enregistrer les paramètres',
      subtitle: 'Les modifications seront appliquées immédiatement',
      message: 'Voulez-vous sauvegarder la configuration actuelle ?',
      confirmText: 'Enregistrer',
      confirmIcon: 'fa-save',
      confirmColor: 'blue',
      onConfirm: async () => {
        try {
          state.isSaving = true;
          if (elements.btnSave) {
            elements.btnSave.disabled = true;
            elements.btnSave.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Enregistrement...';
          }
          
          const data = await api(CONFIG.API.SETTINGS, {
            method: 'PUT',
            body: JSON.stringify(payload)
          });
          
          // Mettre à jour la baseline
          state.baselineStable = stableStringify(readForm());
          computeDirty();
          
          // Mettre à jour les métadonnées
          if (elements.lastUpdate) {
            elements.lastUpdate.textContent = data?.updated_at 
              ? formatDate(data.updated_at) 
              : formatDate(new Date());
          }
          
          if (elements.lastUpdateBy) {
            elements.lastUpdateBy.textContent = data?.updated_by_name
              ? data.updated_by_name.trim()
              : data?.updated_by_admin_id
                ? `#${data.updated_by_admin_id}`
                : '—';
          }

          // Invalider le cache de la bannière
          invalidateBannerCache();
          
          showAlert('Paramètres enregistrés avec succès', 'success');
          showToast('Configuration sauvegardée', 'success');
          
        } catch (error) {
          console.error('Erreur sauvegarde settings:', error);
          
          if (error.message.includes('403')) {
            setReadOnly(true);
            showAlert('Action non autorisée. Superadmin requis.', 'warning');
          } else {
            showAlert(error.message, 'error');
            showToast(error.message, 'error');
          }
        } finally {
          state.isSaving = false;
          if (elements.btnSave) {
            elements.btnSave.disabled = false;
            elements.btnSave.innerHTML = '<i class="fas fa-save mr-2"></i>Enregistrer';
          }
        }
      }
    });
  }

  function invalidateBannerCache() {
    try {
      localStorage.removeItem(CONFIG.BANNER_CACHE_KEY);
      localStorage.setItem(CONFIG.BANNER_REFRESH_KEY, String(Date.now()));
    } catch (e) {
      console.error('Erreur invalidation cache:', e);
    }
  }

  // ====================================
  // 14. ACTIONS SUR LES PARAMÈTRES
  // ====================================
  
  function restoreDefaults() {
    openConfirmModal({
      title: 'Restaurer les valeurs par défaut',
      subtitle: 'Cette action peut être annulée',
      message: 'Voulez-vous restaurer tous les paramètres par défaut ? Les modifications non enregistrées seront perdues.',
      confirmText: 'Restaurer',
      confirmIcon: 'fa-undo-alt',
      confirmColor: 'amber',
      onConfirm: () => {
        fillForm(CONFIG.DEFAULTS);
        computeDirty();
        showToast('Valeurs par défaut appliquées', 'info', 3000);
      }
    });
  }

  function exportSettings() {
    const payload = readForm();
    const filename = `comptaclems-settings-${new Date().toISOString().slice(0, 10)}.json`;
    
    try {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      
      showToast('Configuration exportée avec succès', 'success', 3000);
    } catch (error) {
      showToast("Erreur lors de l'export", 'error');
    }
  }

  async function importSettings(file) {
    if (!file) return;
    
    try {
      const text = await file.text();
      const imported = JSON.parse(text);
      
      // Valider la structure
      if (!imported.maintenance || !imported.security || !imported.uploads) {
        throw new Error('Format de fichier invalide');
      }
      
      fillForm(imported);
      computeDirty();
      
      showToast('Configuration importée avec succès', 'success', 3000);
      
    } catch (error) {
      showAlert('Fichier de configuration invalide', 'error');
      showToast("Erreur lors de l'import", 'error');
    } finally {
      if (elements.importFile) {
        elements.importFile.value = '';
      }
    }
  }

  // ====================================
  // 15. ACTIONS AVANCÉES
  // ====================================
  
  async function clearCache() {
    openConfirmModal({
      title: 'Vider le cache',
      subtitle: 'Cette action est temporaire',
      message: 'Voulez-vous vider tous les caches de l\'application ? Les performances pourraient être légèrement dégradées le temps du rechargement.',
      confirmText: 'Vider',
      confirmIcon: 'fa-broom',
      confirmColor: 'blue',
      onConfirm: async () => {
        try {
          await api(CONFIG.API.CACHE, { method: 'POST' });
          showToast('Cache vidé avec succès', 'success');
        } catch (error) {
          showToast(error.message, 'error');
        }
      }
    });
  }

  async function optimizeDatabase() {
    openConfirmModal({
      title: 'Optimiser la base de données',
      subtitle: 'Cette action peut prendre quelques secondes',
      message: 'Voulez-vous optimiser les tables de la base de données ? Cette opération est sans risque.',
      confirmText: 'Optimiser',
      confirmIcon: 'fa-database',
      confirmColor: 'emerald',
      onConfirm: async () => {
        try {
          await api(CONFIG.API.DB, { method: 'POST' });
          showToast('Base de données optimisée avec succès', 'success');
        } catch (error) {
          showToast(error.message, 'error');
        }
      }
    });
  }

  // ====================================
  // 16. MODAL DE CONFIRMATION
  // ====================================
  
  function openConfirmModal(options) {
    const {
      title = 'Confirmer l\'action',
      subtitle = 'Cette action est irréversible',
      message = 'Voulez-vous continuer ?',
      confirmText = 'Confirmer',
      confirmIcon = 'fa-check',
      confirmColor = 'red',
      onConfirm
    } = options;
    
    if (elements.confirmTitle) elements.confirmTitle.textContent = title;
    if (elements.confirmSubtitle) elements.confirmSubtitle.textContent = subtitle;
    if (elements.confirmMessage) elements.confirmMessage.textContent = message;
    if (elements.confirmButtonText) elements.confirmButtonText.textContent = confirmText;
    if (elements.confirmIcon) {
      elements.confirmIcon.className = `fas ${confirmIcon} mr-2`;
    }
    
    // Changer la couleur du bouton (Bug 3 : ajout couleur 'emerald')
    if (elements.confirmAction) {
      elements.confirmAction.className = `px-5 py-2.5 bg-gradient-to-r ${
        confirmColor === 'red'
          ? 'from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 shadow-lg shadow-red-500/30'
          : confirmColor === 'amber'
            ? 'from-amber-600 to-amber-500 hover:from-amber-700 hover:to-amber-600 shadow-lg shadow-amber-500/30'
            : confirmColor === 'emerald'
              ? 'from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 shadow-lg shadow-emerald-500/30'
              : 'from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 shadow-lg shadow-blue-500/30'
      } text-white rounded-xl font-medium transition flex items-center justify-center`;
    }

    // Stocker la fonction de confirmation
    window._confirmCallback = onConfirm;

    // Afficher la modal (Bug 1 : ajouter flex pour le centrage)
    if (elements.confirmModal) {
      elements.confirmModal.classList.remove('hidden');
      elements.confirmModal.classList.add('flex');
      document.body.style.overflow = 'hidden';
    }
  }

  function closeConfirmModal() {
    if (elements.confirmModal) {
      elements.confirmModal.classList.add('hidden');
      elements.confirmModal.classList.remove('flex');
      document.body.style.overflow = '';
    }
    window._confirmCallback = null;
  }

  // ====================================
  // 17. MON COMPTE — PROFIL & MOT DE PASSE
  // ====================================

  function fillProfileForm(admin) {
    if (!admin) return;
    if (elements.p_firstname) elements.p_firstname.value = admin.first_name || '';
    if (elements.p_lastname) elements.p_lastname.value = admin.last_name || '';
    if (elements.p_email) elements.p_email.value = admin.email || '';

    // Afficher le statut 2FA
    const twoFaStatus = document.getElementById('twoFaStatus');
    if (twoFaStatus) {
      const enabled = admin.totp_enabled || false;
      twoFaStatus.innerHTML = enabled
        ? '<span class="inline-flex items-center gap-1.5 text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full text-xs font-semibold"><i class="fas fa-check-circle"></i> Activé</span>'
        : '<span class="inline-flex items-center gap-1.5 text-slate-500 bg-slate-100 border border-slate-200 px-3 py-1 rounded-full text-xs font-semibold"><i class="fas fa-times-circle"></i> Désactivé</span>';
    }
  }

  async function saveProfile() {
    const firstName = elements.p_firstname?.value?.trim();
    const lastName = elements.p_lastname?.value?.trim();
    const email = elements.p_email?.value?.trim();

    if (!firstName || !lastName) {
      showToast('Prénom et nom sont requis.', 'warning');
      return;
    }
    if (!email || !isValidEmail(email)) {
      showToast('Adresse e-mail invalide.', 'warning');
      return;
    }

    try {
      if (elements.btnSaveProfile) {
        elements.btnSaveProfile.disabled = true;
        elements.btnSaveProfile.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Enregistrement...';
      }

      const data = await api(CONFIG.API.PROFILE, {
        method: 'PUT',
        body: JSON.stringify({ first_name: firstName, last_name: lastName, email })
      });

      // Mettre à jour le state local
      if (state.currentUser) {
        state.currentUser.first_name = firstName;
        state.currentUser.last_name = lastName;
        state.currentUser.email = email;
      }

      // Rafraîchir l'affichage du sidebar/header
      const initials = (firstName[0] + (lastName[0] || '')).toUpperCase();
      const fullName = `${firstName} ${lastName}`.trim();
      if (elements.adminName) elements.adminName.textContent = fullName;
      if (elements.headerAdminName) elements.headerAdminName.textContent = firstName;
      if (elements.adminInitials) elements.adminInitials.textContent = initials;
      if (elements.headerAdminInitials) elements.headerAdminInitials.textContent = initials;

      showToast('Profil mis à jour avec succès', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      if (elements.btnSaveProfile) {
        elements.btnSaveProfile.disabled = false;
        elements.btnSaveProfile.innerHTML = '<i class="fas fa-save mr-2"></i>Enregistrer le profil';
      }
    }
  }

  function checkPasswordStrength(pwd) {
    if (!pwd) return { score: 0, label: '', color: '' };
    let score = 0;
    if (pwd.length >= 8) score++;
    if (pwd.length >= 12) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;

    const levels = [
      { label: '', color: 'bg-slate-200' },
      { label: 'Très faible', color: 'bg-red-500' },
      { label: 'Faible', color: 'bg-orange-500' },
      { label: 'Moyen', color: 'bg-amber-500' },
      { label: 'Fort', color: 'bg-emerald-500' },
      { label: 'Très fort', color: 'bg-emerald-600' }
    ];
    return { score, ...levels[score] };
  }

  async function changePassword() {
    const oldPwd = elements.p_old_pwd?.value?.trim();
    const newPwd = elements.p_new_pwd?.value?.trim();
    const confirmPwd = elements.p_confirm_pwd?.value?.trim();

    if (!oldPwd) { showToast('Mot de passe actuel requis.', 'warning'); return; }
    if (!newPwd || newPwd.length < 10) { showToast('Le nouveau mot de passe doit contenir au moins 10 caractères.', 'warning'); return; }
    if (newPwd !== confirmPwd) { showToast('Les deux mots de passe ne correspondent pas.', 'error'); return; }

    const strength = checkPasswordStrength(newPwd);
    if (strength.score < 3) {
      showToast('Mot de passe trop faible. Ajoutez des majuscules, chiffres et caractères spéciaux.', 'warning');
      return;
    }

    try {
      if (elements.btnChangePwd) {
        elements.btnChangePwd.disabled = true;
        elements.btnChangePwd.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Modification...';
      }

      await api(CONFIG.API.PROFILE_PWD, {
        method: 'PUT',
        body: JSON.stringify({ current_password: oldPwd, new_password: newPwd })
      });

      // Vider les champs
      if (elements.p_old_pwd) elements.p_old_pwd.value = '';
      if (elements.p_new_pwd) elements.p_new_pwd.value = '';
      if (elements.p_confirm_pwd) elements.p_confirm_pwd.value = '';
      if (elements.pwdStrengthBar) {
        elements.pwdStrengthBar.style.width = '0%';
        elements.pwdStrengthBar.className = 'h-full rounded-full transition-all duration-300 bg-slate-200';
      }
      if (elements.pwdStrengthText) elements.pwdStrengthText.textContent = '';

      showToast('Mot de passe modifié avec succès', 'success');
      showAlert('Mot de passe mis à jour. Reconnectez-vous si nécessaire.', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      if (elements.btnChangePwd) {
        elements.btnChangePwd.disabled = false;
        elements.btnChangePwd.innerHTML = '<i class="fas fa-key mr-2"></i>Changer le mot de passe';
      }
    }
  }

  // ====================================
  // 18. AVANCÉ — TEST SMTP & SYSTÈME
  // ====================================

  async function testSmtp() {
    const email = elements.smtpTestEmail?.value?.trim();
    if (!email || !isValidEmail(email)) {
      showToast("Saisissez une adresse e-mail valide pour le test.", 'warning');
      return;
    }

    try {
      if (elements.btnTestSmtp) {
        elements.btnTestSmtp.disabled = true;
        elements.btnTestSmtp.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Envoi...';
      }

      await api(CONFIG.API.SMTP_TEST, {
        method: 'POST',
        body: JSON.stringify({ to: email })
      });

      showToast(`E-mail de test envoyé à ${email}`, 'success');
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      if (elements.btnTestSmtp) {
        elements.btnTestSmtp.disabled = false;
        elements.btnTestSmtp.innerHTML = '<i class="fas fa-paper-plane mr-2"></i>Envoyer test';
      }
    }
  }

  async function loadSystemInfo() {
    if (!elements.systemInfoContainer) return;

    try {
      elements.systemInfoContainer.innerHTML = `
        <div class="flex items-center justify-center py-6 text-slate-400">
          <i class="fas fa-spinner fa-spin mr-2"></i>
          Chargement des informations système...
        </div>`;

      const data = await api(CONFIG.API.SYSTEM_INFO);

      const statusDot = (ok) => ok
        ? '<span class="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>'
        : '<span class="w-2.5 h-2.5 rounded-full bg-red-500 inline-block"></span>';

      elements.systemInfoContainer.innerHTML = `
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="bg-slate-50 rounded-xl p-4 border border-slate-200">
            <p class="text-xs text-slate-500 uppercase tracking-wider mb-1">Node.js</p>
            <p class="font-semibold text-slate-900 text-sm">${escapeHtml(data.node_version || '—')}</p>
          </div>
          <div class="bg-slate-50 rounded-xl p-4 border border-slate-200">
            <p class="text-xs text-slate-500 uppercase tracking-wider mb-1">Base de données</p>
            <div class="flex items-center gap-2">
              ${statusDot(data.db_ok)}
              <p class="font-semibold text-slate-900 text-sm">${data.db_ok ? 'Connectée' : 'Erreur'}</p>
            </div>
            ${data.db_version ? `<p class="text-xs text-slate-500 mt-1">${escapeHtml(data.db_version)}</p>` : ''}
          </div>
          <div class="bg-slate-50 rounded-xl p-4 border border-slate-200">
            <p class="text-xs text-slate-500 uppercase tracking-wider mb-1">Uptime serveur</p>
            <p class="font-semibold text-slate-900 text-sm">${escapeHtml(data.uptime || '—')}</p>
          </div>
          <div class="bg-slate-50 rounded-xl p-4 border border-slate-200">
            <p class="text-xs text-slate-500 uppercase tracking-wider mb-1">Mémoire</p>
            <p class="font-semibold text-slate-900 text-sm">${escapeHtml(data.memory || '—')}</p>
          </div>
        </div>
        <div class="mt-4 text-right">
          <button id="btnRefreshSysInfo" class="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1 ml-auto transition">
            <i class="fas fa-sync-alt text-xs"></i> Actualiser
          </button>
        </div>`;

      document.getElementById('btnRefreshSysInfo')?.addEventListener('click', loadSystemInfo);

    } catch (error) {
      elements.systemInfoContainer.innerHTML = `
        <div class="text-sm text-red-600 flex items-center gap-2">
          <i class="fas fa-exclamation-circle"></i>
          Impossible de charger les informations système.
        </div>`;
    }
  }

  // ====================================
  // 19. INITIALISATION DES ÉVÉNEMENTS
  // ====================================
  
  function initEventListeners() {
    // ========== TABS ==========
    elements.tabs.forEach(btn => {
      btn.addEventListener('click', () => {
        setActiveTab(btn.dataset.tab);
      });
    });
    
    window.addEventListener('hashchange', () => {
      setActiveTab(getTabFromUrl());
    });
    
    // ========== ÉCOUTE DES MODIFICATIONS ==========
    const watchFields = [
      elements.m_enabled, elements.m_message,
      elements.b_enabled, elements.b_level, elements.b_message,
      elements.s_ttl, elements.s_force,
      elements.u_max, elements.u_types,
      elements.d_year,
      elements.c_phone, elements.c_email, elements.c_address,
      elements.seo_suffix, elements.seo_description, elements.seo_keywords
    ].filter(Boolean);
    
    watchFields.forEach(field => {
      field.addEventListener('input', () => {
        renderBannerPreview();
        renderMaintenancePreview();
        renderSecurityPreview();
        renderUploadPreview();
        computeDirty();
      });
      
      field.addEventListener('change', () => {
        renderBannerPreview();
        renderMaintenancePreview();
        renderSecurityPreview();
        renderUploadPreview();
        computeDirty();
      });
    });
    
    // ========== BOUTONS D'ACTION ==========
    elements.btnReload?.addEventListener('click', async () => {
      await loadSettings();
      showToast('Configuration rechargée', 'success', 2000);
    });
    
    elements.btnSave?.addEventListener('click', saveSettings);
    
    elements.btnDefaults?.addEventListener('click', restoreDefaults);
    
    elements.btnExport?.addEventListener('click', exportSettings);
    
    elements.btnImport?.addEventListener('click', () => {
      elements.importFile?.click();
    });
    
    elements.importFile?.addEventListener('change', (e) => {
      importSettings(e.target.files?.[0]);
    });
    
    // ========== ACTIONS AVANCÉES ==========
    elements.clearCacheBtn?.addEventListener('click', clearCache);
    elements.optimizeDbBtn?.addEventListener('click', optimizeDatabase);
    elements.btnTestSmtp?.addEventListener('click', testSmtp);

    // ========== MON COMPTE ==========
    elements.btnSaveProfile?.addEventListener('click', saveProfile);
    elements.btnChangePwd?.addEventListener('click', changePassword);

    // Force de mot de passe en temps réel
    elements.p_new_pwd?.addEventListener('input', () => {
      const pwd = elements.p_new_pwd.value;
      const strength = checkPasswordStrength(pwd);
      if (elements.pwdStrengthBar) {
        const widthPct = pwd ? Math.max(10, (strength.score / 5) * 100) : 0;
        elements.pwdStrengthBar.style.width = `${widthPct}%`;
        elements.pwdStrengthBar.className = `h-full rounded-full transition-all duration-300 ${strength.color}`;
      }
      if (elements.pwdStrengthText) {
        elements.pwdStrengthText.textContent = strength.label || '';
      }
    });
    
    // ========== MODAL CONFIRMATION ==========
    elements.confirmAction?.addEventListener('click', async () => {
      if (typeof window._confirmCallback === 'function') {
        await window._confirmCallback();
      }
      closeConfirmModal();
    });
    
    elements.confirmCancel?.addEventListener('click', closeConfirmModal);
    elements.confirmBackdrop?.addEventListener('click', closeConfirmModal);
    
    // ========== TOUCHE ÉCHAP ==========
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!elements.confirmModal?.classList.contains('hidden')) {
          closeConfirmModal();
        }
      }
    });
    
    // ========== AVERTISSEMENT AVANT FERMETURE ==========
    window.addEventListener('beforeunload', (e) => {
      const current = stableStringify(readForm());
      if (current !== state.baselineStable && !state.isReadOnly) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }

  // ====================================
  // 18. INITIALISATION
  // ====================================
  
  async function init() {
    console.log('🚀 Admin Settings Pro initializing...');

    // Initialiser le tab actif
    setActiveTab(getTabFromUrl());

    // Charger les informations admin
    await loadAdminInfo();

    // Charger les paramètres
    await loadSettings();

    // Pré-remplir le formulaire Mon compte
    if (state.currentUser) fillProfileForm(state.currentUser);

    // Initialiser les événements
    initEventListeners();

    // Charger les infos système si l'onglet Avancé est actif (ou en arrière-plan)
    if (state.activeTab === 'tab-advanced') {
      loadSystemInfo();
    }

    // Charger les infos système quand on clique sur l'onglet Avancé
    document.querySelector('[data-tab="tab-advanced"]')?.addEventListener('click', () => {
      if (elements.systemInfoContainer && !elements.systemInfoContainer.querySelector('.grid')) {
        loadSystemInfo();
      }
    });

    console.log('✅ Admin Settings Pro initialized');
  }

  // Démarrer l'application
  init();

  // API publique
  return {
    loadSettings,
    saveSettings,
    restoreDefaults,
    exportSettings,
    importSettings,
    clearCache,
    optimizeDatabase,
    saveProfile,
    changePassword,
    testSmtp,
    loadSystemInfo
  };
})();

// Rendre disponible globalement
window.SettingsManager = SettingsManager;