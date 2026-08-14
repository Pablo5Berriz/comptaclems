'use strict';

(function () {
  // ====================================
  // CONFIGURATION
  // ====================================
  const CONFIG = {
    API: {
      me: '/api/client/espace-client/me',
      prefs: '/api/client/espace-client/preferences',
      password: '/api/client/espace-client/password',
      account: '/api/client/espace-client/account',
    },
    ROUTES: {
      login: '/auth/login.html',
      home: '/espace-client/profil.html',
    },
    STORAGE_KEYS: {
      auth: 'cc_client_auth',
      theme: 'cc_theme',
      motion: 'cc_reduce_motion',
      noise: 'cc_reduce_noise',
    },
    PASSWORD_MIN_LENGTH: 8,
    SAVE_DEBOUNCE: 350,
    TOAST_DURATION: 5000,
  };

  // ====================================
  // ÉLÉMENTS DOM
  // ====================================
  const els = {
    alert: document.getElementById('pageAlert'),
    toastHost: document.getElementById('toastHost'),
    
    // Thème
    themeAuto: document.getElementById('themeAuto'),
    themeLight: document.getElementById('themeLight'),
    themeDark: document.getElementById('themeDark'),
    
    // Préférences
    reduceMotion: document.getElementById('reduceMotion'),
    reduceNoise: document.getElementById('reduceNoise'),
    motionLabel: document.getElementById('motionLabel'),
    noiseLabel: document.getElementById('noiseLabel'),
    
    // Profil
    userInitials: document.getElementById('userInitials'),
    fullName: document.getElementById('fullName'),
    email: document.getElementById('email'),
    clientSince: document.getElementById('clientSince'),
    
    // Mot de passe
    pwdBox: document.getElementById('passwordBox'),
    openPwdBox: document.getElementById('openPwdBox'),
    closePwdBox: document.getElementById('closePwdBox'),
    cancelPwdBox: document.getElementById('cancelPwdBox'),
    savePassword: document.getElementById('savePassword'),
    currentPassword: document.getElementById('currentPassword'),
    newPassword: document.getElementById('newPassword'),
    
    // Déconnexion
    logoutBtn: document.getElementById('logoutBtn'),
    
    // Suppression compte
    deleteBtn: document.getElementById('deleteAccountBtn'),
    deleteBox: document.getElementById('deleteBox'),
    deleteInput: document.getElementById('deleteConfirmInput'),
    deleteConfirm: document.getElementById('deleteConfirmBtn'),
    deleteCancel: document.getElementById('deleteCancelBtn'),
  };

  // ====================================
  // STATE
  // ====================================
  let state = {
    user: null,
    isSaving: false,
    saveTimer: null,
    isAuthenticated: false,
    authChecked: false
  };

  // ====================================
  // UTILITAIRES
  // ====================================
  function escapeHtml(s) {
    if (!s) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getInitials(firstName, lastName, email) {
    if (firstName && lastName) {
      return (firstName[0] + lastName[0]).toUpperCase();
    }
    if (firstName) {
      return firstName.substring(0, 2).toUpperCase();
    }
    if (email) {
      return email.substring(0, 2).toUpperCase();
    }
    return '👤';
  }

  function formatMemberSince(dateString) {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      return `Client depuis ${date.toLocaleDateString('fr-FR', {
        month: 'long',
        year: 'numeric'
      })}`;
    } catch {
      return '';
    }
  }

  function checkAuthFromGlobal() {
    // Vérifier si l'état global est disponible
    if (window.ccState) {
      state.isAuthenticated = window.ccState.isAuthenticated === true;
      state.authChecked = true;
      return state.isAuthenticated;
    }
    
    // Vérifier via les éléments DOM (userMenu présent = connecté)
    const userMenu = document.getElementById('userMenu');
    const authButtons = document.getElementById('authButtons');
    
    if (userMenu && authButtons) {
      const isAuth = !userMenu.classList.contains('hidden') && authButtons.classList.contains('hidden');
      if (isAuth) {
        state.isAuthenticated = true;
        state.authChecked = true;
        return true;
      }
    }
    
    return false;
  }

  function isAuthenticated() {
    return state.isAuthenticated;
  }

  function togglePasswordBox(show) {
    if (!els.pwdBox) return;
    
    if (show) {
      if (!isAuthenticated()) {
        showAlert('Veuillez vous connecter pour modifier votre mot de passe', 'warning');
        return;
      }
      els.pwdBox.classList.remove('hidden');
      els.pwdBox.classList.add('flex');
      setTimeout(() => {
        els.pwdBox.classList.remove('opacity-0');
        els.pwdBox.querySelector('.settings-card')?.classList.add('scale-100');
        els.currentPassword?.focus();
      }, 10);
    } else {
      els.pwdBox.classList.add('opacity-0');
      els.pwdBox.querySelector('.settings-card')?.classList.remove('scale-100');
      setTimeout(() => {
        els.pwdBox.classList.add('hidden');
        els.pwdBox.classList.remove('flex');
        if (els.currentPassword) els.currentPassword.value = '';
        if (els.newPassword) els.newPassword.value = '';
      }, 300);
    }
  }

  // ====================================
  // TOAST NOTIFICATIONS
  // ====================================
  function showToast(message, type = 'info') {
    if (!els.toastHost) return;
    
    const icons = {
      success: 'fa-circle-check',
      error: 'fa-circle-exclamation',
      warning: 'fa-triangle-exclamation',
      info: 'fa-circle-info'
    };
    
    const colors = {
      success: 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-900/30 dark:border-emerald-800 dark:text-emerald-300',
      error: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/30 dark:border-red-800 dark:text-red-300',
      warning: 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-900/30 dark:border-amber-800 dark:text-amber-300',
      info: 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-300'
    };
    
    const toast = document.createElement('div');
    toast.className = `${colors[type]} border rounded-2xl px-5 py-4 flex items-start gap-4 shadow-2xl animate-slideIn w-80`;
    toast.setAttribute('role', 'alert');
    toast.innerHTML = `
      <i class="fas ${icons[type]} text-lg mt-0.5"></i>
      <div class="flex-1 text-sm font-medium">${escapeHtml(message)}</div>
      <button class="toast-close hover:opacity-70 transition" aria-label="Fermer">
        <i class="fas fa-times"></i>
      </button>
    `;
    
    toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());
    els.toastHost.appendChild(toast);
    
    setTimeout(() => {
      if (toast.parentNode) {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
      }
    }, CONFIG.TOAST_DURATION);
  }

  function showAlert(message, type = 'info') {
    if (!els.alert) return;
    
    const styles = {
      success: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800',
      error: 'bg-red-50 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
      warning: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
      info: 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800'
    };
    
    const icons = {
      success: 'fa-check-circle',
      error: 'fa-exclamation-circle',
      warning: 'fa-exclamation-triangle',
      info: 'fa-circle-info'
    };
    
    els.alert.className = `page-alert ${styles[type]}`;
    els.alert.innerHTML = `
      <div class="flex items-start gap-3">
        <i class="fas ${icons[type]} text-lg mt-0.5"></i>
        <div class="flex-1">${escapeHtml(message)}</div>
        <button class="alert-close hover:opacity-70 transition" aria-label="Fermer">
          <i class="fas fa-times"></i>
        </button>
      </div>
    `;
    els.alert.classList.remove('hidden');
    
    const closeBtn = els.alert.querySelector('.alert-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        els.alert.classList.add('hidden');
      });
    }
    
    setTimeout(() => els.alert.classList.add('hidden'), CONFIG.TOAST_DURATION);
  }

  // ====================================
  // GESTION DU THÈME
  // ====================================
  function applyTheme(mode) {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const dark = mode === 'dark' || (mode === 'auto' && prefersDark);

    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem(CONFIG.STORAGE_KEYS.theme, mode);
    updateThemeUI(mode);
    
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', dark ? '#0f172a' : '#f8fafc');
    }
  }

  function updateThemeUI(active) {
    [els.themeAuto, els.themeLight, els.themeDark].forEach(btn => {
      if (btn) {
        btn.classList.remove('active');
        btn.setAttribute('aria-checked', 'false');
      }
    });

    if (active === 'auto' && els.themeAuto) {
      els.themeAuto.classList.add('active');
      els.themeAuto.setAttribute('aria-checked', 'true');
    }
    if (active === 'light' && els.themeLight) {
      els.themeLight.classList.add('active');
      els.themeLight.setAttribute('aria-checked', 'true');
    }
    if (active === 'dark' && els.themeDark) {
      els.themeDark.classList.add('active');
      els.themeDark.setAttribute('aria-checked', 'true');
    }
  }

  // ====================================
  // GESTION DES PRÉFÉRENCES (ANIMATIONS)
  // ====================================
  function applyMotion(rm) {
    localStorage.setItem(CONFIG.STORAGE_KEYS.motion, rm ? '1' : '0');
    if (els.reduceMotion) {
      els.reduceMotion.checked = rm;
      els.reduceMotion.setAttribute('aria-checked', rm.toString());
    }
    if (els.motionLabel) els.motionLabel.textContent = rm ? 'Activé' : 'Désactivé';
    
    if (rm) {
      document.documentElement.classList.add('reduce-motion');
      if (!document.getElementById('motion-reduce-style')) {
        const style = document.createElement('style');
        style.id = 'motion-reduce-style';
        style.textContent = `
          .reduce-motion *,
          .reduce-motion *::before,
          .reduce-motion *::after {
            animation-duration: 0.001ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.001ms !important;
            scroll-behavior: auto !important;
          }
        `;
        document.head.appendChild(style);
      }
    } else {
      document.documentElement.classList.remove('reduce-motion');
      const style = document.getElementById('motion-reduce-style');
      if (style) style.remove();
    }
  }

  function applyNoise(rn) {
    localStorage.setItem(CONFIG.STORAGE_KEYS.noise, rn ? '1' : '0');
    if (els.reduceNoise) {
      els.reduceNoise.checked = rn;
      els.reduceNoise.setAttribute('aria-checked', rn.toString());
    }
    if (els.noiseLabel) els.noiseLabel.textContent = rn ? 'Activé' : 'Désactivé';
  }

  function readLocalPrefs() {
    return {
      theme: localStorage.getItem(CONFIG.STORAGE_KEYS.theme) || 'auto',
      reduceMotion: localStorage.getItem(CONFIG.STORAGE_KEYS.motion) === '1',
      reduceNoise: localStorage.getItem(CONFIG.STORAGE_KEYS.noise) === '1',
    };
  }

  // ====================================
  // CHARGEMENT DES DONNÉES UTILISATEUR
  // ====================================
  async function loadUser() {
    if (!isAuthenticated()) {
      updateProfileUIForGuest();
      return;
    }
    
    try {
      if (window.ccState && window.ccState.user) {
        updateProfileUI(window.ccState.user);
        return;
      }
      
      // Sinon, faire un appel API
      const data = window.http 
        ? await window.http.get(CONFIG.API.me)
        : await fetch(CONFIG.API.me, { credentials: 'include' }).then(r => r.json());
      
      let userData = {};
      if (data?.data) {
        userData = data.data;
      } else if (data?.user) {
        userData = data.user;
      } else {
        userData = data;
      }
      
      state.user = userData;
      updateProfileUI(userData);
      
    } catch (error) {
      updateProfileUIForGuest();
    }
  }

  function updateProfileUI(userData) {
    const fullName = userData.fullName || 
                     userData.full_name || 
                     [userData.firstName, userData.lastName].filter(Boolean).join(' ') ||
                     [userData.first_name, userData.last_name].filter(Boolean).join(' ') ||
                     'Utilisateur';
    
    const email = userData.email || userData.mail || 'email@exemple.com';
    const createdAt = userData.created_at || userData.createdAt || userData.memberSince;
    
    if (els.fullName) els.fullName.textContent = fullName;
    if (els.email) els.email.textContent = email;
    if (els.clientSince && createdAt) {
      els.clientSince.textContent = formatMemberSince(createdAt);
    }
    
    if (els.userInitials) {
      const firstName = userData.firstName || userData.first_name || fullName.split(' ')[0];
      const lastName = userData.lastName || userData.last_name || fullName.split(' ')[1];
      const initials = getInitials(firstName, lastName, email);
      els.userInitials.textContent = initials;
      els.userInitials.style.fontSize = '';
    }
    
    // Supprimer le prompt de connexion s'il existe
    const loginPrompt = document.getElementById('login-prompt');
    if (loginPrompt) loginPrompt.remove();
  }

  function updateProfileUIForGuest() {
    if (els.fullName) els.fullName.textContent = 'Non connecté';
    if (els.email) els.email.textContent = 'Connectez-vous pour voir vos informations';
    if (els.userInitials) {
      els.userInitials.textContent = '🔒';
      els.userInitials.style.fontSize = '1.5rem';
    }
    if (els.clientSince) els.clientSince.textContent = '';
    
    // Ajouter un badge de connexion si nécessaire
    if (!document.getElementById('login-prompt')) {
      const userCard = document.querySelector('.user-card');
      if (userCard) {
        const loginPrompt = document.createElement('div');
        loginPrompt.id = 'login-prompt';
        loginPrompt.className = 'mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-sm';
        loginPrompt.innerHTML = `
          <i class="fas fa-info-circle text-blue-600 dark:text-blue-400 mr-2"></i>
          <a href="/auth/login.html" class="text-blue-600 dark:text-blue-400 font-medium hover:underline">Connectez-vous</a> pour modifier vos paramètres
        `;
        userCard.appendChild(loginPrompt);
      }
    }
  }

  async function loadPrefs() {
    const local = readLocalPrefs();
    applyTheme(local.theme);
    applyMotion(local.reduceMotion);
    applyNoise(local.reduceNoise);

    if (!isAuthenticated()) return;

    try {
      const data = window.http 
        ? await window.http.get(CONFIG.API.prefs)
        : await fetch(CONFIG.API.prefs, { credentials: 'include' }).then(r => r.json());
      
      let prefs = {};
      if (data?.data) {
        prefs = data.data;
      } else {
        prefs = data;
      }
      
      if (prefs) {
        applyTheme(prefs.theme || local.theme);
        applyMotion(typeof prefs.reduceMotion === 'boolean' ? prefs.reduceMotion : 
                   typeof prefs.reduce_motion === 'boolean' ? prefs.reduce_motion : local.reduceMotion);
        applyNoise(typeof prefs.reduceNoise === 'boolean' ? prefs.reduceNoise : 
                  typeof prefs.reduce_noise === 'boolean' ? prefs.reduce_noise : local.reduceNoise);
      }
    } catch (error) {
      console.error('Erreur chargement préférences:', error);
    }
  }

  function scheduleSavePrefs() {
    if (!isAuthenticated()) return;
    
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(async () => {
      try {
        const prefs = {
          theme: localStorage.getItem(CONFIG.STORAGE_KEYS.theme) || 'auto',
          reduceMotion: localStorage.getItem(CONFIG.STORAGE_KEYS.motion) === '1',
          reduceNoise: localStorage.getItem(CONFIG.STORAGE_KEYS.noise) === '1',
        };
        
        if (window.http) {
          await window.http.put(CONFIG.API.prefs, prefs);
        }
      } catch (error) {
        console.error('Erreur sauvegarde préférences:', error);
      }
    }, CONFIG.SAVE_DEBOUNCE);
  }

  // ====================================
  // ACTIONS
  // ====================================
  async function changePassword() {
    if (!isAuthenticated()) {
      showAlert('Veuillez vous connecter pour modifier votre mot de passe', 'warning');
      togglePasswordBox(false);
      return;
    }
    
    const currentPassword = els.currentPassword?.value || '';
    const newPassword = els.newPassword?.value || '';

    if (!currentPassword || !newPassword) {
      showAlert('Tous les champs sont obligatoires', 'error');
      return;
    }

    if (newPassword.length < CONFIG.PASSWORD_MIN_LENGTH) {
      showAlert(`Le mot de passe doit contenir au moins ${CONFIG.PASSWORD_MIN_LENGTH} caractères`, 'error');
      return;
    }

    if (els.savePassword) {
      els.savePassword.disabled = true;
      els.savePassword.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Modification...';
    }

    try {
      if (window.http) {
        await window.http.put(CONFIG.API.password, { currentPassword, newPassword });
      } else {
        await fetch(CONFIG.API.password, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ currentPassword, newPassword }),
          credentials: 'include'
        });
      }

      showToast('Mot de passe modifié avec succès', 'success');
      
      if (els.currentPassword) els.currentPassword.value = '';
      if (els.newPassword) els.newPassword.value = '';
      togglePasswordBox(false);
      
    } catch (error) {
      showAlert(error.message || 'Erreur lors de la modification', 'error');
    } finally {
      if (els.savePassword) {
        els.savePassword.disabled = false;
        els.savePassword.innerHTML = '<i class="fas fa-save"></i> Enregistrer';
      }
    }
  }

  // ====================================
  // VALIDATION DU MOT DE PASSE EN TEMPS RÉEL
  // ====================================
  function setupPasswordValidation() {
    if (!els.newPassword) return;
    
    const strengthBars = document.querySelectorAll('.strength-bar');
    const strengthText = document.getElementById('passwordStrength');
    
    if (!strengthBars.length || !strengthText) return;
    
    els.newPassword.addEventListener('input', (e) => {
      const password = e.target.value;
      
      let strength = 0;
      
      if (password.length >= 8) strength++;
      if (password.match(/[a-z]/) && password.match(/[A-Z]/)) strength++;
      if (password.match(/\d/)) strength++;
      if (password.match(/[^a-zA-Z\d]/)) strength++;
      
      strengthBars.forEach((bar, index) => {
        bar.className = index < strength 
          ? `flex-1 h-full ${index === 0 ? 'bg-red-500' : index === 1 ? 'bg-orange-500' : index === 2 ? 'bg-yellow-500' : 'bg-green-500'} rounded${index === 0 ? '-l' : index === 3 ? '-r' : ''}`
          : 'flex-1 h-full bg-slate-200 dark:bg-slate-700';
      });
      
      const strengthLabels = ['Très faible', 'Faible', 'Moyen', 'Fort', 'Très fort'];
      strengthText.textContent = strengthLabels[strength] || 'Très faible';
    });
  }

  // ====================================
  // GESTION DES ÉVÉNEMENTS D'AUTH
  // ====================================
  function setupAuthListeners() {
    // Écouter les changements d'authentification
    window.addEventListener('auth-change', (e) => {
      state.isAuthenticated = e.detail.isAuthenticated;
      
      if (state.isAuthenticated) {
        loadUser();
        loadPrefs();
      } else {
        updateProfileUIForGuest();
      }
    });
    
    // Écouter quand l'auth est prête
    window.addEventListener('auth-ready', () => {
      const isAuth = checkAuthFromGlobal();
      state.isAuthenticated = isAuth;
      
      if (isAuth) {
        loadUser();
        loadPrefs();
      } else {
        updateProfileUIForGuest();
      }
    });
  }

  // ====================================
  // INITIALISATION DES ÉVÉNEMENTS UI
  // ====================================
  function bindUI() {
    els.themeAuto?.addEventListener('click', () => { 
      applyTheme('auto'); 
      scheduleSavePrefs(); 
    });
    els.themeLight?.addEventListener('click', () => { 
      applyTheme('light'); 
      scheduleSavePrefs(); 
    });
    els.themeDark?.addEventListener('click', () => { 
      applyTheme('dark'); 
      scheduleSavePrefs(); 
    });

    els.reduceMotion?.addEventListener('change', (e) => { 
      applyMotion(e.target.checked); 
      scheduleSavePrefs(); 
    });
    els.reduceNoise?.addEventListener('change', (e) => { 
      applyNoise(e.target.checked); 
      scheduleSavePrefs(); 
    });

    els.openPwdBox?.addEventListener('click', (e) => {
      e.preventDefault();
      togglePasswordBox(true);
    });
    
    els.closePwdBox?.addEventListener('click', () => {
      togglePasswordBox(false);
    });
    
    els.cancelPwdBox?.addEventListener('click', () => {
      togglePasswordBox(false);
    });
    
    els.savePassword?.addEventListener('click', changePassword);

    els.currentPassword?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') changePassword();
    });
    els.newPassword?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') changePassword();
    });

    // Bouton de déconnexion
    els.logoutBtn?.addEventListener('click', handleLogout);

    // Zone de suppression de compte
    els.deleteBtn?.addEventListener('click', () => {
      if (els.deleteBox) {
        els.deleteBox.classList.toggle('hidden');
        if (els.deleteInput) els.deleteInput.value = '';
        if (els.deleteConfirm) els.deleteConfirm.disabled = true;
      }
    });

    els.deleteInput?.addEventListener('input', () => {
      if (els.deleteConfirm) {
        els.deleteConfirm.disabled = (els.deleteInput.value !== 'SUPPRIMER');
      }
    });

    els.deleteConfirm?.addEventListener('click', async () => {
      if (els.deleteInput?.value !== 'SUPPRIMER') return;
      els.deleteConfirm.disabled = true;
      els.deleteConfirm.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Suppression...';
      try {
        if (window.http) {
          await window.http.del(CONFIG.API.account);
        } else {
          await fetch(CONFIG.API.account, { method: 'DELETE', credentials: 'include' });
        }
        // Supprimer les clés du projet au lieu de tout clear
        ['cc_theme', 'cc_draft_v3', 'cc_draft', 'cc_prefs', 'declaration_draft', 'cc_client_auth'].forEach(k => localStorage.removeItem(k));
        sessionStorage.clear();
        window.location.href = CONFIG.ROUTES.login;
      } catch (error) {
        showAlert(error.message || 'Erreur lors de la suppression', 'error');
        els.deleteConfirm.disabled = false;
        els.deleteConfirm.innerHTML = '<i class="fas fa-check-circle"></i> Confirmer';
      }
    });

    els.deleteCancel?.addEventListener('click', () => {
      if (els.deleteBox) els.deleteBox.classList.add('hidden');
      if (els.deleteInput) els.deleteInput.value = '';
      if (els.deleteConfirm) els.deleteConfirm.disabled = true;
    });

    // Clic en dehors de la modal mot de passe pour fermer
    els.pwdBox?.addEventListener('click', (e) => {
      if (e.target === els.pwdBox) {
        togglePasswordBox(false);
      }
    });

    // Echap pour fermer les modales
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (els.pwdBox && !els.pwdBox.classList.contains('hidden')) {
          togglePasswordBox(false);
        }
      }
    });

    // Détection du thème système
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      const currentTheme = localStorage.getItem(CONFIG.STORAGE_KEYS.theme) || 'auto';
      if (currentTheme === 'auto') {
        applyTheme('auto');
      }
    });
  }

  async function handleLogout(e) {
    e.preventDefault();
    
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
      
      // Nettoyer le localStorage
      localStorage.removeItem('cc_client_auth');
      sessionStorage.clear();
      
      // Rediriger vers la page d'accueil
      setTimeout(() => {
        window.location.href = '/';
      }, 500);
      
    } catch (error) {
      console.error('Erreur déconnexion:', error);
      btn.disabled = false;
      btn.innerHTML = originalHtml;
      window.location.href = '/';
    }
  }

  // ====================================
  // INITIALISATION
  // ====================================
  async function boot() {
    // Vérifier l'authentification avant tout
    try {
      const authRes = await fetch(CONFIG.API.me, {
        credentials: 'include',
        cache: 'no-store',
        headers: { Accept: 'application/json' }
      });

      if (authRes.status === 401) {
        window.location.assign(CONFIG.ROUTES.login);
        return;
      }
    } catch (e) {
      console.error('Auth check failed:', e);
    }

    // Appliquer les préférences locales immédiatement
    const local = readLocalPrefs();
    applyTheme(local.theme);
    applyMotion(local.reduceMotion);
    applyNoise(local.reduceNoise);

    // Initialiser les événements UI
    bindUI();
    
    // Configuration de la validation du mot de passe
    setupPasswordValidation();
    
    // Écouter les événements d'authentification
    setupAuthListeners();
    
    // Vérifier l'authentification immédiatement
    const isAuth = checkAuthFromGlobal();
    state.isAuthenticated = isAuth;
    
    if (isAuth) {
      await loadUser();
      await loadPrefs();
    } else {
      updateProfileUIForGuest();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();