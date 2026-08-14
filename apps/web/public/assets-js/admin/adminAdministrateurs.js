// /assets-js/admin/adminAdministrateurs.js
'use strict';

const AdminManager = (() => {
  // ====================================
  // 1. CONSTANTES & CONFIGURATION
  // ====================================
  
  const CONFIG = {
    API: {
      BASE: '/api/admin',
      ADMINS: '/api/admin/admins',
      ME: '/api/admin/dashboard/me',
      STATS: '/api/admin/admins/stats' 
    },
    PASSWORD_MIN_LENGTH: 10,
    ANIMATION_DURATION: 300,
    DEBOUNCE_DELAY: 300,
    ROLES: {
      superadmin: { 
        label: 'Super Administrateur', 
        color: 'role-superadmin',
        icon: 'fa-crown',
        level: 3,
        description: 'Accès complet à toutes les fonctionnalités'
      },
      admin: { 
        label: 'Administrateur', 
        color: 'role-admin',
        icon: 'fa-shield',
        level: 2,
        description: 'Gestion des clients, services et déclarations'
      },
      support: { 
        label: 'Support', 
        color: 'role-support',
        icon: 'fa-headset',
        level: 1,
        description: 'Accès limité à l\'assistance client'
      }
    }
  };

  // ====================================
  // 2. STATE MANAGEMENT
  // ====================================
  
  let state = {
    admins: [],
    currentUser: null,
    isLoading: false,
    isSubmitting: false,
    resetAdminId: null,
    editAdminId: null,
    filters: {
      search: '',
      role: '',
      status: ''
    },
    stats: {
      total: 0,
      active: 0,
      superadmin: 0,
      admin: 0,
      support: 0
    }
  };

  // ====================================
  // 3. ÉLÉMENTS DOM
  // ====================================
  
  const elements = {
    // Alertes & Toasts
    alert: document.getElementById('pageAlert'),
    toastHost: document.getElementById('toastHost'),
    
    // Table
    tbody: document.getElementById('adminsTbody'),
    
    // Stats
    totalAdmins: document.getElementById('totalAdmins'),
    activeAdmins: document.getElementById('activeAdmins'),
    adminCount: document.getElementById('adminCount'),
    lastUpdate: document.getElementById('lastUpdate'),
    
    // Création
    openBtn: document.getElementById('openCreateAdmin'),
    createWrap: document.getElementById('createAdminWrap'),
    cancelCreate: document.getElementById('cancelCreateAdmin'),
    formCreate: document.getElementById('createAdminForm'),
    submitCreateBtn: document.getElementById('submitCreateAdmin'),
    
    // Recherche & Filtres
    searchInput: document.getElementById('searchAdmin'),
    refreshBtn: document.getElementById('refreshAdmins'),
    
    // Modals
    resetModal: document.getElementById('resetModal'),
    resetPassForm: document.getElementById('resetPassForm'),
    resetTarget: document.getElementById('resetTarget'),
    confirmModal: document.getElementById('confirmModal'),
    editAdminModal: document.getElementById('editAdminModal'),
    
    // Edit Modal
    editForm: document.getElementById('editAdminForm'),
    editAdminId: document.getElementById('edit_admin_id'),
    editFirstName: document.getElementById('edit_first_name'),
    editLastName: document.getElementById('edit_last_name'),
    editEmail: document.getElementById('edit_email'),
    editPhone: document.getElementById('edit_phone'),
    editRole: document.getElementById('edit_role'),
    editPassword: document.getElementById('edit_password'),
    editPasswordConfirm: document.getElementById('edit_password_confirm'),
    passwordFields: document.getElementById('passwordFields'),
    showPasswordBtn: document.getElementById('showPasswordFields'),
    toggleAdminStatus: document.getElementById('toggleAdminStatus'),
    statusToggleBg: document.getElementById('statusToggleBg'),
    statusToggleDot: document.getElementById('statusToggleDot'),
    statusLabel: document.getElementById('statusLabel'),
    passwordError: document.getElementById('passwordError'),
    closeEditModal: document.getElementById('closeEditModal'),
    cancelEditModal: document.getElementById('cancelEditModal'),
    editModalBackdrop: document.getElementById('editModalBackdrop'),
    
    // Confirmation Modal
    confirmTitle: document.getElementById('confirmTitle'),
    confirmSubtitle: document.getElementById('confirmSubtitle'),
    confirmMessage: document.getElementById('confirmMessage'),
    confirmAction: document.getElementById('confirmAction'),
    confirmIcon: document.getElementById('confirmIcon'),
    confirmButtonText: document.getElementById('confirmButtonText'),
    confirmBackdrop: document.getElementById('confirmBackdrop'),
    confirmCancel: document.getElementById('confirmCancel'),
    
    // Reset Modal
    closeResetModal: document.getElementById('closeResetModal'),
    cancelReset: document.getElementById('cancelReset'),
    rp_password: document.getElementById('rp_password')
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
  function formatDate(dateString) {
    if (!dateString) return '—';
    try {
      const date = new Date(dateString);
      return new Intl.DateTimeFormat('fr-FR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }).format(date);
    } catch {
      return '—';
    }
  }

  /**
   * Met à jour la date de dernière mise à jour
   */
  function updateLastUpdate() {
    if (elements.lastUpdate) {
      const now = new Date();
      elements.lastUpdate.textContent = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
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
    if (!elements.alert) return;
    
    const styles = {
      success: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-800', icon: 'fa-circle-check' },
      error: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', icon: 'fa-circle-exclamation' },
      warning: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-800', icon: 'fa-triangle-exclamation' },
      info: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800', icon: 'fa-circle-info' }
    };
    
    const style = styles[type] || styles.info;
    
    elements.alert.innerHTML = `
      <div class="flex items-start gap-3 w-full">
        <i class="fas ${style.icon} text-lg mt-0.5"></i>
        <div class="flex-1 font-medium">${escapeHtml(message)}</div>
        <button class="alert-close text-slate-400 hover:text-slate-600 transition">
          <i class="fas fa-times"></i>
        </button>
      </div>
    `;
    
    elements.alert.className = `${style.bg} ${style.border} ${style.text} mb-8 rounded-2xl border px-5 py-4 text-sm flex items-start gap-3 animate-slideIn`;
    elements.alert.classList.remove('hidden');
    
    elements.alert.querySelector('.alert-close')?.addEventListener('click', () => {
      elements.alert.classList.add('hidden');
    });
    
    setTimeout(() => elements.alert.classList.add('hidden'), 5000);
  }

  function hideAlert() {
    elements.alert?.classList.add('hidden');
  }

  // ====================================
  // 5. AUTHENTIFICATION
  // ====================================
  
  function getAuth() {
    try {
      return JSON.parse(localStorage.getItem('cc_admin_auth') || '{}');
    } catch {
      return { token: null, admin: null };
    }
  }

  function getToken() {
    return getAuth()?.token || null;
  }

  function hardLogout() {
    localStorage.removeItem('cc_admin_auth');
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
      const res = await fetch(path, { ...opts, headers });

      if (res.status === 401 || res.status === 403) {
        showToast('Session expirée', 'error');
        hardLogout();
        throw new Error('Session expirée');
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
  // 6. STATISTIQUES
  // ====================================
  
  async function loadStats() {
    try {
      // Tenter de charger les stats depuis l'API
      const data = await api(CONFIG.API.STATS).catch(() => null);
      
      if (data?.stats) {
        state.stats = data.stats;
      } else {
        // Fallback: calculer les stats depuis la liste des admins
        state.stats = {
          total: state.admins.length,
          active: state.admins.filter(a => a.is_active).length,
          superadmin: state.admins.filter(a => a.role === 'superadmin').length,
          admin: state.admins.filter(a => a.role === 'admin').length,
          support: state.admins.filter(a => a.role === 'support').length
        };
      }
      
      updateStatsUI();
    } catch (error) {
      console.error('Erreur chargement stats:', error);
      // Fallback silencieux
      state.stats = {
        total: state.admins.length,
        active: state.admins.filter(a => a.is_active).length,
        superadmin: state.admins.filter(a => a.role === 'superadmin').length,
        admin: state.admins.filter(a => a.role === 'admin').length,
        support: state.admins.filter(a => a.role === 'support').length
      };
      updateStatsUI();
    }
  }

  function updateStatsUI() {
    if (elements.totalAdmins) {
      elements.totalAdmins.textContent = state.stats.total || 0;
    }
    if (elements.activeAdmins) {
      elements.activeAdmins.textContent = state.stats.active || 0;
    }
    if (elements.adminCount) {
      elements.adminCount.textContent = `${state.stats.total || 0} administrateur${state.stats.total > 1 ? 's' : ''}`;
    }
  }

  // ====================================
  // 7. GESTION DES ADMINISTRATEURS
  // ====================================
  
  /**
   * Charge la liste des administrateurs
   */
  async function loadAdmins() {
    if (state.isLoading) return;
    
    state.isLoading = true;
    hideAlert();

    if (!elements.tbody) return;

    showLoading();

    try {
      // Charger l'utilisateur courant et la liste des admins
      const [meData, data] = await Promise.all([
        api(CONFIG.API.ME).catch(() => ({ admin: getAuth()?.admin })),
        api(CONFIG.API.ADMINS)
      ]);

      state.currentUser = meData?.admin || getAuth()?.admin || null;
      
      // ✅ IMPORTANT: Convertir les IDs en nombres
      state.admins = (data?.admins || []).map(admin => ({
        ...admin,
        id: Number(admin.id)
      }));
      
      if (state.currentUser) {
        state.currentUser.id = Number(state.currentUser.id);
      }

      // Mettre à jour les stats
      await loadStats();

      if (state.admins.length === 0) {
        renderEmptyState();
        return;
      }

      renderAdminsTable();
      updateLastUpdate();

    } catch (error) {
      console.error('Erreur chargement admins:', error);
      showAlert(error.message, 'error');
      showToast(error.message, 'error');
      
      elements.tbody.innerHTML = `
        <tr>
          <td colspan="5" class="px-6 py-12 text-center">
            <div class="flex flex-col items-center gap-4">
              <div class="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center">
                <i class="fas fa-exclamation-triangle text-3xl text-red-600"></i>
              </div>
              <div>
                <p class="text-lg font-medium text-slate-900">Erreur de chargement</p>
                <p class="text-sm text-slate-500 mt-1">${escapeHtml(error.message)}</p>
              </div>
              <button onclick="window.location.reload()" class="mt-2 px-6 py-3 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition flex items-center gap-2">
                <i class="fas fa-sync-alt"></i>
                Réessayer
              </button>
            </div>
          </td>
        </tr>
      `;
    } finally {
      state.isLoading = false;
    }
  }

  /**
   * Affiche l'état de chargement
   */
  function showLoading() {
    if (!elements.tbody) return;
    
    elements.tbody.innerHTML = `
      <tr>
        <td colspan="5" class="px-6 py-12 text-center">
          <div class="flex flex-col items-center gap-4">
            <div class="relative">
              <div class="w-16 h-16 rounded-full border-4 border-slate-200 border-t-slate-900 animate-spin"></div>
              <i class="fas fa-user-shield absolute inset-0 flex items-center justify-center text-slate-400 text-xl"></i>
            </div>
            <div>
              <p class="text-lg font-medium text-slate-900">Chargement des administrateurs</p>
              <p class="text-sm text-slate-500 mt-1">Veuillez patienter...</p>
            </div>
          </div>
        </td>
      </tr>
    `;
  }

  /**
   * Affiche un état vide
   */
  function renderEmptyState() {
    if (!elements.tbody) return;
    
    elements.tbody.innerHTML = `
      <tr>
        <td colspan="5" class="px-6 py-16 text-center">
          <div class="flex flex-col items-center gap-4">
            <div class="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center">
              <i class="fas fa-user-shield text-3xl text-slate-400"></i>
            </div>
            <div>
              <p class="text-lg font-medium text-slate-900">Aucun administrateur</p>
              <p class="text-sm text-slate-500 mt-1">Commencez par créer votre premier administrateur</p>
            </div>
            <button onclick="document.getElementById('openCreateAdmin').click()" class="mt-2 px-6 py-3 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition flex items-center gap-2">
              <i class="fas fa-plus-circle"></i>
              Créer un administrateur
            </button>
          </div>
        </td>
      </tr>
    `;
  }

  /**
   * Filtre les administrateurs selon la recherche
   */
  function filterAdmins() {
    const searchTerm = state.filters.search.toLowerCase().trim();
    
    if (!searchTerm) return state.admins;
    
    return state.admins.filter(admin => 
      (admin.first_name?.toLowerCase() || '').includes(searchTerm) ||
      (admin.last_name?.toLowerCase() || '').includes(searchTerm) ||
      (admin.email?.toLowerCase() || '').includes(searchTerm) ||
      (admin.phone?.toLowerCase() || '').includes(searchTerm)
    );
  }

  /**
   * Affiche le tableau des administrateurs
   */
  function renderAdminsTable() {
    if (!elements.tbody) return;
    
    const filteredAdmins = filterAdmins();
    const isSuperAdmin = state.currentUser?.role === 'superadmin';
    
    if (filteredAdmins.length === 0) {
      elements.tbody.innerHTML = `
        <tr>
          <td colspan="5" class="px-6 py-12 text-center">
            <div class="flex flex-col items-center gap-3">
              <i class="fas fa-search text-3xl text-slate-300"></i>
              <p class="text-sm font-medium text-slate-700">Aucun résultat trouvé</p>
              <p class="text-xs text-slate-500">Essayez d'autres termes de recherche</p>
            </div>
          </td>
        </tr>
      `;
      return;
    }
    
    elements.tbody.innerHTML = filteredAdmins.map(admin => {
      const role = CONFIG.ROLES[admin.role] || CONFIG.ROLES.admin;
      const fullName = `${admin.first_name || ''} ${admin.last_name || ''}`.trim() || 'Sans nom';
      const initials = (admin.first_name?.[0] || '') + (admin.last_name?.[0] || '');
      const isCurrentUser = state.currentUser?.id === admin.id;
      
      return `
        <tr class="admin-row hover:bg-slate-50 transition border-b border-slate-100" data-id="${admin.id}">
          <td class="px-6 py-4">
            <div class="flex items-center gap-4">
              <div class="relative">
                <div class="w-10 h-10 rounded-full bg-gradient-to-br ${getAvatarGradient(admin.role)} flex items-center justify-center text-white font-bold text-sm">
                  ${escapeHtml(initials || 'AD')}
                </div>
                <span class="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${admin.is_active ? 'bg-emerald-500' : 'bg-slate-400'}"></span>
              </div>
              <div>
                <div class="font-semibold text-slate-900 flex items-center gap-2">
                  ${escapeHtml(fullName)}
                  ${isCurrentUser ? '<span class="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">Vous</span>' : ''}
                  ${admin.role === 'superadmin' ? '<i class="fas fa-crown text-amber-500 text-xs" title="Super Admin"></i>' : ''}
                </div>
                ${admin.phone ? `<div class="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                  <i class="fas fa-phone"></i>
                  ${escapeHtml(admin.phone)}
                </div>` : ''}
              </div>
            </div>
          </td>
          <td class="px-6 py-4">
            <div class="flex flex-col">
              <span class="text-sm font-medium text-slate-900">${escapeHtml(admin.email)}</span>
              <span class="text-xs text-slate-400 mt-0.5">ID: ${admin.id}</span>
            </div>
          </td>
          <td class="px-6 py-4">
            <span class="role-badge ${role.color}">
              <i class="fas ${role.icon} mr-1.5"></i>
              ${role.label}
            </span>
            <div class="text-xs text-slate-500 mt-1">${role.description}</div>
          </td>
          <td class="px-6 py-4">
            ${admin.is_active 
              ? '<span class="status-active"><i class="fas fa-check-circle"></i> Actif</span>' 
              : '<span class="status-inactive"><i class="fas fa-times-circle"></i> Inactif</span>'}
            ${admin.last_login_at ? `
              <div class="text-xs text-slate-400 mt-1.5">
                Dernière connexion: ${formatDate(admin.last_login_at)}
              </div>
            ` : ''}
          </td>
          <td class="px-6 py-4 text-right">
            <div class="flex items-center justify-end gap-2">
              <!-- Bouton Modifier -->
              <button 
                type="button"
                class="edit-btn px-3 py-2 bg-white border-2 border-slate-200 rounded-xl hover:bg-slate-50 transition flex items-center gap-1.5 text-slate-700 shadow-sm"
                data-id="${admin.id}"
                data-tooltip="Modifier"
                ${isSuperAdmin || isCurrentUser ? '' : 'disabled style="opacity:0.5;cursor:not-allowed"'}
              >
                <i class="fas fa-pencil-alt text-xs"></i>
                <span class="hidden sm:inline text-xs">Modifier</span>
              </button>
              
              <!-- Bouton Reset mot de passe -->
              <button 
                type="button"
                class="reset-btn px-3 py-2 bg-white border-2 border-slate-200 rounded-xl hover:bg-amber-50 transition flex items-center gap-1.5 text-slate-700 hover:text-amber-700 hover:border-amber-200"
                data-id="${admin.id}"
                data-first="${escapeHtml(admin.first_name || '')}"
                data-last="${escapeHtml(admin.last_name || '')}"
                data-email="${escapeHtml(admin.email || '')}"
                data-tooltip="Réinitialiser mot de passe"
                ${isSuperAdmin ? '' : 'disabled style="opacity:0.5;cursor:not-allowed"'}
              >
                <i class="fas fa-key text-xs"></i>
                <span class="hidden sm:inline text-xs">Reset</span>
              </button>
              
              <!-- Bouton Activer/Désactiver -->
              <button 
                type="button"
                class="toggle-btn px-3 py-2 rounded-xl flex items-center gap-1.5 text-xs font-medium transition shadow-sm
                  ${admin.is_active 
                    ? 'bg-white border-2 border-slate-200 text-slate-700 hover:bg-red-50 hover:text-red-700 hover:border-red-200' 
                    : 'bg-emerald-50 border-2 border-emerald-200 text-emerald-700 hover:bg-emerald-100'}"
                data-id="${admin.id}"
                data-active="${admin.is_active ? '1' : '0'}"
                data-tooltip="${admin.is_active ? 'Désactiver' : 'Activer'}"
                ${isSuperAdmin ? '' : 'disabled style="opacity:0.5;cursor:not-allowed"'}
              >
                <i class="fas ${admin.is_active ? 'fa-ban' : 'fa-check-circle'} text-xs"></i>
                <span>${admin.is_active ? 'Désactiver' : 'Activer'}</span>
              </button>

              ${isSuperAdmin && !isCurrentUser ? (
                '<button type="button"' +
                ' class="delete-btn px-3 py-2 bg-white border-2 border-red-200 rounded-xl hover:bg-red-50 hover:border-red-400 transition flex items-center gap-1.5 text-red-600 hover:text-red-700 shadow-sm"' +
                ' data-id="' + admin.id + '"' +
                ' data-name="' + escapeHtml((admin.first_name || '') + ' ' + (admin.last_name || '')) + '"' +
                ' data-role="' + escapeHtml(admin.role || '') + '"' +
                ' data-tooltip="Supprimer définitivement">' +
                '<i class="fas fa-trash text-xs"></i>' +
                '<span class="hidden sm:inline text-xs">Supprimer</span>' +
                '</button>'
              ) : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  /**
   * Récupère le gradient pour l'avatar selon le rôle
   */
  function getAvatarGradient(role) {
    const gradients = {
      superadmin: 'from-purple-600 to-indigo-600',
      admin: 'from-blue-600 to-indigo-600',
      support: 'from-slate-600 to-slate-500'
    };
    return gradients[role] || gradients.admin;
  }

  // ====================================
  // 8. CRÉATION D'ADMINISTRATEUR
  // ====================================
  
  function toggleCreateForm(show) {
    if (!elements.createWrap) return;
    
    if (show) {
      elements.createWrap.classList.remove('hidden');
      elements.createWrap.classList.add('animate-fadeIn');
      if (elements.openBtn) {
        elements.openBtn.innerHTML = '<i class="fas fa-times mr-2"></i>Annuler';
      }
    } else {
      elements.createWrap.classList.add('hidden');
      if (elements.openBtn) {
        elements.openBtn.innerHTML = '<i class="fas fa-plus-circle mr-2"></i>Nouvel administrateur';
      }
      if (elements.formCreate) {
        elements.formCreate.reset();
      }
    }
  }

  // ====================================
  // 9. MODAL D'ÉDITION
  // ====================================
  
  async function openEditModal(adminId) {
    // Convertir l'ID reçu en nombre
    const id = Number(adminId);
    
    // Comparer avec des nombres
    const admin = state.admins.find(a => a.id === id);
    
    if (!admin) {
      console.error('Admin non trouvé:', id, 'Admins disponibles:', state.admins.map(a => a.id));
      showToast('Administrateur introuvable', 'error');
      return;
    }
    
    state.editAdminId = id;
    
    // Vérifier que tous les éléments existent avant de les manipuler
    if (elements.editAdminId) elements.editAdminId.value = admin.id;
    if (elements.editFirstName) elements.editFirstName.value = admin.first_name || '';
    if (elements.editLastName) elements.editLastName.value = admin.last_name || '';
    if (elements.editEmail) elements.editEmail.value = admin.email || '';
    if (elements.editPhone) elements.editPhone.value = admin.phone || '';
    if (elements.editRole) elements.editRole.value = admin.role || 'admin';
    
    // Mettre à jour le statut toggle
    updateStatusToggle(admin.is_active);
    
    // Mettre à jour le titre
    const titleEl = document.getElementById('editModalTitle');
    if (titleEl) {
      titleEl.textContent = admin.id === state.currentUser?.id 
        ? 'Modifier mon profil' 
        : 'Modifier l\'administrateur';
    }
    
    const idEl = document.getElementById('editAdminId');
    if (idEl) idEl.textContent = `#${admin.id}`;
    
    const emailEl = document.getElementById('editAdminEmail');
    if (emailEl) emailEl.textContent = admin.email || '';
    
    // Cacher les champs mot de passe par défaut
    if (elements.passwordFields) {
      elements.passwordFields.classList.add('hidden');
    }
    if (elements.editPassword) elements.editPassword.value = '';
    if (elements.editPasswordConfirm) elements.editPasswordConfirm.value = '';
    if (elements.passwordError) elements.passwordError.classList.add('hidden');
    
    // Afficher la modal
    if (elements.editAdminModal) {
      elements.editAdminModal.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
    }
  }

  function closeEditModal() {
    if (elements.editAdminModal) {
      elements.editAdminModal.classList.add('hidden');
      document.body.style.overflow = '';
    }
    state.editAdminId = null;
  }

  function updateStatusToggle(isActive) {
    if (!elements.toggleAdminStatus || !elements.statusToggleBg || !elements.statusToggleDot || !elements.statusLabel) return;
    
    if (isActive) {
      elements.statusToggleBg.className = 'block w-14 h-8 rounded-full bg-emerald-500';
      elements.statusToggleDot.style.transform = 'translateX(24px)';
      elements.statusLabel.textContent = 'Actif';
      elements.statusLabel.className = 'text-sm font-medium text-emerald-700';
    } else {
      elements.statusToggleBg.className = 'block w-14 h-8 rounded-full bg-slate-300';
      elements.statusToggleDot.style.transform = 'translateX(0)';
      elements.statusLabel.textContent = 'Inactif';
      elements.statusLabel.className = 'text-sm font-medium text-slate-600';
    }
  }

  async function updateAdmin(adminId, data) {
    try {
      await api(`${CONFIG.API.ADMINS}/${adminId}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
      return true;
    } catch (error) {
      throw error;
    }
  }

  // ====================================
  // 10. MODAL DE CONFIRMATION
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
    
    // Changer la couleur du bouton
    if (elements.confirmAction) {
      elements.confirmAction.className = `px-5 py-2.5 bg-gradient-to-r ${
        confirmColor === 'red' 
          ? 'from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 shadow-lg shadow-red-500/30'
          : confirmColor === 'amber'
            ? 'from-amber-600 to-amber-500 hover:from-amber-700 hover:to-amber-600 shadow-lg shadow-amber-500/30'
            : 'from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 shadow-lg shadow-blue-500/30'
      } text-white rounded-xl font-medium transition flex items-center justify-center`;
    }
    
    // Stocker la fonction de confirmation
    window._confirmCallback = onConfirm;
    
    // Afficher la modal
    if (elements.confirmModal) {
      elements.confirmModal.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
    }
  }

  function closeConfirmModal() {
    if (elements.confirmModal) {
      elements.confirmModal.classList.add('hidden');
      document.body.style.overflow = '';
    }
    window._confirmCallback = null;
  }

  // ====================================
  // 11. ACTIONS SUR LES ADMINISTRATEURS
  // ====================================
  
  /**
   * Active/désactive un administrateur
   */
  async function deleteAdmin(adminId, adminName) {
    const id = Number(adminId);
    try {
      await api(`${CONFIG.API.ADMINS}/${id}`, { method: 'DELETE' });
      showToast(`${adminName} supprimé définitivement`, 'success');
      await loadAdmins();
    } catch (error) {
      showToast(error.message || 'Erreur lors de la suppression', 'error');
    }
  }

  async function toggleAdminStatus(adminId, newStatus) {
    // Convertir en nombre
    const id = Number(adminId);
    
    try {
      await api(`${CONFIG.API.ADMINS}/${id}/active`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: newStatus })
      });
      
      showToast(newStatus ? 'Administrateur activé avec succès' : 'Administrateur désactivé avec succès', 'success');
      await loadAdmins();
      
      // Fermer la modal d'édition si ouverte
      if (state.editAdminId === id) {
        updateStatusToggle(newStatus);
      }
      
    } catch (error) {
      showToast(error.message, 'error');
    }
  }

  /**
   * Réinitialise le mot de passe - CORRIGÉ
   */
  async function resetPassword(adminId, password) {
    // Convertir en nombre
    const id = Number(adminId);
    
    try {
      await api(`${CONFIG.API.ADMINS}/${id}/password`, {
        method: 'PATCH',
        body: JSON.stringify({ password })
      });
      
      showToast('Mot de passe réinitialisé avec succès', 'success');
      
      // Fermer la modal
      if (elements.resetModal) {
        elements.resetModal.classList.add('hidden');
      }
      if (elements.resetPassForm) {
        elements.resetPassForm.reset();
      }
      
    } catch (error) {
      showToast(error.message, 'error');
    }
  }

  // ====================================
  // 12. INITIALISATION DES ÉVÉNEMENTS
  // ====================================
  
  function initEventListeners() {
    // ========== TOGGLE FORMULAIRE CRÉATION ==========
    elements.openBtn?.addEventListener('click', () => {
      const isHidden = elements.createWrap?.classList.contains('hidden');
      toggleCreateForm(isHidden);
    });
    
    elements.cancelCreate?.addEventListener('click', () => toggleCreateForm(false));
    
    // ========== FORMULAIRE CRÉATION ==========
    elements.formCreate?.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      if (state.isSubmitting) return;
      
      hideAlert();
      
      const first_name = document.getElementById('ca_first_name')?.value.trim();
      const last_name = document.getElementById('ca_last_name')?.value.trim();
      const email = document.getElementById('ca_email')?.value.trim();
      const phone = document.getElementById('ca_phone')?.value.trim();
      const role = document.getElementById('ca_role')?.value;
      const password = document.getElementById('ca_password')?.value;
      
      // Validations
      if (!first_name || !last_name || !email || !password) {
        showAlert('Tous les champs obligatoires doivent être remplis', 'error');
        return;
      }
      
      if (password.length < CONFIG.PASSWORD_MIN_LENGTH) {
        showAlert(`Le mot de passe doit contenir au moins ${CONFIG.PASSWORD_MIN_LENGTH} caractères`, 'error');
        return;
      }
      
      try {
        state.isSubmitting = true;
        if (elements.submitCreateBtn) {
          elements.submitCreateBtn.disabled = true;
          elements.submitCreateBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Création...';
        }
        
        await api(CONFIG.API.ADMINS, {
          method: 'POST',
          body: JSON.stringify({ first_name, last_name, email, phone, role, password })
        });
        
        showToast('Administrateur créé avec succès', 'success');
        elements.formCreate.reset();
        toggleCreateForm(false);
        await loadAdmins();
        
      } catch (error) {
        showAlert(error.message, 'error');
        showToast(error.message, 'error');
      } finally {
        state.isSubmitting = false;
        if (elements.submitCreateBtn) {
          elements.submitCreateBtn.disabled = false;
          elements.submitCreateBtn.innerHTML = '<i class="fas fa-user-plus mr-2"></i>Créer l\'administrateur';
        }
      }
    });
    
    // ========== RECHERCHE ==========
    elements.searchInput?.addEventListener('input', (e) => {
      state.filters.search = e.target.value;
      renderAdminsTable();
    });
    
    // ========== RAFRAÎCHISSEMENT ==========
    elements.refreshBtn?.addEventListener('click', async () => {
      if (elements.refreshBtn) {
        elements.refreshBtn.disabled = true;
        elements.refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Actualisation...';
      }
      
      await loadAdmins();
      showToast('Données actualisées', 'success', 2000);
      
      if (elements.refreshBtn) {
        setTimeout(() => {
          elements.refreshBtn.disabled = false;
          elements.refreshBtn.innerHTML = '<i class="fas fa-sync-alt mr-2"></i><span class="hidden sm:inline">Actualiser</span>';
        }, 500);
      }
    });
    
    // ========== ACTIONS SUR LE TABLEAU ==========
    elements.tbody?.addEventListener('click', async (e) => {
      const editBtn = e.target.closest('.edit-btn');
      const resetBtn = e.target.closest('.reset-btn');
      const toggleBtn = e.target.closest('.toggle-btn');
      
      if (editBtn) {
        e.stopPropagation();
        const id = editBtn.dataset.id; 
        openEditModal(id);
      }
      
      if (resetBtn) {
        e.stopPropagation();
        const id = resetBtn.dataset.id; 
        const first = resetBtn.dataset.first || '';
        const last = resetBtn.dataset.last || '';
        const email = resetBtn.dataset.email || '';
        
        state.resetAdminId = Number(id);
        
        if (elements.resetTarget) {
          elements.resetTarget.textContent = `${first} ${last} (${email})`.trim();
        }
        
        if (elements.resetModal) {
          elements.resetModal.classList.remove('hidden');
        }
      }
      
      const deleteBtn = e.target.closest('.delete-btn');

      if (deleteBtn) {
        e.stopPropagation();
        const id = deleteBtn.dataset.id;
        const name = deleteBtn.dataset.name || 'cet administrateur';
        const role = deleteBtn.dataset.role || '';

        openConfirmModal({
          title: 'Supprimer l\'administrateur',
          subtitle: 'Cette action est irréversible',
          message: `Voulez-vous supprimer définitivement ${name} ? Son compte et toutes ses données seront effacés.`,
          confirmText: 'Supprimer définitivement',
          confirmIcon: 'fa-trash',
          confirmColor: 'red',
          onConfirm: () => deleteAdmin(id, name)
        });
      }

      if (toggleBtn) {
        e.stopPropagation();
        const id = toggleBtn.dataset.id; 
        const currentActive = toggleBtn.dataset.active === '1';
        const newStatus = !currentActive;
        
        openConfirmModal({
          title: newStatus ? 'Activer l\'administrateur' : 'Désactiver l\'administrateur',
          subtitle: 'Cette action modifiera les accès',
          message: newStatus 
            ? 'Voulez-vous activer cet administrateur ? Il pourra se connecter et accéder à la plateforme.'
            : 'Voulez-vous désactiver cet administrateur ? Il ne pourra plus se connecter.',
          confirmText: newStatus ? 'Activer' : 'Désactiver',
          confirmIcon: newStatus ? 'fa-check-circle' : 'fa-ban',
          confirmColor: newStatus ? 'emerald' : 'amber',
          onConfirm: () => toggleAdminStatus(id, newStatus)
        });
      }
    });
    
    // ========== MODAL RÉINITIALISATION MOT DE PASSE ==========
    elements.resetPassForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const password = elements.rp_password?.value;
      
      if (!state.resetAdminId) {
        showAlert('ID administrateur manquant', 'error');
        return;
      }
      
      if (!password || password.length < CONFIG.PASSWORD_MIN_LENGTH) {
        showAlert(`Le mot de passe doit contenir au moins ${CONFIG.PASSWORD_MIN_LENGTH} caractères`, 'error');
        return;
      }
      
      await resetPassword(state.resetAdminId, password);
    });
    
    // Fermeture modal reset
    elements.closeResetModal?.addEventListener('click', () => {
      elements.resetModal?.classList.add('hidden');
      elements.resetPassForm?.reset();
    });
    
    elements.cancelReset?.addEventListener('click', () => {
      elements.resetModal?.classList.add('hidden');
      elements.resetPassForm?.reset();
    });
    
    // ========== MODAL ÉDITION ==========
    elements.editForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const adminId = Number(elements.editAdminId?.value); 
      const admin = state.admins.find(a => a.id === adminId);
      
      if (!admin) {
        showToast('Administrateur introuvable', 'error');
        return;
      }
      
      const payload = {
        first_name: elements.editFirstName?.value.trim(),
        last_name: elements.editLastName?.value.trim(),
        email: elements.editEmail?.value.trim(),
        phone: elements.editPhone?.value.trim() || null,
        role: elements.editRole?.value
      };
      
      // Validation
      if (!payload.first_name || !payload.last_name || !payload.email) {
        showToast('Les champs prénom, nom et email sont obligatoires', 'error');
        return;
      }
      
      try {
        await api(`${CONFIG.API.ADMINS}/${adminId}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        
        // Mise à jour du mot de passe
        const newPassword = elements.editPassword?.value;
        const confirmPassword = elements.editPasswordConfirm?.value;
        
        if (newPassword || confirmPassword) {
          if (newPassword !== confirmPassword) {
            if (elements.passwordError) {
              elements.passwordError.classList.remove('hidden');
              elements.passwordError.textContent = 'Les mots de passe ne correspondent pas';
            }
            return;
          }
          
          if (newPassword.length < CONFIG.PASSWORD_MIN_LENGTH) {
            if (elements.passwordError) {
              elements.passwordError.classList.remove('hidden');
              elements.passwordError.textContent = `Le mot de passe doit contenir au moins ${CONFIG.PASSWORD_MIN_LENGTH} caractères`;
            }
            return;
          }
          
          await api(`${CONFIG.API.ADMINS}/${adminId}/password`, {
            method: 'PATCH',
            body: JSON.stringify({ password: newPassword })
          });
        }
        
        showToast('Administrateur modifié avec succès', 'success');
        closeEditModal();
        await loadAdmins();
        
      } catch (error) {
        showToast(error.message, 'error');
      }
    });
    
    // Toggle champs mot de passe
    elements.showPasswordBtn?.addEventListener('click', () => {
      if (elements.passwordFields) {
        elements.passwordFields.classList.toggle('hidden');
      }
    });
    
    // Toggle statut dans la modal d'édition
    elements.toggleAdminStatus?.addEventListener('click', async () => {
      const adminId = Number(elements.editAdminId?.value);
      const admin = state.admins.find(a => a.id === adminId);
      
      if (!admin) {
        showToast('Administrateur introuvable', 'error');
        return;
      }
      
      const newStatus = !admin.is_active;
      
      openConfirmModal({
        title: newStatus ? 'Activer l\'administrateur' : 'Désactiver l\'administrateur',
        message: newStatus 
          ? 'Voulez-vous activer cet administrateur ?'
          : 'Voulez-vous désactiver cet administrateur ?',
        confirmText: newStatus ? 'Activer' : 'Désactiver',
        confirmIcon: newStatus ? 'fa-check-circle' : 'fa-ban',
        confirmColor: newStatus ? 'emerald' : 'amber',
        onConfirm: async () => {
          await toggleAdminStatus(adminId, newStatus);
          admin.is_active = newStatus;
          updateStatusToggle(newStatus);
        }
      });
    });
    
    // Fermeture modal édition
    elements.closeEditModal?.addEventListener('click', closeEditModal);
    elements.cancelEditModal?.addEventListener('click', closeEditModal);
    elements.editModalBackdrop?.addEventListener('click', closeEditModal);
    
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
        closeEditModal();
        closeConfirmModal();
        if (elements.resetModal && !elements.resetModal.classList.contains('hidden')) {
          elements.resetModal.classList.add('hidden');
        }
      }
    });
  }

  // ====================================
  // 13. INITIALISATION
  // ====================================
  
  async function init() {
    
    // Charger les admins
    await loadAdmins();
    
    // Initialiser les événements
    initEventListeners();
  }

  // Démarrer l'application
  init();

  // API publique (pour les appels externes si nécessaire)
  return {
    loadAdmins,
    toggleAdminStatus,
    resetPassword,
    updateAdmin,
    openEditModal,
    closeEditModal
  };
})();

// Rendre disponible globalement
window.AdminManager = AdminManager;