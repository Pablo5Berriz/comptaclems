'use strict';

document.addEventListener('DOMContentLoaded', () => {
  // ====================================
  // 1. CONSTANTES & CONFIGURATION
  // ====================================
  
  // Configuration des statuts
  const STATUS_CONFIG = {
    recu: { 
      text: 'Reçu', 
      color: 'bg-blue-100 text-blue-800 border border-blue-200',
      icon: 'fa-inbox',
      badge: 'bg-blue-600'
    },
    en_traitement: { 
      text: 'En traitement', 
      color: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
      icon: 'fa-gear',
      badge: 'bg-yellow-600'
    },
    documents_manquants: { 
      text: 'Documents manquants', 
      color: 'bg-orange-100 text-orange-800 border border-orange-200',
      icon: 'fa-file-exclamation',
      badge: 'bg-orange-600'
    },
    terminee: { 
      text: 'Terminée', 
      color: 'bg-green-100 text-green-800 border border-green-200',
      icon: 'fa-check-circle',
      badge: 'bg-green-600'
    },
    refusee: { 
      text: 'Refusée', 
      color: 'bg-red-100 text-red-800 border border-red-200',
      icon: 'fa-times-circle',
      badge: 'bg-red-600'
    },
    brouillon: { 
      text: 'Brouillon', 
      color: 'bg-gray-100 text-gray-800 border border-gray-200',
      icon: 'fa-pen',
      badge: 'bg-gray-600'
    }
  };
  
  // Configuration des types de client
  const TYPE_CONFIG = {
    particulier: { 
      text: 'Particulier', 
      icon: 'fa-user',
      color: 'bg-purple-100 text-purple-800'
    },
    travailleur_autonome: { 
      text: 'Travailleur autonome', 
      icon: 'fa-briefcase',
      color: 'bg-indigo-100 text-indigo-800'
    },
    pme: { 
      text: 'PME', 
      icon: 'fa-building',
      color: 'bg-cyan-100 text-cyan-800'
    }
  };

  // Badges de statut pour documents
  const DOCUMENT_STATUS_BADGES = {
    pending: {
      class: 'bg-amber-100 text-amber-700 border-amber-200',
      icon: 'fa-clock',
      label: 'En attente'
    },
    validated: {
      class: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      icon: 'fa-check-circle',
      label: 'Validé'
    },
    rejected: {
      class: 'bg-red-100 text-red-700 border-red-200',
      icon: 'fa-times-circle',
      label: 'Rejeté'
    }
  };

  // Libellés des champs du formulaire
  const FIELD_LABELS_COMPLET = {
    prenom: 'Prénom',
    nom: 'Nom',
    sexe: 'Sexe',
    dob: 'Date de naissance',
    email: 'Courriel',
    telephone: 'Téléphone',
    nas: 'NAS',
    adresse: 'Adresse',
    adresse2: 'Adresse (ligne 2)',
    ville: 'Ville',
    province: 'Province',
    code_postal: 'Code postal',
    familyStatus: 'Situation familiale',
    statut_canada: 'Statut au Canada',
    logement_statut: 'Statut du logement',
    first_declaration: 'Première déclaration',
    has_children: 'A des enfants',
    children_count: "Nombre d'enfants",
    conjoint: 'Conjoint',
    conjoint_prenom: 'Prénom du conjoint',
    conjoint_nom: 'Nom du conjoint',
    conjoint_dob: 'Date de naissance du conjoint',
    conjoint_nas: 'NAS du conjoint',
    conjoint_telephone: 'Téléphone du conjoint',
    conjoint_email: 'Courriel du conjoint',
    conjoint_meme_adresse: 'Même adresse',
    enfants: 'Enfants à charge',
    enfant_prenom: 'Prénom',
    enfant_nom: 'Nom',
    enfant_dob: 'Date de naissance',
    enfant_relation: 'Lien de parenté',
    medical_expenses: 'Dépenses médicales',
    reer_contributions: 'Cotisations REER',
    investment_income: "Revenus d'intérêts",
    t2202_tuition_fees: 'Frais de scolarité (T2202)',
    celiapp_first_home: 'CELIAPP - premier achat',
    daycare_expenses: 'Dépenses de garderie',
    children_activities: 'Activités des enfants'
  };

  // Statuts maritaux
  const MARITAL_STATUS_LABELS = {
    'single': 'Célibataire',
    'married': 'Marié(e)',
    'common_law': 'Conjoint(e) de fait',
    'separated': 'Séparé(e)',
    'divorced': 'Divorcé(e)',
    'widowed': 'Veuf/Veuve'
  };

  // Statuts Canada
  const CANADA_STATUS_LABELS = {
    'citizen': 'Citoyen canadien',
    'permanent_resident': 'Résident permanent',
    'temporary_resident': 'Résident temporaire',
    'non_resident': 'Non-résident',
    'protected_person': 'Personne protégée'
  };

  // Types de dépenses
  const EXPENSE_TYPES = {
    garderie: 'Frais de garde',
    sport: 'Activités sportives',
    medical: 'Frais médicaux',
    scolaire: 'Frais scolaires',
    transport: 'Transport scolaire',
    therapie: 'Thérapies',
    camp: 'Camps de vacances',
    art: 'Activités artistiques'
  };

  // ====================================
  // 2. STATE MANAGEMENT
  // ====================================
  
  let state = {
    currentPage: 1,
    limit: 10,
    totalItems: 0,
    filters: {},
    declarations: [],
    selectedDeclarationId: null,
    isLoading: false,
    isSubmitting: false,
    notifications: [],
    unreadCount: 0
  };

  // ====================================
  // 3. ÉLÉMENTS DOM
  // ====================================
  
  const elements = {
    alert: document.getElementById('pageAlert'),
    toastHost: document.getElementById('toastHost'),
    rowsTbody: document.getElementById('rowsTbody'),
    resultInfo: document.getElementById('resultInfo'),
    pageInfo: document.getElementById('pageInfo'),
    prevPage: document.getElementById('prevPage'),
    nextPage: document.getElementById('nextPage'),
    declarationCount: document.getElementById('declarationCount'),
    totalDeclarations: document.getElementById('totalDeclarations'),
    pendingDeclarations: document.getElementById('pendingDeclarations'),
    completedDeclarations: document.getElementById('completedDeclarations'),
    lastUpdate: document.getElementById('lastUpdate'),
    f_q: document.getElementById('f_q'),
    f_year: document.getElementById('f_year'),
    f_status: document.getElementById('f_status'),
    f_type: document.getElementById('f_type'),
    btnApply: document.getElementById('btnApply'),
    btnReset: document.getElementById('btnReset'),
    btnRefresh: document.getElementById('btnRefresh'),
    activeFiltersCount: document.getElementById('activeFiltersCount'),
    activeFiltersTags: document.getElementById('activeFiltersTags'),
    filterTagsContainer: document.getElementById('filterTagsContainer'),
    detailsModal: document.getElementById('detailsModal'),
    closeDetails: document.getElementById('closeDetails'),
    modalBackdrop: document.getElementById('modalBackdrop'),
    detailsContent: document.getElementById('detailsContent'),
    dStatus: document.getElementById('d_status'),
    saveStatus: document.getElementById('saveStatus'),
    deleteDeclaration: document.getElementById('deleteDeclaration'),
    modalTitle: document.getElementById('modalTitle'),
    declarationId: document.getElementById('declarationId'),
    declarationFiscalYear: document.getElementById('declarationFiscalYear'),
    confirmModal: document.getElementById('confirmModal'),
    confirmMessage: document.getElementById('confirmMessage'),
    confirmDeleteBtn: document.getElementById('confirmDelete'),
    confirmCancelBtn: document.getElementById('confirmCancel'),
    confirmBackdrop: document.getElementById('confirmBackdrop'),
    notifBtn: document.getElementById('notifBtn'),
    notifPanel: document.getElementById('notifPanel'),
    notifList: document.getElementById('notifList'),
    notifBadge: document.getElementById('notifBadge'),
    notifRefresh: document.getElementById('notifRefresh'),
    notifMarkRead: document.getElementById('notifMarkRead')
  };

  // ====================================
  // 4. UTILITAIRES
  // ====================================
  
  function formatDate(dateString) {
    if (!dateString) return '—';
    try {
      const date = new Date(dateString);
      return new Intl.DateTimeFormat('fr-FR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      }).format(date);
    } catch {
      return '—';
    }
  }
  
  function formatDateTime(dateString) {
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

  function formatDateForDisplay(dateString) {
    if (!dateString) return '—';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return '—';
      return date.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    } catch {
      return '—';
    }
  }
  
  function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function maskNas(nas) {
    if (!nas) return '—';
    const cleaned = String(nas).replace(/\s/g, '');
    if (cleaned.length < 9) return '*** *** ***';
    return '*** *** ***';
  }

  function formatBoolean(value) {
    if (value === true || value === 'true' || value === 'yes' || value === 'oui') return 'Oui';
    if (value === false || value === 'false' || value === 'no' || value === 'non') return 'Non';
    return value || '—';
  }

  function formatCurrency(value) {
    if (!value && value !== 0) return '—';
    if (typeof value === 'number') {
      return new Intl.NumberFormat('fr-CA', {
        style: 'currency',
        currency: 'CAD'
      }).format(value);
    }
    return value;
  }

  function getFileIconClass(mimeType) {
    if (!mimeType) return 'fa-file text-slate-500';
    if (mimeType.includes('pdf')) return 'fa-file-pdf text-red-500';
    if (mimeType.includes('image')) return 'fa-file-image text-blue-500';
    if (mimeType.includes('word')) return 'fa-file-word text-blue-700';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'fa-file-excel text-green-600';
    if (mimeType.includes('text')) return 'fa-file-lines text-slate-500';
    return 'fa-file text-slate-500';
  }

  function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
  
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
      <div class="flex-1 text-sm font-medium">${message}</div>
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
  
  function showAlert(message, type = 'info') {
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
  
  function updateLastUpdate() {
    if (elements.lastUpdate) {
      const now = new Date();
      elements.lastUpdate.textContent = `Mise à jour à ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    }
  }
  
  function updateStats() {
    if (!elements.totalDeclarations) return;
    
    const total = state.totalItems;
    const pending = state.declarations.filter(d => 
      ['recu', 'en_traitement', 'documents_manquants'].includes(d.status)
    ).length;
    const completed = state.declarations.filter(d => 
      ['terminee'].includes(d.status)
    ).length;
    
    elements.totalDeclarations.textContent = total;
    elements.pendingDeclarations.textContent = pending;
    elements.completedDeclarations.textContent = completed;
    if (elements.declarationCount) {
      elements.declarationCount.textContent = `${total} déclaration${total > 1 ? 's' : ''}`;
    }
  }

  // ====================================
  // 5. AUTHENTIFICATION & API
  // ====================================
  
  function getToken() {
    try {
      const authData = localStorage.getItem('cc_admin_auth');
      if (!authData) return null;
      const parsed = JSON.parse(authData);
      return parsed.token || null;
    } catch {
      return null;
    }
  }
  
  function getAuthHeaders() {
    const token = getToken();
    return {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` })
    };
  }
  
  function checkAuth() {
    const token = getToken();
    if (!token) {
      window.location.href = '/admin/adminLogin.html?session=expired';
      return false;
    }
    return true;
  }
  
  async function apiFetch(url, options = {}) {
    if (!checkAuth()) throw new Error('Non authentifié');
    
    const response = await fetch(url, {
      ...options,
      headers: {
        ...getAuthHeaders(),
        ...options.headers
      },
      credentials: 'include'
    });
    
    if (response.status === 401) {
      localStorage.removeItem('cc_admin_auth');
      window.location.href = '/admin/adminLogin.html?session=expired';
      throw new Error('Session expirée');
    }
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || error.message || `Erreur ${response.status}`);
    }
    
    return response.json();
  }

  // ====================================
  // 6. GESTION DES FILTRES
  // ====================================
  
  function updateFilters() {
    const filters = {};
    
    const q = elements.f_q?.value?.trim();
    if (q) filters.q = q;
    
    const year = elements.f_year?.value?.trim();
    if (year && /^\d{4}$/.test(year)) filters.fiscal_year = year;
    
    const status = elements.f_status?.value;
    if (status) filters.status = status;
    
    const type = elements.f_type?.value;
    if (type) filters.type_client = type;
    
    state.filters = filters;
    state.currentPage = 1;
    
    renderActiveFilters();
  }
  
  function renderActiveFilters() {
    const filterCount = Object.keys(state.filters).length;
    
    if (elements.activeFiltersCount) {
      elements.activeFiltersCount.textContent = `${filterCount} filtre${filterCount > 1 ? 's' : ''} actif${filterCount > 1 ? 's' : ''}`;
    }
    
    if (filterCount === 0) {
      if (elements.activeFiltersTags) elements.activeFiltersTags.classList.add('hidden');
      return;
    }
    
    if (elements.activeFiltersTags) elements.activeFiltersTags.classList.remove('hidden');
    if (!elements.filterTagsContainer) return;
    
    elements.filterTagsContainer.innerHTML = '';
    
    if (state.filters.q) {
      const tag = createFilterTag('Recherche', state.filters.q, 'q');
      elements.filterTagsContainer.appendChild(tag);
    }
    
    if (state.filters.fiscal_year) {
      const tag = createFilterTag('Année', state.filters.fiscal_year, 'fiscal_year');
      elements.filterTagsContainer.appendChild(tag);
    }
    
    if (state.filters.status) {
      const statusText = STATUS_CONFIG[state.filters.status]?.text || state.filters.status;
      const tag = createFilterTag('Statut', statusText, 'status');
      elements.filterTagsContainer.appendChild(tag);
    }
    
    if (state.filters.type_client) {
      const typeText = TYPE_CONFIG[state.filters.type_client]?.text || state.filters.type_client;
      const tag = createFilterTag('Type', typeText, 'type_client');
      elements.filterTagsContainer.appendChild(tag);
    }
  }
  
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
  
  function removeFilter(filterKey) {
    switch (filterKey) {
      case 'q':
        elements.f_q.value = '';
        delete state.filters.q;
        break;
      case 'fiscal_year':
        elements.f_year.value = '';
        delete state.filters.fiscal_year;
        break;
      case 'status':
        elements.f_status.value = '';
        delete state.filters.status;
        break;
      case 'type_client':
        elements.f_type.value = '';
        delete state.filters.type_client;
        break;
    }
    
    state.currentPage = 1;
    loadDeclarations();
  }
  
  function resetFilters() {
    if (elements.f_q) elements.f_q.value = '';
    if (elements.f_year) elements.f_year.value = '';
    if (elements.f_status) elements.f_status.value = '';
    if (elements.f_type) elements.f_type.value = '';
    
    state.filters = {};
    state.currentPage = 1;
    
    renderActiveFilters();
    loadDeclarations();
    showToast('Filtres réinitialisés', 'info', 2000);
  }

  // ====================================
  // 7. CHARGEMENT DES DONNÉES
  // ====================================
  
  async function loadDeclarations() {
    if (state.isLoading) return;
    
    state.isLoading = true;
    showLoading();
    
    const params = new URLSearchParams();
    params.set('page', String(state.currentPage));
    params.set('limit', String(state.limit));
    
    Object.entries(state.filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    
    try {
      const response = await apiFetch(`/api/admin/declarations?${params.toString()}`);
      
      if (!response.success) throw new Error(response.error || 'Erreur de chargement');
      
      state.declarations = Array.isArray(response.items) ? response.items : [];
      state.totalItems = Number(response.total || 0);
      
      renderTable(state.declarations);
      updatePaginationInfo();
      updateStats();
      updateLastUpdate();
      
    } catch (error) {
      console.error('Erreur chargement:', error);
      showAlert(error.message, 'error');
      showToast(error.message, 'error');
      
      elements.rowsTbody.innerHTML = `
        <tr>
          <td colspan="6" class="px-6 py-16 text-center">
            <div class="flex flex-col items-center gap-4">
              <div class="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center">
                <i class="fas fa-exclamation-triangle text-3xl text-red-600"></i>
              </div>
              <div>
                <p class="text-lg font-medium text-slate-900">Erreur de chargement</p>
                <p class="text-sm text-slate-500 mt-1">${escapeHtml(error.message)}</p>
              </div>
              <button onclick="location.reload()" class="mt-2 px-6 py-3 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition flex items-center gap-2">
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
  
  function showLoading() {
    if (!elements.rowsTbody) return;
    
    elements.rowsTbody.innerHTML = `
      <tr>
        <td colspan="6" class="px-6 py-16 text-center">
          <div class="flex flex-col items-center gap-4">
            <div class="relative">
              <div class="w-16 h-16 rounded-full border-4 border-slate-200 border-t-slate-900 animate-spin"></div>
              <i class="fas fa-file-invoice absolute inset-0 flex items-center justify-center text-slate-400 text-xl"></i>
            </div>
            <div>
              <p class="text-lg font-medium text-slate-900">Chargement des déclarations</p>
              <p class="text-sm text-slate-500 mt-1">Veuillez patienter...</p>
            </div>
          </div>
        </td>
      </tr>
    `;
  }
  
  function updatePaginationInfo() {
    const totalPages = Math.ceil(state.totalItems / state.limit) || 1;
    
    if (elements.pageInfo) {
      elements.pageInfo.textContent = `Page ${state.currentPage} sur ${totalPages}`;
    }
    
    if (elements.resultInfo) {
      const start = ((state.currentPage - 1) * state.limit) + 1;
      const end = Math.min(state.currentPage * state.limit, state.totalItems);
      
      if (state.totalItems === 0) {
        elements.resultInfo.textContent = 'Aucune déclaration trouvée';
      } else {
        elements.resultInfo.textContent = `${start}-${end} sur ${state.totalItems} déclaration${state.totalItems > 1 ? 's' : ''}`;
      }
    }
    
    if (elements.prevPage) {
      elements.prevPage.disabled = state.currentPage <= 1;
      elements.prevPage.classList.toggle('opacity-50', state.currentPage <= 1);
      elements.prevPage.classList.toggle('cursor-not-allowed', state.currentPage <= 1);
    }
    
    if (elements.nextPage) {
      elements.nextPage.disabled = state.currentPage >= totalPages;
      elements.nextPage.classList.toggle('opacity-50', state.currentPage >= totalPages);
      elements.nextPage.classList.toggle('cursor-not-allowed', state.currentPage >= totalPages);
    }
  }
  
  function renderTable(declarations) {
    if (!elements.rowsTbody) return;
    
    if (!declarations || declarations.length === 0) {
      elements.rowsTbody.innerHTML = `
        <tr>
          <td colspan="6" class="px-6 py-16 text-center">
            <div class="flex flex-col items-center gap-4">
              <div class="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center">
                <i class="fas fa-inbox text-3xl text-slate-400"></i>
              </div>
              <div>
                <p class="text-lg font-medium text-slate-900">Aucune déclaration trouvée</p>
                <p class="text-sm text-slate-500 mt-1">Essayez de modifier vos filtres</p>
              </div>
              <button onclick="document.getElementById('btnReset').click()" class="mt-2 px-6 py-3 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition flex items-center gap-2">
                <i class="fas fa-rotate-left"></i>
                Réinitialiser les filtres
              </button>
            </div>
          </td>
        </tr>
      `;
      return;
    }
    
    elements.rowsTbody.innerHTML = declarations.map(declaration => {
      const status = STATUS_CONFIG[declaration.status] || STATUS_CONFIG.recu;
      const type = TYPE_CONFIG[declaration.type_client] || { 
        text: declaration.type_client || '—', 
        icon: 'fa-tag',
        color: 'bg-slate-100 text-slate-800'
      };
      const clientName = declaration.client_label || declaration.client_email || 'Client inconnu';
      const createdAt = formatDate(declaration.created_at);
      
      return `
        <tr class="declaration-row hover:bg-slate-50 transition border-b border-slate-100" data-id="${declaration.id}">
          <td class="px-6 py-4">
            <div class="flex items-start gap-3">
              <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center flex-shrink-0">
                <i class="fas fa-user text-slate-600"></i>
              </div>
              <div>
                <p class="font-semibold text-slate-900">${escapeHtml(clientName)}</p>
                ${declaration.client_email ? `
                  <p class="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                    <i class="fas fa-envelope"></i>
                    ${escapeHtml(declaration.client_email)}
                  </p>
                ` : ''}
                <p class="text-xs text-slate-400 mt-1">ID: ${declaration.client_id || declaration.id}</p>
              </div>
            </div>
          </td>
          <td class="px-6 py-4">
            <span class="px-3 py-1.5 bg-slate-100 rounded-lg text-sm font-semibold text-slate-900">
              ${declaration.fiscal_year || '—'}
            </span>
          </td>
          <td class="px-6 py-4">
            <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${type.color}">
              <i class="fas ${type.icon} text-xs"></i>
              ${type.text}
            </span>
          </td>
          <td class="px-6 py-4">
            <span class="status-badge ${status.color}">
              <i class="fas ${status.icon} text-xs"></i>
              ${status.text}
            </span>
          </td>
          <td class="px-6 py-4 text-sm">
            <div class="text-slate-900 font-medium">${createdAt}</div>
            <div class="text-xs text-slate-400 mt-1">${formatDateTime(declaration.created_at).split('à')[1] || ''}</div>
          </td>
          <td class="px-6 py-4 text-right">
            <div class="flex items-center justify-end gap-1">
              <button class="action-view p-2.5 rounded-xl hover:bg-blue-50 text-blue-600 hover:text-blue-700 transition-all" 
                      data-id="${declaration.id}" 
                      title="Voir détails">
                <i class="fas fa-eye"></i>
              </button>
              <button class="action-form p-2.5 rounded-xl hover:bg-purple-50 text-purple-600 hover:text-purple-700 transition-all" 
                      data-id="${declaration.id}" 
                      title="Voir formulaire complet">
                <i class="fas fa-file-lines"></i>
              </button>
              <button class="action-docs p-2.5 rounded-xl hover:bg-orange-50 text-orange-600 hover:text-orange-700 transition-all" 
                      data-id="${declaration.id}" 
                      title="Voir et télécharger les documents">
                <i class="fas fa-paperclip"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
    
    attachTableEventListeners();
  }
  
  function attachTableEventListeners() {
    document.querySelectorAll('.action-view').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = e.currentTarget.dataset.id;
        openDetailsModal(id);
      });
    });
    
    // Action Formulaire
    document.querySelectorAll('.action-form').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = e.currentTarget.dataset.id;
        
        try {
          showToast('Chargement du formulaire complet...', 'info', 2000);
          
          const formWindow = window.open('', '_blank');
          formWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="UTF-8">
              <title>Chargement du formulaire...</title>
              <style>
                body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
                .loader { text-align: center; padding: 40px; background: rgba(255,255,255,0.1); border-radius: 20px; }
                .spinner { border: 4px solid rgba(255,255,255,0.3); border-top: 4px solid white; border-radius: 50%; width: 50px; height: 50px; animation: spin 1s linear infinite; margin: 0 auto 20px; }
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
              </style>
            </head>
            <body><div class="loader"><div class="spinner"></div><h2>Chargement du formulaire...</h2></div></body>
            </html>
          `);
          formWindow.document.close();
          
          const response = await apiFetch(`/api/admin/declarations/${id}/form`);
          console.log('Réponse API formulaire:', response);
          
          if (response.success) { 
            const formHtml = generateAdminFormView(response.meta, response.payload);
            formWindow.document.open();
            formWindow.document.write(formHtml);
            formWindow.document.close();
          } else {
            throw new Error(response.error || 'Payload invalide');
          }
        } catch (error) {
          console.error('Erreur formulaire:', error);
          showToast(`Erreur: ${error.message}`, 'error');
        }
      });
    });
    
    // Action Documents 
    document.querySelectorAll('.action-docs').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = e.currentTarget.dataset.id;
        
        try {
          showToast('Chargement des documents...', 'info', 2000);
          
          const docsWindow = window.open('', '_blank');
          docsWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="UTF-8">
              <title>Chargement des documents...</title>
              <style>
                body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; }
                .loader { text-align: center; padding: 40px; background: rgba(255,255,255,0.1); border-radius: 20px; }
                .spinner { border: 4px solid rgba(255,255,255,0.3); border-top: 4px solid white; border-radius: 50%; width: 50px; height: 50px; animation: spin 1s linear infinite; margin: 0 auto 20px; }
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
              </style>
            </head>
            <body><div class="loader"><div class="spinner"></div><h2>Chargement des documents...</h2></div></body>
            </html>
          `);
          docsWindow.document.close();
          
          const response = await apiFetch(`/api/admin/declarations/${id}/documents`);
          
          if (response.success) {
            const docsHtml = generateAdminDocumentsView(response.documents, id);
            docsWindow.document.open();
            docsWindow.document.write(docsHtml);
            docsWindow.document.close();
          } else {
            throw new Error(response.error || 'Erreur chargement documents');
          }
        } catch (error) {
          console.error('Erreur documents:', error);
          showToast(`Erreur: ${error.message}`, 'error');
        }
      });
    });
    
    document.querySelectorAll('.declaration-row').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        const id = row.dataset.id;
        openDetailsModal(id);
      });
    });
  }

  // ====================================
  // 8. GÉNÉRATION VUE FORMULAIRE COMPLET
  // ====================================

  function generateAdminFormView(meta, payload) {
    const clientName = meta.client_label || 'Client';
    const fiscalYear = meta.fiscal_year || '—';
    const status = STATUS_CONFIG[meta.status] || STATUS_CONFIG.recu;
    
    console.log('Payload reçu pour génération:', JSON.stringify(payload, null, 2));
    
    return `
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Formulaire de déclaration - ${escapeHtml(clientName)} (${fiscalYear})</title>
        <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" rel="stylesheet">
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
          body { font-family: 'Inter', sans-serif; background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); }
          @media print {
            .no-print { display: none !important; }
            body { background: white; padding: 20px; }
            .print-section { break-inside: avoid; }
          }
        </style>
      </head>
      <body class="p-8">
        <div class="max-w-7xl mx-auto">
          
          <!-- En-tête -->
          <div class="bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl p-8 mb-8 text-white shadow-2xl">
            <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div>
                <div class="flex items-center gap-4">
                  <div class="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center backdrop-blur">
                    <i class="fas fa-file-invoice text-3xl"></i>
                  </div>
                  <div>
                    <h1 class="text-3xl font-bold">Formulaire de déclaration d'impôts</h1>
                    <p class="text-slate-300 mt-2 flex items-center gap-2">
                      <i class="fas fa-user"></i> ${escapeHtml(clientName)} · 
                      <i class="fas fa-calendar"></i> Année fiscale ${fiscalYear} · 
                      <i class="fas fa-hashtag"></i> #${meta.id}
                    </p>
                  </div>
                </div>
              </div>
              <div class="flex items-center gap-4">
                <span class="px-4 py-2 rounded-xl bg-white/10 backdrop-blur flex items-center gap-2">
                  <i class="fas ${status.icon}"></i>
                  ${status.text}
                </span>
                <button onclick="window.print()" class="px-4 py-2 rounded-xl bg-white text-slate-900 hover:bg-slate-100 transition flex items-center gap-2 no-print">
                  <i class="fas fa-print"></i>
                  Imprimer / PDF
                </button>
              </div>
            </div>
            
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8 pt-6 border-t border-white/10">
              <div>
                <p class="text-xs text-slate-400 uppercase">Date de soumission</p>
                <p class="font-medium">${formatDateTime(meta.created_at)}</p>
              </div>
              ${meta.client_email ? `
              <div>
                <p class="text-xs text-slate-400 uppercase">Email</p>
                <p class="font-medium">${escapeHtml(meta.client_email)}</p>
              </div>
              ` : ''}
              <div>
                <p class="text-xs text-slate-400 uppercase">Type de client</p>
                <p class="font-medium">${meta.type_client || '—'}</p>
              </div>
            </div>
          </div>

          ${generateAllFormSections(payload)}
          
          <div class="text-center text-slate-500 text-sm mt-8 pt-6 border-t border-slate-200 no-print">
            <i class="fas fa-shield-alt mr-2"></i>
            Document confidentiel · ComptaClems Administration
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Génère TOUTES les sections du formulaire
   */
  function generateAllFormSections(payload) {
    if (!payload || Object.keys(payload).length === 0) {
      return `
        <div class="bg-white rounded-2xl p-12 text-center shadow-xl">
          <i class="fas fa-inbox text-6xl text-slate-300 mb-4"></i>
          <p class="text-xl text-slate-500">Aucune donnée de formulaire disponible</p>
          <p class="text-slate-400 mt-2">Le client n'a pas encore complété cette section</p>
        </div>
      `;
    }

    let html = '<div class="space-y-6">';

    // SECTION 1: Informations personnelles
    const personalInfo = {
      prenom: payload.prenom || 'Non spécifié',
      nom: payload.nom || 'Non spécifié',
      sexe: payload.sexe || 'Non spécifié',
      dob: formatDateForDisplay(payload.dob) || 'Non spécifié',
      email: payload.email || 'Non spécifié',
      telephone: payload.telephone || 'Non spécifié',
      nas: payload.nas ? '*** *** ***' : 'Non spécifié'
    };
    html += generateSection('Informations personnelles', 'fa-user', personalInfo);

    // SECTION 2: Adresse
    const address = {
      adresse: payload.adresse || 'Non spécifié',
      adresse2: payload.adresse2 || 'Non spécifié',
      ville: payload.ville || 'Non spécifié',
      province: payload.province || 'Non spécifié',
      code_postal: payload.code_postal || 'Non spécifié'
    };
    html += generateSection('Adresse', 'fa-home', address);

    // SECTION 3: Situation familiale
    const family = {
      familyStatus: MARITAL_STATUS_LABELS[payload.familyStatus] || payload.familyStatus || 'Non spécifié',
      statut_canada: CANADA_STATUS_LABELS[payload.statut_canada] || payload.statut_canada || 'Non spécifié',
      logement_statut: payload.logement_statut || 'Non spécifié',
      first_declaration: formatBoolean(payload.first_declaration),
      has_children: formatBoolean(payload.has_children),
      children_count: payload.children_count || '0'
    };
    html += generateSection('Situation familiale', 'fa-users', family);

    // SECTION 4: Conjoint (si présent)
    if (payload.conjoint && Object.keys(payload.conjoint).length > 0) {
      html += generateSpouseSection(payload.conjoint);
    }

    // SECTION 5: Enfants
    if (payload.enfants && payload.enfants.length > 0) {
      html += generateChildrenSection(payload.enfants, payload.children_count || payload.enfants.length);
    } else if (payload.has_children === true || payload.has_children === 'true' || payload.has_children === 'yes') {
      html += generateEmptyChildrenSection(payload.children_count || 1);
    }

    // SECTION 6: Revenus et dépenses
    html += generateIncomesExpensesSection(payload);

    html += '</div>';
    return html;
  }

  /**
   * Génère une section vide pour les enfants
   */
  function generateEmptyChildrenSection(count) {
    return `
      <div class="bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200 print-section">
        <div class="bg-gradient-to-r from-slate-50 to-white px-6 py-4 border-b border-slate-200">
          <h2 class="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <i class="fas fa-child text-blue-600"></i>
            Enfants à charge (${count})
          </h2>
        </div>
        <div class="p-6">
          <p class="text-slate-500 italic">Aucune information détaillée sur les enfants</p>
        </div>
      </div>
    `;
  }

  /**
   * Génère la section des revenus et dépenses
   */
  function generateIncomesExpensesSection(payload) {
    const incomes = payload.incomes || { client: [], spouse: [] };
    const expenses = payload.expenses || [];
    
    const incomeTypes = {
      t4: 'T4/Relevé 1 (Emploi)',
      t4a: 'T4A (Pensions, retraits REER)',
      t5: 'T5/Relevé 3 (Intérêts et dividendes)',
      t3: 'T3 (Revenus de fiducie)',
      t5007: 'T5007 (Prestations)',
      t2202: 'T2202 (Frais de scolarité)',
      travailleur_autonome: 'Revenus de travailleur autonome',
      location: 'Revenus de location',
      etranger: 'Revenus étrangers',
      reer: 'Cotisations REER',
      celiapp: 'CELIAPP',
      medical: 'Frais médicaux',
      dons: 'Dons de bienfaisance',
      ae: 'Assurance-emploi',
      releve1: 'Relevé 1 (Emploi Québec)'
    };

    let html = `
      <div class="bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200 print-section">
        <div class="bg-gradient-to-r from-slate-50 to-white px-6 py-4 border-b border-slate-200">
          <h2 class="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <i class="fas fa-coins text-blue-600"></i>
            Revenus et dépenses déclarés
          </h2>
        </div>
        <div class="p-6">
    `;

    const clientIncomes = incomes.client || [];
    if (clientIncomes.length > 0) {
      html += `
        <div class="mb-6">
          <h3 class="text-md font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <i class="fas fa-user text-blue-500"></i>
            Revenus du client
          </h3>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      `;
      
      clientIncomes.forEach(income => {
        const label = incomeTypes[income] || income;
        html += `
          <div class="flex items-center gap-2 p-2 bg-green-50 rounded-lg border border-green-200">
            <i class="fas fa-check-circle text-green-500"></i>
            <span class="text-sm font-medium text-green-700">${label}</span>
          </div>
        `;
      });
      
      html += '</div></div>';
    }

    const spouseIncomes = incomes.spouse || [];
    if (spouseIncomes.length > 0) {
      html += `
        <div class="mb-6">
          <h3 class="text-md font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <i class="fas fa-user-friends text-purple-500"></i>
            Revenus du conjoint
          </h3>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      `;
      
      spouseIncomes.forEach(income => {
        const label = incomeTypes[income] || income;
        html += `
          <div class="flex items-center gap-2 p-2 bg-purple-50 rounded-lg border border-purple-200">
            <i class="fas fa-check-circle text-purple-500"></i>
            <span class="text-sm font-medium text-purple-700">${label}</span>
          </div>
        `;
      });
      
      html += '</div></div>';
    }

    if (expenses.length > 0) {
      html += `
        <div>
          <h3 class="text-md font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <i class="fas fa-receipt text-orange-500"></i>
            Dépenses déclarées
          </h3>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      `;
      
      expenses.forEach(expense => {
        const label = EXPENSE_TYPES[expense] || expense;
        html += `
          <div class="flex items-center gap-2 p-2 bg-orange-50 rounded-lg border border-orange-200">
            <i class="fas fa-check-circle text-orange-500"></i>
            <span class="text-sm font-medium text-orange-700">${label}</span>
          </div>
        `;
      });
      
      html += '</div>';
    }

    if (clientIncomes.length === 0 && spouseIncomes.length === 0 && expenses.length === 0) {
      html += `
        <div class="text-center py-8 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
          <i class="fas fa-inbox text-4xl text-slate-300 mb-3"></i>
          <p class="text-slate-500">Aucun revenu ou dépense déclaré</p>
        </div>
      `;
    }

    html += '</div></div>';
    return html;
  }

  /**
   * Génère une section du formulaire
   */
  function generateSection(title, icon, fields) {
    let html = `
      <div class="bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200 print-section">
        <div class="bg-gradient-to-r from-slate-50 to-white px-6 py-4 border-b border-slate-200">
          <h2 class="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <i class="fas ${icon} text-blue-600"></i>
            ${title}
          </h2>
        </div>
        <div class="p-6">
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    `;

    for (const [key, value] of Object.entries(fields)) {
      const displayValue = value && value !== '—' && value !== 'Non spécifié' && value !== '' 
        ? escapeHtml(String(value)) 
        : '<span class="text-slate-400 italic">Non renseigné</span>';
      
      let label = FIELD_LABELS_COMPLET[key] || key;
      label = label.charAt(0).toUpperCase() + label.slice(1);
      
      html += `
        <div class="bg-slate-50 p-4 rounded-xl border border-slate-200">
          <p class="text-xs text-slate-500 uppercase tracking-wider mb-2">${label}</p>
          <p class="font-medium text-slate-900">${displayValue}</p>
        </div>
      `;
    }

    html += `
          </div>
        </div>
      </div>
    `;

    return html;
  }

  function generateEmptySpouseSection() {
    return `
      <div class="bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200 print-section">
        <div class="bg-gradient-to-r from-slate-50 to-white px-6 py-4 border-b border-slate-200">
          <h2 class="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <i class="fas fa-user-plus text-blue-600"></i>
            Conjoint(e)
          </h2>
        </div>
        <div class="p-6">
          <div class="text-center py-4 bg-slate-50 rounded-xl">
            <p class="text-slate-500">Aucune information de conjoint fournie</p>
          </div>
        </div>
      </div>
    `;
  }

  function generateSpouseSection(spouse) {
    const spouseFields = {
      conjoint_prenom: spouse.prenom || 'Non spécifié',
      conjoint_nom: spouse.nom || 'Non spécifié',
      conjoint_dob: formatDateForDisplay(spouse.date_of_birth || spouse.dob) || 'Non spécifié',
      conjoint_nas: spouse.nas ? '*** *** ***' : 'Non spécifié',
      conjoint_telephone: spouse.telephone || 'Non spécifié',
      conjoint_email: spouse.email || 'Non spécifié',
      conjoint_meme_adresse: formatBoolean(spouse.meme_adresse || spouse.same_address)
    };

    return generateSection('Conjoint(e)', 'fa-user-plus', spouseFields);
  }

  function generateChildrenSection(children, count) {
    let html = `
      <div class="bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200 print-section">
        <div class="bg-gradient-to-r from-slate-50 to-white px-6 py-4 border-b border-slate-200">
          <h2 class="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <i class="fas fa-child text-blue-600"></i>
            Enfants à charge (${children.length})
          </h2>
        </div>
        <div class="p-6">
    `;

    children.forEach((child, index) => {
      html += `
        <div class="mb-6 last:mb-0 ${index > 0 ? 'pt-6 border-t border-slate-200' : ''}">
          <h3 class="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <span class="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs">${index + 1}</span>
            Enfant ${index + 1}
          </h3>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <p class="text-xs text-slate-500">Prénom</p>
              <p class="font-medium">${escapeHtml(child.prenom || child.first_name || 'Non spécifié')}</p>
            </div>
            <div>
              <p class="text-xs text-slate-500">Nom</p>
              <p class="font-medium">${escapeHtml(child.nom || child.last_name || 'Non spécifié')}</p>
            </div>
            <div>
              <p class="text-xs text-slate-500">Date de naissance</p>
              <p class="font-medium">${formatDateForDisplay(child.date_naissance || child.date_of_birth || child.dob) || 'Non spécifié'}</p>
            </div>
            <div>
              <p class="text-xs text-slate-500">Lien</p>
              <p class="font-medium">${escapeHtml(child.relation || child.lien || 'Non spécifié')}</p>
            </div>
          </div>
        </div>
      `;
    });

    html += '</div></div>';
    return html;
  }

  // ====================================
  // 9. GÉNÉRATION VUE DOCUMENTS
  // ====================================

  function generateAdminDocumentsView(documents, declarationId) {
    const stats = {
      total: documents.length,
      pending: documents.filter(d => d.status === 'pending').length,
      validated: documents.filter(d => d.status === 'validated').length,
      rejected: documents.filter(d => d.status === 'rejected').length
    };

    return `
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Documents - Déclaration #${declarationId}</title>
        <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" rel="stylesheet">
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
          body { font-family: 'Inter', sans-serif; background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); }
          .download-btn { transition: all 0.2s; }
          .download-btn:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
        </style>
      </head>
      <body class="p-8">
        <div class="max-w-6xl mx-auto">
          
          <div class="bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl p-8 mb-8 text-white shadow-2xl">
            <div class="flex items-center justify-between">
              <div>
                <div class="flex items-center gap-4">
                  <div class="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center backdrop-blur">
                    <i class="fas fa-paperclip text-3xl"></i>
                  </div>
                  <div>
                    <h1 class="text-3xl font-bold">Documents de la déclaration</h1>
                    <p class="text-slate-300 mt-2">
                      <i class="fas fa-hashtag"></i> #${declarationId} · 
                      ${stats.total} document${stats.total > 1 ? 's' : ''} au total
                    </p>
                  </div>
                </div>
              </div>
            </div>
            
            <div class="grid grid-cols-4 gap-4 mt-8 pt-6 border-t border-white/10">
              <div class="bg-white/5 rounded-xl p-4">
                <p class="text-2xl font-bold">${stats.total}</p>
                <p class="text-xs text-slate-400">Total</p>
              </div>
              <div class="bg-amber-500/10 rounded-xl p-4">
                <p class="text-2xl font-bold text-amber-400">${stats.pending}</p>
                <p class="text-xs text-slate-400">En attente</p>
              </div>
              <div class="bg-emerald-500/10 rounded-xl p-4">
                <p class="text-2xl font-bold text-emerald-400">${stats.validated}</p>
                <p class="text-xs text-slate-400">Validés</p>
              </div>
              <div class="bg-red-500/10 rounded-xl p-4">
                <p class="text-2xl font-bold text-red-400">${stats.rejected}</p>
                <p class="text-xs text-slate-400">Rejetés</p>
              </div>
            </div>
          </div>

          ${documents.length === 0 ? generateEmptyDocuments() : generateDocumentsList(documents)}
          
          <div class="text-center mt-8 no-print">
            <button onclick="window.close()" 
                    class="px-6 py-3 bg-slate-200 text-slate-700 rounded-xl hover:bg-slate-300 transition-colors">
              <i class="fas fa-times mr-2"></i>
              Fermer cette fenêtre
            </button>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  function generateDocumentsList(documents) {
    const groupedByType = documents.reduce((acc, doc) => {
      const type = doc.document_type_label || 'Autres documents';
      if (!acc[type]) acc[type] = [];
      acc[type].push(doc);
      return acc;
    }, {});

    let html = '<div class="space-y-6">';

    for (const [type, docs] of Object.entries(groupedByType)) {
      html += `
        <div class="bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200">
          <div class="bg-gradient-to-r from-slate-50 to-white px-6 py-4 border-b border-slate-200">
            <h2 class="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <i class="fas fa-folder text-blue-600"></i>
              ${escapeHtml(type)} (${docs.length})
            </h2>
          </div>
          <div class="p-6">
            <div class="space-y-4">
      `;

      docs.forEach(doc => {
        const status = DOCUMENT_STATUS_BADGES[doc.status] || DOCUMENT_STATUS_BADGES.pending;
        const fileIcon = getFileIconClass(doc.mime_type);
        const docId = doc.id;
        const fileName = doc.name || 'document';
        
        html += `
          <div class="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200 hover:bg-white transition-all">
            <div class="flex items-center gap-4 flex-1 min-w-0">
              <div class="w-12 h-12 rounded-xl bg-white flex items-center justify-center shadow-sm">
                <i class="fas ${fileIcon} text-xl"></i>
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-3">
                  <p class="font-semibold text-slate-900 truncate" title="${escapeHtml(doc.name)}">
                    ${escapeHtml(doc.name || 'Document')}
                  </p>
                  <span class="px-2 py-1 rounded-full text-xs font-medium ${status.class} border flex items-center gap-1">
                    <i class="fas ${status.icon}"></i>
                    ${status.label}
                  </span>
                </div>
                <div class="flex items-center gap-4 mt-2 text-xs text-slate-500">
                  <span><i class="far fa-calendar mr-1"></i>${formatDateTime(doc.created_at)}</span>
                  <span><i class="far fa-file mr-1"></i>${formatFileSize(doc.size_bytes)}</span>
                  ${doc.validated_at ? `
                    <span class="text-emerald-600"><i class="fas fa-check-circle mr-1"></i>Validé le ${formatDateForDisplay(doc.validated_at)}</span>
                  ` : ''}
                </div>
                ${doc.rejection_reason ? `
                  <div class="mt-2 text-xs text-red-600 bg-red-50 p-2 rounded-lg">
                    <i class="fas fa-exclamation-triangle mr-1"></i>
                    Rejeté : ${escapeHtml(doc.rejection_reason)}
                  </div>
                ` : ''}
              </div>
            </div>
            <div class="flex gap-2 ml-4">
              <button type="button" class="doc-preview-btn px-4 py-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition flex items-center gap-2 text-slate-700 no-print"
                      data-doc-id="${escapeHtml(String(docId))}">
                <i class="fas fa-eye"></i>
                Aperçu
              </button>
              <button type="button" class="doc-download-btn px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition flex items-center gap-2 shadow-md download-btn"
                      data-doc-id="${escapeHtml(String(docId))}" data-filename="${escapeHtml(fileName)}">
                <i class="fas fa-download"></i>
                Télécharger
              </button>
            </div>
          </div>
        `;
      });

      html += `
            </div>
          </div>
        </div>
      `;
    }

    html += `
      </div>
      <script>
        // Sécurité (fix XSS admin) : ni fileName ni JWT ne sont jamais interpolés
        // dans du HTML/JS généré. docId/fileName passent par data-* (texte inerte,
        // lu via .dataset, jamais exécuté). Le JWT n'est JAMAIS écrit dans ce markup :
        // cette fenêtre est same-origin avec l'admin (about:blank hérite de l'origine
        // de l'opener), donc on relit le token directement depuis localStorage au
        // moment du clic, exactement comme getToken() le fait dans adminDeclarations.js.
        function getAdminToken() {
          try {
            var raw = localStorage.getItem('cc_admin_auth');
            if (!raw) return null;
            var parsed = JSON.parse(raw);
            return parsed.token || null;
          } catch (e) {
            return null;
          }
        }

        function downloadDocument(docId, filename) {
          var token = getAdminToken();
          if (!token) {
            alert('Session expirée. Fermez cette fenêtre et reconnectez-vous.');
            return;
          }
          var xhr = new XMLHttpRequest();
          xhr.open('GET', '/api/admin/declarations/documents/' + encodeURIComponent(docId) + '/download', true);
          xhr.setRequestHeader('Authorization', 'Bearer ' + token);
          xhr.responseType = 'blob';

          xhr.onload = function() {
            if (this.status === 200) {
              var blob = this.response;
              var link = document.createElement('a');
              link.href = window.URL.createObjectURL(blob);
              link.download = filename;
              document.body.appendChild(link);
              link.click();
              link.remove();
              window.URL.revokeObjectURL(link.href);
            } else {
              alert('Erreur lors du téléchargement (code ' + this.status + ')');
            }
          };

          xhr.onerror = function() {
            alert('Erreur réseau lors du téléchargement');
          };

          xhr.send();
        }

        function previewDocument(docId) {
          var token = getAdminToken();
          if (!token) {
            alert('Session expirée. Fermez cette fenêtre et reconnectez-vous.');
            return;
          }
          var xhr = new XMLHttpRequest();
          xhr.open('GET', '/api/admin/declarations/documents/' + encodeURIComponent(docId) + '/download?preview=1', true);
          xhr.setRequestHeader('Authorization', 'Bearer ' + token);
          xhr.responseType = 'blob';

          xhr.onload = function() {
            if (this.status === 200) {
              var blob = this.response;
              var url = window.URL.createObjectURL(blob);
              window.open(url, '_blank');
              window.URL.revokeObjectURL(url);
            } else {
              alert('Erreur lors de l\\'aperçu (code ' + this.status + ')');
            }
          };

          xhr.onerror = function() {
            alert('Erreur réseau lors de l\\'aperçu');
          };

          xhr.send();
        }

        document.querySelectorAll('.doc-preview-btn').forEach(function(btn) {
          btn.addEventListener('click', function() {
            previewDocument(btn.dataset.docId);
          });
        });

        document.querySelectorAll('.doc-download-btn').forEach(function(btn) {
          btn.addEventListener('click', function() {
            downloadDocument(btn.dataset.docId, btn.dataset.filename);
          });
        });
      </script>
    `;

    return html;
  }

  function generateEmptyDocuments() {
    return `
      <div class="bg-white rounded-2xl p-16 text-center shadow-xl">
        <div class="w-24 h-24 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-6">
          <i class="fas fa-file-upload text-4xl text-slate-400"></i>
        </div>
        <h3 class="text-xl font-semibold text-slate-900 mb-2">Aucun document</h3>
        <p class="text-slate-500">Le client n'a pas encore téléversé de documents pour cette déclaration.</p>
      </div>
    `;
  }

  // ====================================
  // 10. MODAL DÉTAILS
  // ====================================
  
  async function openDetailsModal(id) {
    if (!id) return;
    
    state.selectedDeclarationId = id;
    
    if (elements.detailsContent) {
      elements.detailsContent.innerHTML = `
        <div class="text-center py-12">
          <div class="relative inline-block">
            <div class="w-16 h-16 rounded-full border-4 border-slate-200 border-t-slate-900 animate-spin"></div>
            <i class="fas fa-file-invoice absolute inset-0 flex items-center justify-center text-slate-400 text-xl"></i>
          </div>
          <p class="text-slate-600 font-medium mt-4">Chargement des détails...</p>
          <p class="text-sm text-slate-500 mt-1">Veuillez patienter</p>
        </div>
      `;
    }
    
    elements.detailsModal?.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    
    try {
      const response = await apiFetch(`/api/admin/declarations/${id}`);
      
      if (!response.success) throw new Error(response.error || 'Erreur de chargement');
      
      renderDetails(response.item);
      
    } catch (error) {
      console.error('Erreur détails:', error);
      
      if (elements.detailsContent) {
        elements.detailsContent.innerHTML = `
          <div class="text-center py-12">
            <div class="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center mx-auto">
              <i class="fas fa-exclamation-triangle text-3xl text-red-600"></i>
            </div>
            <p class="text-red-600 font-medium mt-4">Erreur de chargement</p>
            <p class="text-slate-500 text-sm mt-1">${escapeHtml(error.message)}</p>
            <button onclick="location.reload()" class="mt-4 px-6 py-3 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition">
              <i class="fas fa-sync-alt mr-2"></i>Réessayer
            </button>
          </div>
        `;
      }
      
      showToast(error.message, 'error');
    }
  }
  
  function renderDetails(item) {
    const status = STATUS_CONFIG[item.status] || STATUS_CONFIG.recu;
    const type = TYPE_CONFIG[item.submission_type] || { 
      text: item.submission_type || '—', 
      icon: 'fa-tag',
      color: 'bg-slate-100 text-slate-800'
    };
    const clientName = item.client_label || item.client_email || 'Client inconnu';
    
    if (elements.declarationId) {
      elements.declarationId.textContent = `#${item.id}`;
    }
    if (elements.declarationFiscalYear) {
      elements.declarationFiscalYear.textContent = `Année fiscale ${item.fiscal_year || '—'}`;
    }
    
    if (elements.detailsContent) {
      elements.detailsContent.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div class="bg-gradient-to-br from-slate-50 to-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div class="flex items-start gap-3">
              <div class="w-10 h-10 rounded-xl bg-slate-200 flex items-center justify-center">
                <i class="fas fa-hashtag text-slate-700"></i>
              </div>
              <div>
                <p class="text-xs text-slate-500 uppercase tracking-wider font-semibold">ID Déclaration</p>
                <p class="text-2xl font-bold text-slate-900 mt-1">#${item.id}</p>
              </div>
            </div>
          </div>
          
          <div class="bg-gradient-to-br from-slate-50 to-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div class="flex items-start gap-3">
              <div class="w-10 h-10 rounded-xl bg-slate-200 flex items-center justify-center">
                <i class="fas fa-calendar text-slate-700"></i>
              </div>
              <div>
                <p class="text-xs text-slate-500 uppercase tracking-wider font-semibold">Année fiscale</p>
                <p class="text-2xl font-bold text-slate-900 mt-1">${item.fiscal_year || '—'}</p>
              </div>
            </div>
          </div>
          
          <div class="bg-gradient-to-br from-slate-50 to-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div class="flex items-start gap-3">
              <div class="w-10 h-10 rounded-xl ${status.color.split(' ')[0]} flex items-center justify-center">
                <i class="fas ${status.icon} ${status.color.split(' ')[1]}"></i>
              </div>
              <div>
                <p class="text-xs text-slate-500 uppercase tracking-wider font-semibold">Statut</p>
                <span class="status-badge ${status.color} mt-1">
                  <i class="fas ${status.icon} text-xs"></i>
                  ${status.text}
                </span>
              </div>
            </div>
          </div>
        </div>
        
        <div class="bg-gradient-to-br from-blue-50 to-white p-6 rounded-2xl border border-blue-200 shadow-sm mt-6">
          <div class="flex items-start gap-4">
            <div class="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
              <i class="fas fa-user-circle text-2xl text-blue-600"></i>
            </div>
            <div class="flex-1">
              <p class="text-xs text-blue-600 uppercase tracking-wider font-semibold mb-1">Client</p>
              <p class="text-xl font-bold text-slate-900">${escapeHtml(clientName)}</p>
              
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                ${item.client_email ? `
                  <div class="flex items-center gap-2 text-sm">
                    <i class="fas fa-envelope text-blue-500"></i>
                    <span class="text-slate-600">${escapeHtml(item.client_email)}</span>
                  </div>
                ` : ''}
                
                ${item.client_phone ? `
                  <div class="flex items-center gap-2 text-sm">
                    <i class="fas fa-phone text-blue-500"></i>
                    <span class="text-slate-600">${escapeHtml(item.client_phone)}</span>
                  </div>
                ` : ''}
                
                <div class="flex items-center gap-2 text-sm">
                  <i class="fas fa-id-card text-blue-500"></i>
                  <span class="text-slate-600">Client #${item.client_id || '—'}</span>
                </div>
                
                <div class="flex items-center gap-2 text-sm">
                  <i class="fas fa-tag text-blue-500"></i>
                  <span class="px-2 py-1 rounded-lg text-xs font-medium ${type.color}">
                    ${type.text}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-5 mt-6">
          <div class="bg-white p-5 rounded-2xl border border-slate-200">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                <i class="fas fa-plus-circle text-amber-600"></i>
              </div>
              <div>
                <p class="text-xs text-slate-500 uppercase tracking-wider font-semibold">Créée le</p>
                <p class="text-lg font-bold text-slate-900 mt-1">${formatDateTime(item.created_at)}</p>
              </div>
            </div>
          </div>
          
          <div class="bg-white p-5 rounded-2xl border border-slate-200">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                <i class="fas fa-pen-to-square text-emerald-600"></i>
              </div>
              <div>
                <p class="text-xs text-slate-500 uppercase tracking-wider font-semibold">Modifiée le</p>
                <p class="text-lg font-bold text-slate-900 mt-1">${formatDateTime(item.updated_at)}</p>
              </div>
            </div>
          </div>
        </div>
        
        ${item.submission_data ? `
          <div class="bg-slate-50 p-5 rounded-2xl border border-slate-200 mt-4">
            <div class="flex items-center gap-2 mb-3">
              <i class="fas fa-code text-slate-400"></i>
              <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Données du formulaire</p>
            </div>
            <pre class="text-xs text-slate-600 bg-white p-4 rounded-xl border border-slate-200 overflow-x-auto">${escapeHtml(JSON.stringify(item.submission_data, null, 2))}</pre>
          </div>
        ` : ''}
      `;
    }
    
    if (elements.dStatus) {
      elements.dStatus.value = item.status || 'recu';
    }
  }
  
  function closeDetailsModal() {
    elements.detailsModal?.classList.add('hidden');
    document.body.style.overflow = '';
    state.selectedDeclarationId = null;
  }

  // ====================================
  // 11. ACTIONS SUR LES DÉCLARATIONS
  // ====================================

  async function updateStatus() {
    if (!state.selectedDeclarationId || !elements.dStatus) return;
    
    const newStatus = elements.dStatus.value;
    const button = elements.saveStatus;
    
    try {
      button.disabled = true;
      button.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Mise à jour...';
      
      const response = await apiFetch(`/api/admin/declarations/${state.selectedDeclarationId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus })
      });
      
      if (response.success) {
        showToast('Statut mis à jour avec succès', 'success');
        closeDetailsModal();
        loadDeclarations();
        addNotification('Statut mis à jour', `Déclaration #${state.selectedDeclarationId} : ${STATUS_CONFIG[newStatus]?.text}`, 'info');
      }
      
    } catch (error) {
      showToast(`Erreur: ${error.message}`, 'error');
    } finally {
      button.disabled = false;
      button.innerHTML = '<i class="fas fa-save mr-2"></i>Enregistrer';
    }
  }

  function confirmDeleteDeclaration() {
    if (!state.selectedDeclarationId) return;
    
    const declaration = state.declarations.find(d => d.id === state.selectedDeclarationId);
    
    if (elements.confirmMessage) {
      elements.confirmMessage.textContent = `Voulez-vous supprimer la déclaration #${state.selectedDeclarationId} ${declaration?.fiscal_year ? `(${declaration.fiscal_year})` : ''} ? Cette action est irréversible et supprimera également tous les documents associés.`;
    }
    
    if (elements.confirmModal) {
      elements.confirmModal.classList.remove('hidden');
      elements.confirmModal.style.zIndex = '70';
    }
    
    document.body.style.overflow = 'hidden';
    
    console.log('Modal de confirmation ouverte pour ID:', state.selectedDeclarationId); 
  }

  async function deleteDeclaration() {
    if (!state.selectedDeclarationId) return;
    
    console.log('Tentative de suppression ID:', state.selectedDeclarationId); 
    
    if (elements.confirmDeleteBtn) {
      elements.confirmDeleteBtn.disabled = true;
      elements.confirmDeleteBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Suppression...';
    }
    
    try {
      const response = await apiFetch(`/api/admin/declarations/${state.selectedDeclarationId}?hard=1`, {
        method: 'DELETE'
      });
      
      if (response.success) {
        showToast(`Déclaration supprimée avec succès (${response.deletedDocs || 0} document${response.deletedDocs > 1 ? 's' : ''})`, 'success');
        closeConfirmModal();
        closeDetailsModal();
        loadDeclarations(); 
      }
      
    } catch (error) {
      console.error('Erreur suppression:', error);
      showToast(`Erreur: ${error.message}`, 'error');
    } finally {
      if (elements.confirmDeleteBtn) {
        elements.confirmDeleteBtn.disabled = false;
        elements.confirmDeleteBtn.innerHTML = '<i class="fas fa-trash mr-2"></i>Supprimer';
      }
    }
  }

  function closeConfirmModal() {
    if (elements.confirmModal) {
      elements.confirmModal.classList.add('hidden');
      elements.confirmModal.style.zIndex = ''; 
    }
    document.body.style.overflow = '';
  }

  // ====================================
  // 12. NOTIFICATIONS
  // ====================================
  
  function addNotification(title, message, type = 'info') {
    const notification = {
      id: Date.now(),
      title,
      message,
      type,
      read: false,
      timestamp: new Date().toISOString()
    };
    
    state.notifications.unshift(notification);
    state.unreadCount++;
    
    updateNotificationBadge();
    renderNotifications();
    
    try {
      localStorage.setItem('cc_admin_notifications', JSON.stringify(state.notifications));
    } catch (e) {
      console.error('Erreur sauvegarde notifications:', e);
    }
  }
  
  function updateNotificationBadge() {
    if (elements.notifBadge) {
      if (state.unreadCount > 0) {
        elements.notifBadge.textContent = state.unreadCount > 9 ? '9+' : state.unreadCount;
        elements.notifBadge.classList.remove('hidden');
      } else {
        elements.notifBadge.classList.add('hidden');
      }
    }
  }
  
  function renderNotifications() {
    if (!elements.notifList) return;
    
    if (state.notifications.length === 0) {
      elements.notifList.innerHTML = `
        <div class="text-center py-8">
          <div class="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto">
            <i class="fas fa-bell-slash text-2xl text-slate-400"></i>
          </div>
          <p class="text-sm font-medium text-slate-700 mt-3">Aucune notification</p>
          <p class="text-xs text-slate-500 mt-1">Les nouvelles notifications apparaîtront ici</p>
        </div>
      `;
      return;
    }
    
    elements.notifList.innerHTML = state.notifications.map(notif => {
      const date = formatDateTime(notif.timestamp);
      const isUnread = !notif.read;
      
      return `
        <div class="notification-item p-3 rounded-xl mb-2 ${isUnread ? 'bg-blue-50 border border-blue-200' : 'hover:bg-slate-50'}" data-id="${notif.id}">
          <div class="flex items-start gap-3">
            <div class="w-8 h-8 rounded-full ${isUnread ? 'bg-blue-100' : 'bg-slate-100'} flex items-center justify-center flex-shrink-0">
              <i class="fas ${getNotificationIcon(notif.type)} ${isUnread ? 'text-blue-600' : 'text-slate-600'} text-sm"></i>
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-start justify-between">
                <p class="text-sm font-semibold ${isUnread ? 'text-blue-900' : 'text-slate-900'}">${escapeHtml(notif.title)}</p>
                ${!isUnread ? '<span class="text-xs text-slate-400">lu</span>' : ''}
              </div>
              <p class="text-xs text-slate-600 mt-0.5">${escapeHtml(notif.message)}</p>
              <p class="text-xs text-slate-400 mt-1">${date}</p>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }
  
  function getNotificationIcon(type) {
    const icons = {
      success: 'fa-check-circle',
      error: 'fa-exclamation-circle',
      warning: 'fa-exclamation-triangle',
      info: 'fa-info-circle'
    };
    return icons[type] || 'fa-bell';
  }
  
  function loadNotifications() {
    try {
      const saved = localStorage.getItem('cc_admin_notifications');
      if (saved) {
        state.notifications = JSON.parse(saved);
        state.unreadCount = state.notifications.filter(n => !n.read).length;
        updateNotificationBadge();
        renderNotifications();
      }
    } catch (e) {
      console.error('Erreur chargement notifications:', e);
    }
  }
  
  function markAllAsRead() {
    state.notifications.forEach(n => n.read = true);
    state.unreadCount = 0;
    updateNotificationBadge();
    renderNotifications();
    
    try {
      localStorage.setItem('cc_admin_notifications', JSON.stringify(state.notifications));
    } catch (e) {
      console.error('Erreur sauvegarde:', e);
    }
    
    showToast('Toutes les notifications ont été marquées comme lues', 'success', 2000);
  }

  // ====================================
  // 13. INITIALISATION DES ÉVÉNEMENTS 
  // ====================================

  function initEventListeners() {
    // Événements de pagination
    elements.prevPage?.addEventListener('click', () => {
      if (state.currentPage > 1) {
        state.currentPage--;
        loadDeclarations();
      }
    });
    
    elements.nextPage?.addEventListener('click', () => {
      const totalPages = Math.ceil(state.totalItems / state.limit);
      if (state.currentPage < totalPages) {
        state.currentPage++;
        loadDeclarations();
      }
    });
    
    // Filtres
    elements.btnApply?.addEventListener('click', () => {
      updateFilters();
      loadDeclarations();
      showToast('Filtres appliqués', 'success', 2000);
    });
    
    elements.btnReset?.addEventListener('click', resetFilters);
    elements.btnRefresh?.addEventListener('click', () => {
      loadDeclarations();
      showToast('Données actualisées', 'success', 2000);
    });
    
    elements.f_q?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        updateFilters();
        loadDeclarations();
      }
    });
    
    elements.f_year?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        updateFilters();
        loadDeclarations();
      }
    });
    
    // Modal détails
    elements.closeDetails?.addEventListener('click', closeDetailsModal);
    elements.modalBackdrop?.addEventListener('click', closeDetailsModal);
    
    // Actions sur les déclarations
    elements.saveStatus?.addEventListener('click', updateStatus);
    elements.deleteDeclaration?.addEventListener('click', confirmDeleteDeclaration);
    
    // Modal de confirmation
    elements.confirmDeleteBtn?.addEventListener('click', deleteDeclaration);
    elements.confirmCancelBtn?.addEventListener('click', closeConfirmModal);
    elements.confirmBackdrop?.addEventListener('click', closeConfirmModal);
    
    // Notifications
    elements.notifBtn?.addEventListener('click', () => {
      elements.notifPanel?.classList.toggle('hidden');
    });
    
    document.addEventListener('click', (e) => {
      if (elements.notifBtn && elements.notifPanel) {
        if (!elements.notifBtn.contains(e.target) && !elements.notifPanel.contains(e.target)) {
          elements.notifPanel.classList.add('hidden');
        }
      }
    });
    
    elements.notifRefresh?.addEventListener('click', () => {
      loadNotifications();
      showToast('Notifications actualisées', 'success', 2000);
    });
    
    elements.notifMarkRead?.addEventListener('click', markAllAsRead);
    
    // Touche Echap
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!elements.detailsModal?.classList.contains('hidden')) {
          closeDetailsModal();
        }
        if (!elements.confirmModal?.classList.contains('hidden')) {
          closeConfirmModal();
        }
        if (!elements.notifPanel?.classList.contains('hidden')) {
          elements.notifPanel.classList.add('hidden');
        }
      }
    });
  }
  
  function loadAdminInfo() {
    try {
      const authData = localStorage.getItem('cc_admin_auth');
      if (authData) {
        const parsed = JSON.parse(authData);
        if (parsed.admin) {
          const adminNameEl = document.getElementById('adminName');
          const adminRoleEl = document.getElementById('adminRole');
          const adminInitialsEl = document.getElementById('adminInitials');
          
          if (adminNameEl && parsed.admin.first_name) {
            const fullName = `${parsed.admin.first_name} ${parsed.admin.last_name || ''}`.trim();
            adminNameEl.textContent = fullName || 'Administrateur';
            
            if (adminInitialsEl) {
              const initials = (parsed.admin.first_name[0] + (parsed.admin.last_name?.[0] || '')).toUpperCase();
              adminInitialsEl.textContent = initials || 'AD';
            }
          }
          
          if (adminRoleEl) {
            adminRoleEl.textContent = parsed.admin.role === 'superadmin' ? 'Super Administrateur' : 'Administrateur';
          }
        }
      }
    } catch (e) {
      console.error('Erreur chargement infos admin:', e);
    }
  }

  // ====================================
  // 14. INITIALISATION
  // ====================================
  
  function init() {
    if (!checkAuth()) return;
    
    loadNotifications();
    initEventListeners();
    loadDeclarations();
    loadAdminInfo();
  }
  
  init();
});