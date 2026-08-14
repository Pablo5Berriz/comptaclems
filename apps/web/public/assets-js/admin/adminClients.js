'use strict';

const ClientsManager = (() => {
  // ====================================
  // 1. CONSTANTES & CONFIGURATION
  // ====================================
  
  const CONFIG = {
    API: {
      BASE: '/api/admin',
      CLIENTS: '/clients',
      ME: '/dashboard/me',
      STATS: '/clients/stats'
    },
    AUTH_KEY: 'cc_admin_auth',
    DEBOUNCE_DELAY: 300,
    PAGINATION: {
      DEFAULT_LIMIT: 20,
      LIMITS: [10, 20, 50, 100]
    },
    STATUS: {
      all: { label: 'Tous', color: 'bg-slate-100 text-slate-700' },
      active: { label: 'Actif', color: 'bg-emerald-100 text-emerald-700' },
      inactive: { label: 'Inactif', color: 'bg-red-100 text-red-700' }
    },
    VERIFIED: {
      true: { label: 'Vérifié', color: 'bg-emerald-100 text-emerald-700' },
      false: { label: 'Non vérifié', color: 'bg-slate-100 text-slate-700' }
    },
    CLIENT_TYPES: {
      particulier: { label: 'Particulier', icon: 'fa-user', color: 'type-particulier' },
      travailleur_autonome: { label: 'Travailleur autonome', icon: 'fa-briefcase', color: 'type-autonome' },
      pme: { label: 'PME', icon: 'fa-building', color: 'type-pme' }
    }
  };

  // ====================================
  // 2. STATE MANAGEMENT
  // ====================================
  
  const state = {
    // Pagination
    page: 1,
    limit: CONFIG.PAGINATION.DEFAULT_LIMIT,
    total: 0,
    
    // Filtres
    filters: {
      q: '',
      status: 'all',
      client_type: 'all',
      verified: 'all'
    },
    
    // Données
    clients: [],
    selectedClient: null,
    
    // Utilisateur
    currentUser: null,
    adminRole: '',
    
    // UI
    isLoading: false,
    isSubmitting: false,
    drawerOpen: false
  };

  // ====================================
  // 3. ÉLÉMENTS DOM
  // ====================================
  
  const elements = {
    // Alertes & Toasts
    alert: document.getElementById('pageAlert'),
    toastHost: document.getElementById('toastHost'),
    
    // Filtres
    q: document.getElementById('q'),
    status: document.getElementById('status'),
    clientType: document.getElementById('client_type'),
    limit: document.getElementById('limit'),
    searchBtn: document.getElementById('searchBtn'),
    resetFiltersBtn: document.getElementById('resetFiltersBtn'),
    refreshBtn: document.getElementById('refreshBtn'),
    activeFiltersCount: document.getElementById('activeFiltersCount'),
    activeFiltersTags: document.getElementById('activeFiltersTags'),
    filterTagsContainer: document.getElementById('filterTagsContainer'),
    
    // Table
    tbody: document.getElementById('clientsTbody'),
    totalCount: document.getElementById('totalCount'),
    loadingIndicator: document.getElementById('loadingIndicator'),
    
    // Pagination
    pageInfo: document.getElementById('pageInfo'),
    showingInfo: document.getElementById('showingInfo'),
    prevPage: document.getElementById('prevPage'),
    nextPage: document.getElementById('nextPage'),
    currentPageDisplay: document.getElementById('currentPageDisplay'),
    
    // Stats
    activeClientsCount: document.getElementById('activeClientsCount'),
    newClientsCount: document.getElementById('newClientsCount'),
    
    // Profil admin
    adminName: document.getElementById('adminName'),
    adminRole: document.getElementById('adminRole'),
    adminInitials: document.getElementById('adminInitials'),
    headerAdminName: document.getElementById('headerAdminName'),
    headerAdminRole: document.getElementById('headerAdminRole'),
    headerAdminInitials: document.getElementById('headerAdminInitials'),
    
    // Drawer
    drawer: document.getElementById('drawer'),
    drawerBackdrop: document.getElementById('drawerBackdrop'),
    drawerClose: document.getElementById('drawerClose'),
    drawerSubtitle: document.getElementById('drawerSubtitle'),
    drawerClientType: document.getElementById('drawerClientType'),
    drawerClientStatus: document.getElementById('drawerClientStatus'),
    drawerInitials: document.getElementById('drawerInitials'),
    drawerName: document.getElementById('drawerName'),
    drawerEmail: document.getElementById('drawerEmail'),
    drawerPhone: document.getElementById('drawerPhone'),
    drawerCreatedAt: document.getElementById('drawerCreatedAt'),
    drawerLastLogin: document.getElementById('drawerLastLogin'),
    drawerDeclarationsCount: document.getElementById('drawerDeclarationsCount'),
    drawerTestimonialsCount: document.getElementById('drawerTestimonialsCount'),
    
    // Actions
    toggleActiveBtn: document.getElementById('toggleActiveBtn'),
    toggleActiveBtnText: document.getElementById('toggleActiveBtnText'),
    resetPasswordBtn: document.getElementById('resetPasswordBtn'),
    deleteClientBtn: document.getElementById('deleteClientBtn'),
    
    // Modals
    confirmModal: document.getElementById('confirmModal'),
    confirmTitle: document.getElementById('confirmTitle'),
    confirmSubtitle: document.getElementById('confirmSubtitle'),
    confirmMessage: document.getElementById('confirmMessage'),
    confirmAction: document.getElementById('confirmAction'),
    confirmIcon: document.getElementById('confirmIcon'),
    confirmButtonText: document.getElementById('confirmButtonText'),
    confirmBackdrop: document.getElementById('confirmBackdrop'),
    confirmCancel: document.getElementById('confirmCancel')
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
   * Formate une date relative 
   */
  function formatRelativeDate(dateString) {
    if (!dateString) return '—';
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now - date;
      const diffSec = Math.floor(diffMs / 1000);
      const diffMin = Math.floor(diffSec / 60);
      const diffHour = Math.floor(diffMin / 60);
      const diffDay = Math.floor(diffHour / 24);
      
      if (diffDay === 0) {
        if (diffHour === 0) {
          if (diffMin === 0) return "À l'instant";
          return `Il y a ${diffMin} minute${diffMin > 1 ? 's' : ''}`;
        }
        return `Il y a ${diffHour} heure${diffHour > 1 ? 's' : ''}`;
      }
      if (diffDay === 1) return 'Hier';
      if (diffDay < 7) return `Il y a ${diffDay} jours`;
      
      return formatDate(dateString, { hour: undefined, minute: undefined });
    } catch {
      return '—';
    }
  }

  /**
   * Calcule le nombre total de pages
   */
  function getTotalPages() {
    return Math.max(1, Math.ceil((state.total || 0) / (state.limit || 1)));
  }

  /**
   * Met à jour l'interface de pagination
   */
  function updatePaginationUI() {
    const totalPages = getTotalPages();
    
    if (elements.pageInfo) {
      elements.pageInfo.textContent = `Page ${state.page} sur ${totalPages}`;
    }
    
    if (elements.currentPageDisplay) {
      elements.currentPageDisplay.textContent = state.page;
    }
    
    if (elements.showingInfo) {
      const start = ((state.page - 1) * state.limit) + 1;
      const end = Math.min(state.page * state.limit, state.total);
      
      if (state.total === 0) {
        elements.showingInfo.textContent = 'Aucun client';
      } else {
        elements.showingInfo.textContent = `${start}-${end} sur ${state.total} client${state.total > 1 ? 's' : ''}`;
      }
    }
    
    // État des boutons de pagination
    if (elements.prevPage) {
      elements.prevPage.disabled = state.page <= 1;
      elements.prevPage.classList.toggle('opacity-50', state.page <= 1);
      elements.prevPage.classList.toggle('cursor-not-allowed', state.page <= 1);
    }
    
    if (elements.nextPage) {
      elements.nextPage.disabled = state.page >= totalPages;
      elements.nextPage.classList.toggle('opacity-50', state.page >= totalPages);
      elements.nextPage.classList.toggle('cursor-not-allowed', state.page >= totalPages);
    }
  }

  /**
   * Affiche/masque l'indicateur de chargement
   */
  function setLoading(isLoading) {
    state.isLoading = isLoading;
    
    if (elements.loadingIndicator) {
      elements.loadingIndicator.classList.toggle('hidden', !isLoading);
    }
  }

  // ====================================
  // 5. TOAST & ALERTES
  // ====================================
  
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
  // 6. AUTHENTIFICATION
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

  async function api(path, options = {}) {
    const token = getToken();
    if (!token) {
      showToast('Session expirée', 'error');
      hardLogout();
      throw new Error('Non authentifié');
    }

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    };

    try {
      const res = await fetch(`${CONFIG.API.BASE}${path}`, { 
        ...options, 
        headers 
      });

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
  // 7. CHARGEMENT ADMIN & STATS
  // ====================================
  
  /**
   * Charge les informations de l'administrateur
   */
  async function loadAdminInfo() {
    try {
      const data = await api(CONFIG.API.ME).catch(() => ({ admin: getAuth()?.admin }));
      const admin = data?.admin || getAuth()?.admin;
      
      if (admin) {
        state.currentUser = admin;
        state.adminRole = String(admin.role || '').toLowerCase();
        
        const fullName = `${admin.first_name || ''} ${admin.last_name || ''}`.trim() || admin.email || 'Administrateur';
        const firstName = admin.first_name || 'Admin';
        const initials = (admin.first_name?.[0] || '') + (admin.last_name?.[0] || '') || 'AD';
        
        // Mettre à jour les éléments du profil
        if (elements.adminName) elements.adminName.textContent = fullName;
        if (elements.headerAdminName) elements.headerAdminName.textContent = firstName;
        if (elements.adminInitials) elements.adminInitials.textContent = initials;
        if (elements.headerAdminInitials) elements.headerAdminInitials.textContent = initials;
        
        const roleDisplay = state.adminRole === 'superadmin' ? 'Super Admin' : 
                           state.adminRole === 'admin' ? 'Admin' : 'Support';
        if (elements.adminRole) elements.adminRole.textContent = roleDisplay;
        if (elements.headerAdminRole) {
          elements.headerAdminRole.textContent = state.adminRole === 'superadmin' ? 'Super Administrateur' : 
                                                state.adminRole === 'admin' ? 'Administrateur' : 'Support';
        }
        
        // Cacher le bouton de suppression si pas superadmin
        if (elements.deleteClientBtn) {
          elements.deleteClientBtn.classList.toggle('hidden', state.adminRole !== 'superadmin');
        }
      }
    } catch (error) {
      console.error('Erreur chargement admin:', error);
    }
  }

  /**
   * Charge les statistiques des clients
   */
  async function loadStats() {
    try {
      const data = await api(CONFIG.API.STATS).catch(() => null);
      
      if (data?.stats) {
        if (elements.activeClientsCount) {
          elements.activeClientsCount.textContent = data.stats.active || 0;
        }
        if (elements.newClientsCount) {
          elements.newClientsCount.textContent = data.stats.new_30d || 0;
        }
      }
    } catch (error) {
      console.error('Erreur chargement stats:', error);
    }
  }

  // ====================================
  // 8. GESTION DES FILTRES
  // ====================================
  
  /**
   * Met à jour les filtres depuis le formulaire
   */
  function updateFilters() {
    state.filters = {
      q: elements.q?.value?.trim() || '',
      status: elements.status?.value || 'all',
      client_type: elements.clientType?.value || 'all',
      verified: 'all'
    };
    
    state.page = 1;
    renderActiveFilters();
  }

  /**
   * Réinitialise tous les filtres
   */
  function resetFilters() {
    if (elements.q) elements.q.value = '';
    if (elements.status) elements.status.value = 'all';
    if (elements.clientType) elements.clientType.value = 'all';
    
    state.filters = {
      q: '',
      status: 'all',
      client_type: 'all',
      verified: 'all'
    };
    
    state.page = 1;
    renderActiveFilters();
    loadClients();
    showToast('Filtres réinitialisés', 'success', 2000);
  }

  /**
   * Affiche les filtres actifs sous forme de tags
   */
  function renderActiveFilters() {
    const activeCount = Object.values(state.filters).filter(v => v && v !== 'all' && v !== '').length;
    
    if (elements.activeFiltersCount) {
      elements.activeFiltersCount.textContent = `${activeCount} filtre${activeCount > 1 ? 's' : ''} actif${activeCount > 1 ? 's' : ''}`;
    }
    
    if (activeCount === 0) {
      if (elements.activeFiltersTags) elements.activeFiltersTags.classList.add('hidden');
      return;
    }
    
    if (elements.activeFiltersTags) elements.activeFiltersTags.classList.remove('hidden');
    if (!elements.filterTagsContainer) return;
    
    elements.filterTagsContainer.innerHTML = '';
    
    // Tag recherche
    if (state.filters.q) {
      const tag = createFilterTag('Recherche', state.filters.q, 'q');
      elements.filterTagsContainer.appendChild(tag);
    }
    
    // Tag statut
    if (state.filters.status && state.filters.status !== 'all') {
      const statusLabel = CONFIG.STATUS[state.filters.status]?.label || state.filters.status;
      const tag = createFilterTag('Statut', statusLabel, 'status');
      elements.filterTagsContainer.appendChild(tag);
    }
    
    // Tag type client
    if (state.filters.client_type && state.filters.client_type !== 'all') {
      const typeLabel = CONFIG.CLIENT_TYPES[state.filters.client_type]?.label || state.filters.client_type;
      const tag = createFilterTag('Type', typeLabel, 'client_type');
      elements.filterTagsContainer.appendChild(tag);
    }
  }

  /**
   * Crée un tag de filtre
   */
  function createFilterTag(label, value, filterKey) {
    const tag = document.createElement('span');
    tag.className = 'inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs';
    tag.innerHTML = `
      <span class="text-slate-500">${label}:</span>
      <span class="font-medium text-slate-700">${escapeHtml(value)}</span>
      <button class="remove-filter ml-1 text-slate-400 hover:text-slate-700" data-filter="${filterKey}">
        <i class="fas fa-times"></i>
      </button>
    `;
    
    tag.querySelector('.remove-filter').addEventListener('click', () => {
      removeFilter(filterKey);
    });
    
    return tag;
  }

  /**
   * Supprime un filtre spécifique
   */
  function removeFilter(filterKey) {
    switch (filterKey) {
      case 'q':
        if (elements.q) elements.q.value = '';
        delete state.filters.q;
        break;
      case 'status':
        if (elements.status) elements.status.value = 'all';
        state.filters.status = 'all';
        break;
      case 'client_type':
        if (elements.clientType) elements.clientType.value = 'all';
        state.filters.client_type = 'all';
        break;
    }
    
    state.page = 1;
    renderActiveFilters();
    loadClients();
  }

  // ====================================
  // 9. CHARGEMENT DES CLIENTS
  // ====================================
  
  /**
   * Charge la liste des clients
   */
  async function loadClients() {
    if (state.isLoading) return;
    
    setLoading(true);
    hideAlert();

    try {
      const params = new URLSearchParams();
      params.set('page', String(state.page));
      params.set('limit', String(state.limit));
      
      if (state.filters.q) params.set('q', state.filters.q);
      if (state.filters.status && state.filters.status !== 'all') {
        params.set('status', state.filters.status);
      }
      if (state.filters.client_type && state.filters.client_type !== 'all') {
        params.set('type', state.filters.client_type);
      }

      const data = await api(`${CONFIG.API.CLIENTS}?${params.toString()}`);
      
      state.clients = data?.clients || [];
      state.total = Number(data?.total || 0);
      
      if (elements.totalCount) {
        elements.totalCount.textContent = String(state.total);
      }
      
      updatePaginationUI();
      renderTable();
      
    } catch (error) {
      console.error('Erreur chargement clients:', error);
      showAlert(error.message, 'error');
      showToast(error.message, 'error');
      
      state.clients = [];
      state.total = 0;
      renderError(error.message);
    } finally {
      setLoading(false);
    }
  }

  /**
   * Affiche le tableau des clients
   */
  function renderTable() {
    if (!elements.tbody) return;
    
    if (state.clients.length === 0) {
      renderEmpty();
      return;
    }
    
    elements.tbody.innerHTML = state.clients.map(client => {
      const fullName = `${client.first_name || ''} ${client.last_name || ''}`.trim() || 'Sans nom';
      const email = client.email || client.account_email || client.client_email || '—';
      const phone = client.phone || '—';
      const isActive = client.is_active !== false;
      const isVerified = !!client.email_verified;
      
      const type = client.type || 'particulier';
      const typeConfig = CONFIG.CLIENT_TYPES[type] || CONFIG.CLIENT_TYPES.particulier;
      const initials = (client.first_name?.[0] || '') + (client.last_name?.[0] || '') || 'CL';
      
      return `
        <tr class="client-row hover:bg-slate-50 transition border-b border-slate-100" data-id="${client.id}">
          <td class="px-6 py-4">
            <div class="flex items-center gap-3">
              <div class="relative flex-shrink-0">
                <div class="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold text-sm">
                  ${escapeHtml(initials)}
                </div>
                <span class="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${isActive ? 'bg-emerald-500' : 'bg-slate-400'}"></span>
              </div>
              <div>
                <div class="font-semibold text-slate-900 flex items-center gap-2">
                  ${escapeHtml(fullName)}
                  <!-- ✅ CACHÉ TEMPORAIREMENT: Type client si la colonne existe -->
                </div>
                <div class="text-xs text-slate-500 mt-0.5">ID: ${client.id}</div>
              </div>
            </div>
          </td>
          <td class="px-6 py-4">
            <div class="flex flex-col">
              <span class="text-sm font-medium text-slate-900">${escapeHtml(email)}</span>
            </div>
          </td>
          <td class="px-6 py-4 text-slate-700">${escapeHtml(phone)}</td>
          <td class="px-6 py-4">
            <span class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium ${isVerified ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}">
              <i class="fas ${isVerified ? 'fa-check-circle' : 'fa-clock'} text-xs"></i>
              ${isVerified ? 'Vérifié' : 'Non vérifié'}
            </span>
          </td>
          <td class="px-6 py-4">
            <div class="flex flex-col">
              <span class="text-sm text-slate-700">${formatDate(client.last_login_at)}</span>
              <span class="text-xs text-slate-400 mt-0.5">${formatRelativeDate(client.last_login_at)}</span>
            </div>
          </td>
          <td class="px-6 py-4">
            <span class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium ${isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}">
              <i class="fas ${isActive ? 'fa-check-circle' : 'fa-ban'} text-xs"></i>
              ${isActive ? 'Actif' : 'Inactif'}
            </span>
          </td>
          <td class="px-6 py-4 text-right">
            <div class="flex items-center justify-end gap-2">
              <button 
                class="view-btn px-3 py-2 bg-white border-2 border-slate-200 rounded-xl hover:bg-slate-50 transition flex items-center gap-1.5 text-slate-700 shadow-sm"
                data-id="${client.id}"
                data-tooltip="Voir les détails"
              >
                <i class="fas fa-eye text-xs"></i>
                <span class="hidden sm:inline text-xs">Détails</span>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  /**
   * Affiche un état vide
   */
  function renderEmpty() {
    if (!elements.tbody) return;
    
    elements.tbody.innerHTML = `
      <tr>
        <td colspan="7" class="px-6 py-16 text-center">
          <div class="flex flex-col items-center gap-4">
            <div class="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center">
              <i class="fas fa-users text-3xl text-slate-400"></i>
            </div>
            <div>
              <p class="text-lg font-medium text-slate-900">Aucun client trouvé</p>
              <p class="text-sm text-slate-500 mt-1">Essayez de modifier vos filtres</p>
            </div>
            <button onclick="document.getElementById('resetFiltersBtn').click()" class="mt-2 px-6 py-3 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition flex items-center gap-2">
              <i class="fas fa-rotate-left"></i>
              Réinitialiser les filtres
            </button>
          </div>
        </td>
      </tr>
    `;
  }

  /**
   * Affiche une erreur
   */
  function renderError(message) {
    if (!elements.tbody) return;
    
    elements.tbody.innerHTML = `
      <tr>
        <td colspan="7" class="px-6 py-16 text-center">
          <div class="flex flex-col items-center gap-4">
            <div class="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center">
              <i class="fas fa-exclamation-triangle text-3xl text-red-600"></i>
            </div>
            <div>
              <p class="text-lg font-medium text-slate-900">Erreur de chargement</p>
              <p class="text-sm text-slate-500 mt-1">${escapeHtml(message)}</p>
            </div>
            <button onclick="window.location.reload()" class="mt-2 px-6 py-3 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition flex items-center gap-2">
              <i class="fas fa-sync-alt"></i>
              Réessayer
            </button>
          </div>
        </td>
      </tr>
    `;
  }

  // ====================================
  // 10. DRAWER - DÉTAILS CLIENT
  // ====================================
  
  /**
   * Ouvre le drawer des détails client
   */
  function openDrawer() {
    if (elements.drawerBackdrop) {
      elements.drawerBackdrop.classList.remove('hidden');
    }
    if (elements.drawer) {
      elements.drawer.classList.remove('translate-x-full');
      elements.drawer.classList.add('open');
    }
    document.body.style.overflow = 'hidden';
    state.drawerOpen = true;
  }

  /**
   * Ferme le drawer
   */
  function closeDrawer() {
    if (elements.drawerBackdrop) {
      elements.drawerBackdrop.classList.add('hidden');
    }
    if (elements.drawer) {
      elements.drawer.classList.add('translate-x-full');
      elements.drawer.classList.remove('open');
    }
    document.body.style.overflow = '';
    state.drawerOpen = false;
    state.selectedClient = null;
  }

  /**
   * Affiche les détails du client dans le drawer
   */
  function renderDrawer(client) {
    if (!client) return;
    
    const fullName = `${client.first_name || ''} ${client.last_name || ''}`.trim() || 'Sans nom';
    const email = client.email || client.account_email || '—';
    const phone = client.phone || '—';
    const isActive = client.is_active !== false;
    
    const type = client.type || 'particulier';
    const typeConfig = CONFIG.CLIENT_TYPES[type] || CONFIG.CLIENT_TYPES.particulier;
    const initials = (client.first_name?.[0] || '') + (client.last_name?.[0] || '') || 'CL';
    
    // Informations générales
    if (elements.drawerSubtitle) {
      elements.drawerSubtitle.textContent = `ID: ${client.id}`;
    }
    
    if (elements.drawerName) {
      elements.drawerName.textContent = fullName;
    }
    
    if (elements.drawerEmail) {
      elements.drawerEmail.textContent = email;
    }
    
    if (elements.drawerPhone) {
      elements.drawerPhone.textContent = phone;
    }
    
    if (elements.drawerInitials) {
      elements.drawerInitials.textContent = initials;
    }
    
    if (elements.drawerClientType) {
      // Temporairement caché en attendant la migration
      elements.drawerClientType.classList.add('hidden');
    }
    
    // Statut
    if (elements.drawerClientStatus) {
      elements.drawerClientStatus.className = isActive ? 'status-active' : 'status-inactive';
      elements.drawerClientStatus.innerHTML = `
        <i class="fas ${isActive ? 'fa-check-circle' : 'fa-ban'}"></i>
        ${isActive ? 'Actif' : 'Inactif'}
      `;
    }
    
    // Dates
    if (elements.drawerCreatedAt) {
      elements.drawerCreatedAt.textContent = formatDate(client.created_at, { hour: '2-digit', minute: '2-digit' });
    }
    
    if (elements.drawerLastLogin) {
      elements.drawerLastLogin.textContent = client.last_login_at 
        ? formatDate(client.last_login_at, { hour: '2-digit', minute: '2-digit' })
        : 'Jamais connecté';
    }
    
    // Statistiques
    if (elements.drawerDeclarationsCount) {
      elements.drawerDeclarationsCount.textContent = client.declarations_count || '0';
    }
    
    if (elements.drawerTestimonialsCount) {
      elements.drawerTestimonialsCount.textContent = client.testimonials_count || '0';
    }
    
    // Bouton d'activation/désactivation
    if (elements.toggleActiveBtn) {
      const btnText = elements.toggleActiveBtnText;
      if (btnText) btnText.textContent = isActive ? 'Désactiver' : 'Réactiver';
      
      elements.toggleActiveBtn.dataset.active = isActive ? 'true' : 'false';
      
      if (isActive) {
        elements.toggleActiveBtn.classList.remove('bg-emerald-600', 'hover:bg-emerald-700', 'text-white');
        elements.toggleActiveBtn.classList.add('bg-white', 'border-2', 'border-slate-200', 'text-slate-700', 'hover:bg-red-50', 'hover:text-red-700', 'hover:border-red-200');
      } else {
        elements.toggleActiveBtn.classList.remove('bg-white', 'border-2', 'border-slate-200', 'text-slate-700', 'hover:bg-red-50', 'hover:text-red-700', 'hover:border-red-200');
        elements.toggleActiveBtn.classList.add('bg-emerald-600', 'hover:bg-emerald-700', 'text-white');
      }
    }
  }

  /**
   * Charge et affiche les détails d'un client
   */
  async function viewClient(clientId) {
    if (state.isLoading) return;
    
    setLoading(true);
    
    try {
      const data = await api(`${CONFIG.API.CLIENTS}/${encodeURIComponent(String(clientId))}`);
      const client = data?.client;
      
      if (!client) throw new Error('Client introuvable');
      
      state.selectedClient = {
        ...client,
        id: Number(client.id)
      };
      
      renderDrawer(state.selectedClient);
      openDrawer();
      
    } catch (error) {
      console.error('Erreur chargement client:', error);
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  // ====================================
  // 11. ACTIONS SUR LES CLIENTS
  // ====================================
  
  /**
   * Active/désactive un client
   */
  async function toggleClientStatus() {
    if (!state.selectedClient) return;
    
    const clientId = state.selectedClient.id;
    const isCurrentlyActive = state.selectedClient.is_active !== false;
    const newStatus = !isCurrentlyActive;
    
    openConfirmModal({
      title: newStatus ? 'Réactiver le client' : 'Désactiver le client',
      subtitle: newStatus ? 'Rétablissement des accès' : 'Cette action peut être inversée',
      message: newStatus 
        ? 'Voulez-vous réactiver ce client ? Il pourra à nouveau se connecter.'
        : 'Voulez-vous désactiver ce client ? Il ne pourra plus se connecter.',
      confirmText: newStatus ? 'Réactiver' : 'Désactiver',
      confirmIcon: newStatus ? 'fa-check-circle' : 'fa-ban',
      confirmColor: newStatus ? 'emerald' : 'amber',
      onConfirm: async () => {
        try {
          setLoading(true);
          
          await api(`${CONFIG.API.CLIENTS}/${clientId}/active`, {
            method: 'PATCH',
            body: JSON.stringify({ is_active: newStatus })
          });
          
          showToast(newStatus ? 'Client réactivé avec succès' : 'Client désactivé avec succès', 'success');
          
          // Mettre à jour le client sélectionné
          state.selectedClient.is_active = newStatus;
          renderDrawer(state.selectedClient);
          
          // Recharger la liste
          await loadClients();
          
        } catch (error) {
          showToast(error.message, 'error');
        } finally {
          setLoading(false);
          closeConfirmModal();
        }
      }
    });
  }

  /**
  * Réinitialise le mot de passe du client
  */
  async function resetClientPassword() {
    if (!state.selectedClient) return;
    
    const clientEmail = state.selectedClient.email || 
                        state.selectedClient.account_email || 
                        state.selectedClient.client_email || 
                        '';
    
    const clientName = `${state.selectedClient.first_name || ''} ${state.selectedClient.last_name || ''}`.trim() || 'Client';
    
    if (!clientEmail) {
      showToast('❌ Ce client n\'a pas d\'adresse email', 'error');
      return;
    }
    
    openConfirmModal({
      title: 'Réinitialiser le mot de passe',
      subtitle: 'Un email sera envoyé au client',
      message: `Voulez-vous envoyer un lien de réinitialisation à <strong>${escapeHtml(clientEmail)}</strong> ?`,
      confirmText: 'Envoyer le lien',
      confirmIcon: 'fa-paper-plane',
      confirmColor: 'blue',
      onConfirm: async () => {
        try {
          setLoading(true);
          
          // Appel API pour réinitialiser le mot de passe
          const response = await api(`${CONFIG.API.CLIENTS}/${state.selectedClient.id}/reset-password`, {
            method: 'POST',
            body: JSON.stringify({ 
              email: clientEmail,
              clientName: clientName,
              sendEmail: true
            })
          });
          
          if (response.success) {
            showToast('✅ Email de réinitialisation envoyé avec succès', 'success');
            
            // Optionnel: Ajouter une notification dans l'historique du client
            console.log(`Email de réinitialisation envoyé à ${clientEmail} (client #${state.selectedClient.id})`);
          } else {
            throw new Error(response.error || 'Erreur lors de l\'envoi');
          }
          
        } catch (error) {
          console.error('Erreur réinitialisation:', error);
          showToast(`❌ Erreur: ${error.message}`, 'error');
        } finally {
          setLoading(false);
          closeConfirmModal();
        }
      }
    });
  }

  /**
   * Supprime définitivement un client
   */
  async function deleteClient() {
    if (!state.selectedClient) return;
    
    if (state.adminRole !== 'superadmin') {
      showToast('Action réservée au Super Administrateur', 'error');
      return;
    }
    
    const clientEmail = state.selectedClient.email || state.selectedClient.account_email || state.selectedClient.client_email || '';
    const clientName = `${state.selectedClient.first_name || ''} ${state.selectedClient.last_name || ''}`.trim() || clientEmail;
    
    openConfirmModal({
      title: '⚠️ Suppression définitive',
      subtitle: 'Cette action est irréversible',
      message: `Voulez-vous vraiment supprimer définitivement le client "${clientName}" ? Toutes ses données (déclarations, documents, témoignages) seront également supprimées.`,
      confirmText: 'Supprimer',
      confirmIcon: 'fa-trash-alt',
      confirmColor: 'red',
      onConfirm: async () => {
        try {
          setLoading(true);
          
          await api(`${CONFIG.API.CLIENTS}/${state.selectedClient.id}`, {
            method: 'DELETE'
          });
          
          showToast('Client supprimé avec succès', 'success');
          closeDrawer();
          await loadClients();
          
        } catch (error) {
          showToast(error.message, 'error');
        } finally {
          setLoading(false);
          closeConfirmModal();
        }
      }
    });
  }

  // ====================================
  // 12. MODAL DE CONFIRMATION
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
  // 13. INITIALISATION DES ÉVÉNEMENTS
  // ====================================
  
  function initEventListeners() {
    // ========== FILTRES ==========
    elements.searchBtn?.addEventListener('click', () => {
      updateFilters();
      loadClients();
      showToast('Filtres appliqués', 'success', 2000);
    });
    
    elements.q?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        updateFilters();
        loadClients();
      }
    });
    
    elements.status?.addEventListener('change', () => {
      updateFilters();
      loadClients();
    });
    
    elements.clientType?.addEventListener('change', () => {
      updateFilters();
      loadClients();
    });
    
    elements.limit?.addEventListener('change', () => {
      state.limit = parseInt(elements.limit.value, 10) || 20;
      state.page = 1;
      loadClients();
    });
    
    elements.resetFiltersBtn?.addEventListener('click', resetFilters);
    
    elements.refreshBtn?.addEventListener('click', () => {
      if (elements.refreshBtn) {
        elements.refreshBtn.disabled = true;
        elements.refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Actualisation...';
      }
      
      loadClients().finally(() => {
        setTimeout(() => {
          if (elements.refreshBtn) {
            elements.refreshBtn.disabled = false;
            elements.refreshBtn.innerHTML = '<i class="fas fa-sync-alt mr-2"></i><span class="hidden sm:inline">Actualiser</span>';
          }
        }, 500);
      });
      
      showToast('Données actualisées', 'success', 2000);
    });
    
    // ========== PAGINATION ==========
    elements.prevPage?.addEventListener('click', () => {
      if (state.page > 1) {
        state.page--;
        loadClients();
      }
    });
    
    elements.nextPage?.addEventListener('click', () => {
      if (state.page < getTotalPages()) {
        state.page++;
        loadClients();
      }
    });
    
    // ========== TABLEAU ==========
    elements.tbody?.addEventListener('click', (e) => {
      const viewBtn = e.target.closest('.view-btn');
      const row = e.target.closest('.client-row');
      
      if (viewBtn) {
        e.stopPropagation();
        const id = viewBtn.dataset.id;
        viewClient(id);
      } else if (row) {
        const id = row.dataset.id;
        viewClient(id);
      }
    });
    
    // ========== DRAWER ==========
    elements.drawerClose?.addEventListener('click', closeDrawer);
    elements.drawerBackdrop?.addEventListener('click', closeDrawer);
    
    // ========== ACTIONS CLIENT ==========
    elements.toggleActiveBtn?.addEventListener('click', toggleClientStatus);
    elements.resetPasswordBtn?.addEventListener('click', resetClientPassword);
    elements.deleteClientBtn?.addEventListener('click', deleteClient);
    
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
        if (state.drawerOpen) {
          closeDrawer();
        }
        if (!elements.confirmModal?.classList.contains('hidden')) {
          closeConfirmModal();
        }
      }
    });
  }

  // ====================================
  // 14. INITIALISATION
  // ====================================
  
  async function init() {
    
    // Initialiser l'état
    state.limit = parseInt(elements.limit?.value || '20', 10) || 20;
    state.filters.status = elements.status?.value || 'all';
    state.filters.client_type = elements.clientType?.value || 'all';
    
    // Charger les données
    await loadAdminInfo();
    await loadStats();
    await loadClients();
    
    // Initialiser les événements
    initEventListeners();
  }

  // Démarrer l'application
  init();

  // API publique
  return {
    loadClients,
    viewClient,
    closeDrawer,
    resetFilters
  };
})();

// Rendre disponible globalement
window.ClientsManager = ClientsManager;