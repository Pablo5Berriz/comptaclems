// /assets-js/admin/adminTemoignages.js
'use strict';

const TemoignagesManager = (() => {
  // ====================================
  // 1. CONSTANTES & CONFIGURATION
  // ====================================
  
  const CONFIG = {
    API: {
      BASE: '/api/admin',
      TEMOIGNAGES: '/temoignages',
      ME: '/dashboard/me',
      STATS: '/temoignages/stats'
    },
    AUTH_KEY: 'cc_admin_auth',
    DEBOUNCE_DELAY: 300,
    PAGINATION: {
      DEFAULT_LIMIT: 20,
      LIMITS: [10, 20, 50, 100]
    },
    STATUS: {
      all: { label: 'Tous', color: 'bg-slate-100 text-slate-700' },
      pending: { label: 'En attente', color: 'status-pending', icon: 'fa-clock' },
      published: { label: 'Publié', color: 'status-published', icon: 'fa-check-circle' },
      rejected: { label: 'Rejeté', color: 'status-rejected', icon: 'fa-times-circle' }
    },
    RATINGS: {
      1: { label: '⭐', text: 'Très insatisfait' },
      2: { label: '⭐⭐', text: 'Insatisfait' },
      3: { label: '⭐⭐⭐', text: 'Neutre' },
      4: { label: '⭐⭐⭐⭐', text: 'Satisfait' },
      5: { label: '⭐⭐⭐⭐⭐', text: 'Très satisfait' }
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
    pages: 1,
    
    // Filtres
    filters: {
      q: '',
      status: 'all',
      rating: 0
    },
    
    // Données
    temoignages: [],
    selectedTemoignage: null,
    
    // Utilisateur
    currentUser: null,
    adminRole: '',
    
    // UI
    isLoading: false,
    isSubmitting: false,
    modalOpen: false
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
    rating: document.getElementById('rating'),
    limit: document.getElementById('limit'),
    searchBtn: document.getElementById('searchBtn'),
    resetFiltersBtn: document.getElementById('resetFiltersBtn'),
    refreshBtn: document.getElementById('refreshBtn'),
    activeFiltersCount: document.getElementById('activeFiltersCount'),
    activeFiltersTags: document.getElementById('activeFiltersTags'),
    filterTagsContainer: document.getElementById('filterTagsContainer'),
    
    // Table
    tbody: document.getElementById('rowsTbody'),
    totalCount: document.getElementById('totalCount'),
    loadingIndicator: document.getElementById('loadingIndicator'),
    
    // Stats
    pendingCount: document.getElementById('pendingCount'),
    publishedCount: document.getElementById('publishedCount'),
    avgRating: document.getElementById('avgRating'),
    
    // Pagination
    pageInfo: document.getElementById('pageInfo'),
    showingInfo: document.getElementById('showingInfo'),
    prevPage: document.getElementById('prevPage'),
    nextPage: document.getElementById('nextPage'),
    currentPageDisplay: document.getElementById('currentPageDisplay'),
    
    // Profil admin
    adminName: document.getElementById('adminName'),
    adminRole: document.getElementById('adminRole'),
    adminInitials: document.getElementById('adminInitials'),
    headerAdminName: document.getElementById('headerAdminName'),
    headerAdminRole: document.getElementById('headerAdminRole'),
    headerAdminInitials: document.getElementById('headerAdminInitials'),
    
    // Modal
    testimonialModal: document.getElementById('testimonialModal'),
    modalBackdrop: document.getElementById('modalBackdrop'),
    closeModal: document.getElementById('closeModal'),
    modalTitle: document.getElementById('modalTitle'),
    testimonialId: document.getElementById('testimonialId'),
    testimonialAuthor: document.getElementById('testimonialAuthor'),
    testimonialContent: document.getElementById('testimonialContent'),
    publishBtn: document.getElementById('publishBtn'),
    unpublishBtn: document.getElementById('unpublishBtn'),
    rejectBtn: document.getElementById('rejectBtn'),
    deleteBtn: document.getElementById('deleteBtn'),
    
    // Confirmation Modal
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
          if (diffMin === 1) return "Il y a 1 minute";
          return `Il y a ${diffMin} minutes`;
        }
        if (diffHour === 1) return "Il y a 1 heure";
        return `Il y a ${diffHour} heures`;
      }
      if (diffDay === 1) return 'Hier';
      if (diffDay < 7) return `Il y a ${diffDay} jours`;
      
      return formatDate(dateString, { hour: undefined, minute: undefined });
    } catch {
      return '—';
    }
  }

  /**
   * Génère l'affichage des étoiles pour une note
   */
  function renderStars(rating) {
    const stars = [];
    const fullStars = Math.floor(rating || 0);
    const hasHalfStar = (rating || 0) % 1 >= 0.5;
    
    for (let i = 0; i < 5; i++) {
      if (i < fullStars) {
        stars.push('<i class="fas fa-star rating-star-filled"></i>');
      } else if (i === fullStars && hasHalfStar) {
        stars.push('<i class="fas fa-star-half-alt rating-star-filled"></i>');
      } else {
        stars.push('<i class="far fa-star rating-star-empty"></i>');
      }
    }
    
    return `<span class="rating-stars">${stars.join('')}</span>`;
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
        elements.showingInfo.textContent = 'Aucun témoignage';
      } else {
        elements.showingInfo.textContent = `${start}-${end} sur ${state.total} témoignage${state.total > 1 ? 's' : ''}`;
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
      }
    } catch (error) {
      console.error('Erreur chargement admin:', error);
    }
  }

  /**
   * Charge les statistiques des témoignages
   */
  async function loadStats() {
    try {
      const data = await api(CONFIG.API.STATS).catch(() => null);
      
      if (data?.stats) {
        if (elements.pendingCount) {
          elements.pendingCount.textContent = data.stats.pending || 0;
        }
        if (elements.publishedCount) {
          elements.publishedCount.textContent = data.stats.published || 0;
        }
        if (elements.avgRating) {
          elements.avgRating.textContent = (data.stats.avg_rating || 0).toFixed(1);
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
   * Construit la query string pour l'API
   */
  function buildQuery() {
    const params = new URLSearchParams();
    params.set('page', String(state.page));
    params.set('limit', String(state.limit));
    
    if (state.filters.q) params.set('q', state.filters.q);
    if (state.filters.status && state.filters.status !== 'all') {
      params.set('status', state.filters.status);
    }
    if (state.filters.rating > 0) {
      params.set('min_rating', String(state.filters.rating));
    }
    
    return params.toString();
  }

  /**
   * Met à jour les filtres depuis le formulaire
   */
  function updateFilters() {
    state.filters = {
      q: elements.q?.value?.trim() || '',
      status: elements.status?.value || 'all',
      rating: parseInt(elements.rating?.value || '0', 10) || 0
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
    if (elements.rating) elements.rating.value = '0';
    
    state.filters = {
      q: '',
      status: 'all',
      rating: 0
    };
    
    state.page = 1;
    renderActiveFilters();
    loadTemoignages();
    showToast('Filtres réinitialisés', 'success', 2000);
  }

  /**
   * Affiche les filtres actifs sous forme de tags
   */
  function renderActiveFilters() {
    const activeCount = Object.values(state.filters).filter(v => v && v !== 'all' && v !== 0).length;
    
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
    
    // Tag note
    if (state.filters.rating > 0) {
      const ratingLabel = `${state.filters.rating} étoile${state.filters.rating > 1 ? 's' : ''} et plus`;
      const tag = createFilterTag('Note min.', ratingLabel, 'rating');
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
      case 'rating':
        if (elements.rating) elements.rating.value = '0';
        state.filters.rating = 0;
        break;
    }
    
    state.page = 1;
    renderActiveFilters();
    loadTemoignages();
  }

  // ====================================
  // 9. CHARGEMENT DES TÉMOIGNAGES
  // ====================================
  
  /**
   * Extrait le nom de l'auteur
   */
  function getAuthorName(testimonial) {
    const dn = String(testimonial?.display_name || '').trim();
    if (dn) return dn;
    
    const fn = String(testimonial?.first_name || '').trim();
    const ln = String(testimonial?.last_name || '').trim();
    const full = `${fn} ${ln}`.trim();
    return full || 'Client';
  }

  /**
   * Extrait le contenu du témoignage
   */
  function getContent(testimonial) {
    const s = String(testimonial?.short_quote || '').trim();
    if (s) return s;
    const f = String(testimonial?.full_text || '').trim();
    return f || 'Aucun contenu';
  }

  /**
   * Charge la liste des témoignages
   */
  async function loadTemoignages() {
    if (state.isLoading) return;
    
    setLoading(true);
    hideAlert();

    if (!elements.tbody) return;

    elements.tbody.innerHTML = `
      <tr>
        <td colspan="7" class="px-6 py-12 text-center">
          <div class="flex flex-col items-center gap-4">
            <div class="relative">
              <div class="w-16 h-16 rounded-full border-4 border-slate-200 border-t-slate-900 animate-spin"></div>
              <i class="fas fa-comment absolute inset-0 flex items-center justify-center text-slate-400 text-xl"></i>
            </div>
            <div>
              <p class="text-lg font-medium text-slate-900">Chargement des témoignages</p>
              <p class="text-sm text-slate-500 mt-1">Veuillez patienter...</p>
            </div>
          </div>
        </td>
      </tr>
    `;

    try {
      const data = await api(`${CONFIG.API.TEMOIGNAGES}?${buildQuery()}`);
      
      state.temoignages = data?.rows || [];
      state.total = Number(data?.total || 0);
      state.pages = Number(data?.pages || 1);
      state.page = Math.min(Math.max(1, Number(data?.page || 1)), state.pages);
      
      // Mettre à jour l'affichage
      if (elements.totalCount) {
        elements.totalCount.textContent = String(state.total);
      }
      
      updatePaginationUI();
      
      if (state.temoignages.length === 0) {
        renderEmpty();
        return;
      }
      
      renderTable();
      
      // Charger les stats
      await loadStats();
      
    } catch (error) {
      console.error('Erreur chargement témoignages:', error);
      showAlert(error.message, 'error');
      showToast(error.message, 'error');
      
      renderError(error.message);
    } finally {
      setLoading(false);
    }
  }

  /**
   * Affiche le tableau des témoignages
   */
  function renderTable() {
    if (!elements.tbody) return;
    
    elements.tbody.innerHTML = state.temoignages.map(t => {
      const author = escapeHtml(getAuthorName(t));
      const email = t.author_email || t.email || '—';
      const content = escapeHtml(getContent(t));
      const shortContent = content.length > 100 ? content.substring(0, 100) + '…' : content;
      const rating = t.rating || 0;
      const stars = renderStars(rating);
      const created = formatDate(t.created_at);
      const relativeDate = formatRelativeDate(t.created_at);
      const isPublished = t.status === 'published';
      const status = t.status || 'pending';
      const statusConfig = CONFIG.STATUS[status];
      
      return `
        <tr class="testimonial-row hover:bg-slate-50 transition border-b border-slate-100" data-id="${t.id}">
          <td class="px-6 py-4">
            <div class="flex items-center gap-3">
              <div class="relative flex-shrink-0">
                <div class="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold text-sm">
                  ${escapeHtml(author.charAt(0).toUpperCase() || 'C')}
                </div>
              </div>
              <div>
                <div class="font-semibold text-slate-900">${author}</div>
                ${t.job_title ? `<div class="text-xs text-slate-500 mt-0.5">${escapeHtml(t.job_title)}</div>` : ''}
              </div>
            </div>
          </td>
          <td class="px-6 py-4">
            <div class="flex flex-col">
              <span class="text-sm text-slate-900">${escapeHtml(email)}</span>
            </div>
          </td>
          <td class="px-6 py-4">
            <div class="flex flex-col">
              <div class="mb-1">${stars}</div>
              <span class="text-xs text-slate-500">${CONFIG.RATINGS[rating]?.text || ''}</span>
            </div>
          </td>
          <td class="px-6 py-4">
            <div class="testimonial-content text-sm text-slate-700" title="${escapeHtml(content)}">
              ${escapeHtml(shortContent)}
            </div>
          </td>
          <td class="px-6 py-4">
            <span class="${statusConfig.color} inline-flex items-center gap-1.5">
              <i class="fas ${statusConfig.icon} text-xs"></i>
              ${statusConfig.label}
            </span>
          </td>
          <td class="px-6 py-4">
            <div class="flex flex-col">
              <span class="text-sm text-slate-700">${created}</span>
              <span class="text-xs text-slate-400 mt-0.5">${relativeDate}</span>
            </div>
          </td>
          <td class="px-6 py-4 text-right">
            <div class="flex items-center justify-end gap-2">
              <button 
                class="view-btn px-3 py-2 bg-white border-2 border-slate-200 rounded-xl hover:bg-slate-50 transition flex items-center gap-1.5 text-slate-700 shadow-sm"
                data-id="${t.id}"
                data-tooltip="Voir les détails"
              >
                <i class="fas fa-eye text-xs"></i>
                <span class="hidden sm:inline text-xs">Détails</span>
              </button>
              
              <button 
                class="publish-btn px-3 py-2 ${isPublished ? 'bg-amber-50 border-2 border-amber-200 text-amber-700 hover:bg-amber-100' : 'bg-emerald-50 border-2 border-emerald-200 text-emerald-700 hover:bg-emerald-100'} rounded-xl transition flex items-center gap-1.5 text-xs font-medium"
                data-id="${t.id}"
                data-publish="${isPublished ? '0' : '1'}"
                data-tooltip="${isPublished ? 'Dépublier' : 'Publier'}"
              >
                <i class="fas ${isPublished ? 'fa-eye-slash' : 'fa-eye'} text-xs"></i>
                <span>${isPublished ? 'Dépublier' : 'Publier'}</span>
              </button>
              
              <button 
                class="delete-btn px-3 py-2 bg-white border-2 border-red-200 text-red-700 hover:bg-red-50 hover:border-red-300 rounded-xl transition flex items-center gap-1.5 text-xs font-medium"
                data-id="${t.id}"
                data-tooltip="Supprimer"
              >
                <i class="fas fa-trash-alt text-xs"></i>
                <span class="hidden sm:inline">Supprimer</span>
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
              <i class="fas fa-comments text-3xl text-slate-400"></i>
            </div>
            <div>
              <p class="text-lg font-medium text-slate-900">Aucun témoignage trouvé</p>
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
  // 10. MODAL - DÉTAILS TÉMOIGNAGE
  // ====================================
  
  /**
   * Ouvre la modal des détails
   */
  async function openModal(testimonialId) {
    let testimonial = state.temoignages.find(t => t.id === Number(testimonialId));

    // Si non trouvé dans l'état local (filtres actifs / pagination), charger depuis l'API
    if (!testimonial) {
      try {
        testimonial = await api(`${CONFIG.API.TEMOIGNAGES}/${testimonialId}`);
      } catch (e) {
        showToast('Témoignage introuvable', 'error');
        return;
      }
    }

    if (!testimonial) {
      showToast('Témoignage introuvable', 'error');
      return;
    }
    
    state.selectedTemoignage = testimonial;
    
    // Mettre à jour le contenu de la modal
    if (elements.testimonialId) {
      elements.testimonialId.textContent = `#${testimonial.id}`;
    }
    
    if (elements.testimonialAuthor) {
      elements.testimonialAuthor.textContent = getAuthorName(testimonial);
    }
    
    // Rendu du contenu détaillé
    if (elements.testimonialContent) {
      const author = escapeHtml(getAuthorName(testimonial));
      const email = testimonial.author_email || testimonial.email || '—';
      const content = escapeHtml(getContent(testimonial));
      const rating = testimonial.rating || 0;
      const stars = renderStars(rating);
      const created = formatDate(testimonial.created_at, { 
        weekday: 'long',
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        hour: '2-digit', 
        minute: '2-digit' 
      });
      const isPublished = testimonial.status === 'published';
      
      elements.testimonialContent.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- Auteur -->
          <div class="bg-slate-50 p-5 rounded-2xl border border-slate-200">
            <div class="flex items-start gap-4">
              <div class="w-12 h-12 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold text-lg">
                ${escapeHtml(author.charAt(0).toUpperCase())}
              </div>
              <div>
                <p class="text-xs text-slate-500 uppercase tracking-wider font-semibold">Auteur</p>
                <p class="text-lg font-bold text-slate-900 mt-1">${author}</p>
                ${testimonial.job_title ? `<p class="text-sm text-slate-600 mt-0.5">${escapeHtml(testimonial.job_title)}</p>` : ''}
              </div>
            </div>
          </div>
          
          <!-- Note -->
          <div class="bg-slate-50 p-5 rounded-2xl border border-slate-200">
            <p class="text-xs text-slate-500 uppercase tracking-wider font-semibold">Note</p>
            <div class="flex items-center gap-3 mt-2">
              <span class="text-3xl font-bold text-slate-900">${rating}</span>
              <span class="text-sm text-slate-600">/ 5</span>
              <div class="ml-2">${stars}</div>
            </div>
            <p class="text-sm text-slate-600 mt-1">${CONFIG.RATINGS[rating]?.text || ''}</p>
          </div>
        </div>
        
        <!-- Email -->
        <div class="bg-white p-5 rounded-2xl border border-slate-200">
          <p class="text-xs text-slate-500 uppercase tracking-wider font-semibold">Email</p>
          <p class="text-lg font-bold text-slate-900 mt-1">${escapeHtml(email)}</p>
        </div>
        
        <!-- Contenu -->
        <div class="bg-gradient-to-br from-slate-50 to-white p-6 rounded-2xl border border-slate-200">
          <p class="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-3">Témoignage</p>
          <div class="prose prose-slate max-w-none">
            <p class="text-slate-800 leading-relaxed whitespace-pre-wrap">${content}</p>
          </div>
        </div>
        
        <!-- Dates -->
        <div class="grid grid-cols-2 gap-4">
          <div class="bg-white p-4 rounded-2xl border border-slate-200">
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                <i class="fas fa-calendar-plus text-blue-600 text-sm"></i>
              </div>
              <div>
                <p class="text-xs text-slate-500">Créé le</p>
                <p class="text-sm font-semibold text-slate-900 mt-0.5">${created}</p>
              </div>
            </div>
          </div>
          <div class="bg-white p-4 rounded-2xl border border-slate-200">
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                <i class="fas fa-sync-alt text-emerald-600 text-sm"></i>
              </div>
              <div>
                <p class="text-xs text-slate-500">Modifié le</p>
                <p class="text-sm font-semibold text-slate-900 mt-0.5">${formatDate(testimonial.updated_at) || '—'}</p>
              </div>
            </div>
          </div>
        </div>
      `;
    }
    
    // Afficher les bons boutons selon le statut
    if (elements.publishBtn && elements.unpublishBtn) {
      if (isPublished) {
        elements.publishBtn.classList.add('hidden');
        elements.unpublishBtn.classList.remove('hidden');
      } else {
        elements.publishBtn.classList.remove('hidden');
        elements.unpublishBtn.classList.add('hidden');
      }
    }
    
    // Afficher la modal
    if (elements.testimonialModal) {
      elements.testimonialModal.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
      state.modalOpen = true;
    }
  }

  /**
   * Ferme la modal
   */
  function closeModal() {
    if (elements.testimonialModal) {
      elements.testimonialModal.classList.add('hidden');
      document.body.style.overflow = '';
      state.modalOpen = false;
      state.selectedTemoignage = null;
    }
  }

  // ====================================
  // 11. ACTIONS SUR LES TÉMOIGNAGES
  // ====================================
  
  /**
   * Publie ou dépublie un témoignage
   */
  async function publishTestimonial(testimonialId, isPublished) {
    try {
      setLoading(true);
      
      await api(`${CONFIG.API.TEMOIGNAGES}/${testimonialId}/publish`, {
        method: 'PATCH',
        body: JSON.stringify({ is_published: isPublished })
      });
      
      const action = isPublished ? 'publié' : 'dépublié';
      showToast(`Témoignage ${action} avec succès`, 'success');
      
      // Recharger les données
      await loadTemoignages();
      
      // Fermer la modal si ouverte
      if (state.selectedTemoignage?.id === testimonialId) {
        closeModal();
      }
      
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  /**
   * Rejette un témoignage (marque comme rejeté)
   */
  async function rejectTestimonial(testimonialId) {
    try {
      setLoading(true);
      
      await api(`${CONFIG.API.TEMOIGNAGES}/${testimonialId}/reject`, {
        method: 'PATCH'
      });
      
      showToast('Témoignage rejeté', 'success');
      await loadTemoignages();
      closeModal();
      
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  /**
   * Supprime définitivement un témoignage
   */
  async function deleteTestimonial(testimonialId) {
    try {
      setLoading(true);
      
      await api(`${CONFIG.API.TEMOIGNAGES}/${testimonialId}`, {
        method: 'DELETE'
      });
      
      showToast('Témoignage supprimé avec succès', 'success');
      
      // Recharger les données
      state.page = 1;
      await loadTemoignages();
      
      // Fermer la modal si ouverte
      if (state.selectedTemoignage?.id === testimonialId) {
        closeModal();
      }
      
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
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
      loadTemoignages();
      showToast('Filtres appliqués', 'success', 2000);
    });
    
    elements.q?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        updateFilters();
        loadTemoignages();
      }
    });
    
    elements.status?.addEventListener('change', () => {
      updateFilters();
      loadTemoignages();
    });
    
    elements.rating?.addEventListener('change', () => {
      updateFilters();
      loadTemoignages();
    });
    
    elements.limit?.addEventListener('change', () => {
      state.limit = parseInt(elements.limit.value, 10) || 20;
      state.page = 1;
      loadTemoignages();
    });
    
    elements.resetFiltersBtn?.addEventListener('click', resetFilters);
    
    elements.refreshBtn?.addEventListener('click', () => {
      if (elements.refreshBtn) {
        elements.refreshBtn.disabled = true;
        elements.refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Actualisation...';
      }
      
      loadTemoignages().finally(() => {
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
        loadTemoignages();
      }
    });
    
    elements.nextPage?.addEventListener('click', () => {
      if (state.page < getTotalPages()) {
        state.page++;
        loadTemoignages();
      }
    });
    
    // ========== TABLEAU ==========
    elements.tbody?.addEventListener('click', (e) => {
      const viewBtn = e.target.closest('.view-btn');
      const publishBtn = e.target.closest('.publish-btn');
      const deleteBtn = e.target.closest('.delete-btn');
      const row = e.target.closest('.testimonial-row');
      
      if (viewBtn) {
        e.stopPropagation();
        const id = parseInt(viewBtn.dataset.id, 10);
        openModal(id);
      } else if (publishBtn) {
        e.stopPropagation();
        const id = parseInt(publishBtn.dataset.id, 10);
        const shouldPublish = publishBtn.dataset.publish === '1';
        
        openConfirmModal({
          title: shouldPublish ? 'Publier le témoignage' : 'Dépublier le témoignage',
          subtitle: shouldPublish ? 'Le témoignage sera visible sur le site' : 'Le témoignage ne sera plus visible',
          message: shouldPublish 
            ? 'Voulez-vous publier ce témoignage ? Il sera visible par tous les visiteurs.'
            : 'Voulez-vous dépublier ce témoignage ? Il ne sera plus affiché sur le site.',
          confirmText: shouldPublish ? 'Publier' : 'Dépublier',
          confirmIcon: shouldPublish ? 'fa-check-circle' : 'fa-eye-slash',
          confirmColor: shouldPublish ? 'emerald' : 'amber',
          onConfirm: () => publishTestimonial(id, shouldPublish)
        });
      } else if (deleteBtn) {
        e.stopPropagation();
        const id = parseInt(deleteBtn.dataset.id, 10);
        
        openConfirmModal({
          title: 'Supprimer le témoignage',
          subtitle: 'Cette action est irréversible',
          message: 'Voulez-vous vraiment supprimer définitivement ce témoignage ?',
          confirmText: 'Supprimer',
          confirmIcon: 'fa-trash-alt',
          confirmColor: 'red',
          onConfirm: () => deleteTestimonial(id)
        });
      } else if (row) {
        const id = parseInt(row.dataset.id, 10);
        openModal(id);
      }
    });
    
    // ========== MODAL ==========
    elements.closeModal?.addEventListener('click', closeModal);
    elements.modalBackdrop?.addEventListener('click', closeModal);
    
    // Boutons d'action dans la modal
    elements.publishBtn?.addEventListener('click', () => {
      if (state.selectedTemoignage) {
        openConfirmModal({
          title: 'Publier le témoignage',
          subtitle: 'Le témoignage sera visible sur le site',
          message: 'Voulez-vous publier ce témoignage ?',
          confirmText: 'Publier',
          confirmIcon: 'fa-check-circle',
          confirmColor: 'emerald',
          onConfirm: () => publishTestimonial(state.selectedTemoignage.id, true)
        });
      }
    });
    
    elements.unpublishBtn?.addEventListener('click', () => {
      if (state.selectedTemoignage) {
        openConfirmModal({
          title: 'Dépublier le témoignage',
          subtitle: 'Le témoignage ne sera plus visible',
          message: 'Voulez-vous dépublier ce témoignage ?',
          confirmText: 'Dépublier',
          confirmIcon: 'fa-eye-slash',
          confirmColor: 'amber',
          onConfirm: () => publishTestimonial(state.selectedTemoignage.id, false)
        });
      }
    });
    
    elements.rejectBtn?.addEventListener('click', () => {
      if (state.selectedTemoignage) {
        openConfirmModal({
          title: 'Rejeter le témoignage',
          subtitle: 'Cette action est réversible',
          message: 'Voulez-vous rejeter ce témoignage ?',
          confirmText: 'Rejeter',
          confirmIcon: 'fa-times-circle',
          confirmColor: 'red',
          onConfirm: () => rejectTestimonial(state.selectedTemoignage.id)
        });
      }
    });
    
    elements.deleteBtn?.addEventListener('click', () => {
      if (state.selectedTemoignage) {
        openConfirmModal({
          title: 'Supprimer le témoignage',
          subtitle: 'Cette action est irréversible',
          message: 'Voulez-vous vraiment supprimer définitivement ce témoignage ?',
          confirmText: 'Supprimer',
          confirmIcon: 'fa-trash-alt',
          confirmColor: 'red',
          onConfirm: () => deleteTestimonial(state.selectedTemoignage.id)
        });
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
        if (state.modalOpen) {
          closeModal();
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
    state.filters.rating = parseInt(elements.rating?.value || '0', 10) || 0;
    
    // Charger les données
    await loadAdminInfo();
    await loadTemoignages();
    await loadStats();
    
    // Initialiser les événements
    initEventListeners();
  }

  // Démarrer l'application
  init();

  // API publique
  return {
    loadTemoignages,
    publishTestimonial,
    deleteTestimonial,
    openModal,
    closeModal,
    resetFilters
  };
})();

// Rendre disponible globalement
window.TemoignagesManager = TemoignagesManager;