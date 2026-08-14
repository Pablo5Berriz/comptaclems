'use strict';

document.addEventListener('DOMContentLoaded', () => {
  // ====================================
  // 1. CONSTANTES & CONFIGURATION
  // ====================================
  
  const CONFIG = {
    API: {
      BASE: '/api/admin/dashboard',
      STATS: '/api/admin/dashboard/stats',
      ME: '/api/admin/dashboard/me',
      NOTIFICATIONS: '/api/admin/dashboard/notifications',
      ACTIVITY: '/api/admin/dashboard/activity',
      DECLARATIONS_STATS: '/api/admin/dashboard/declarations-stats',
      CLIENTS_STATS: '/api/admin/dashboard/clients-stats',
      DOCUMENTS_STATS: '/api/admin/dashboard/documents-stats'
    },
    REFRESH_INTERVAL: 30000, 
    NOTIFICATION_POLLING: 15000, 
    ANIMATION_DURATION: 300,
    MAX_NOTIFICATIONS: 50,
    CHART_COLORS: {
      particuliers: '#3b82f6',
      autonomes: '#6366f1',
      pme: '#8b5cf6',
      recu: '#3b82f6',
      en_traitement: '#eab308',
      documents_manquants: '#f97316',
      terminee: '#22c55e',
      refusee: '#ef4444',
      brouillon: '#64748b'
    }
  };

  // ====================================
  // 2. STATE MANAGEMENT
  // ====================================
  
  let state = {
    // Stats globales
    stats: {
      admins: 0,
      clients: 0,
      services: 0,
      declarations: 0,
      testimonialsPending: 0,
      testimonialsPublished: 0,
      testimonialsTotal: 0
    },
    // Stats détaillées
    clientStats: {
      particuliers: 0,
      autonomes: 0,
      pme: 0,
      total: 0
    },
    declarationStats: {
      recu: 0,
      en_traitement: 0,
      documents_manquants: 0,
      terminee: 0,
      refusee: 0,
      brouillon: 0,
      total: 0
    },
    // Activité récente
    activities: [],
    // Notifications
    notifications: [],
    unreadCount: 0,
    lastSeenAt: null,
    // UI State
    isLoading: {
      stats: false,
      activity: false,
      notifications: false
    },
    lastUpdate: null
  };

  // ====================================
  // 3. ÉLÉMENTS DOM
  // ====================================
  
  const elements = {
    // Header & Profil
    adminName: document.getElementById('adminName'),
    adminRole: document.getElementById('adminRole'),
    adminInitials: document.getElementById('adminInitials'),
    welcomeAdminName: document.getElementById('welcomeAdminName'),
    
    // Date & Heure
    currentDate: document.getElementById('currentDate'),
    currentTime: document.getElementById('currentTime'),
    
    // Statistiques principales
    statAdmins: document.getElementById('statAdmins'),
    statClients: document.getElementById('statClients'),
    statServices: document.getElementById('statServices'),
    statDeclarations: document.getElementById('statDeclarations'),
    
    // Témoignages
    statTestimonialsPending: document.getElementById('statTestimonialsPending'),
    statTestimonialsPublished: document.getElementById('statTestimonialsPublished'),
    statTestimonialsTotal: document.getElementById('statTestimonialsTotal'),
    testimonialsPendingBar: document.getElementById('testimonialsPendingBar'),
    testimonialsPublishedBar: document.getElementById('testimonialsPublishedBar'),
    
    // Répartition clients
    clientParticuliers: document.getElementById('clientParticuliers'),
    clientAutonomes: document.getElementById('clientAutonomes'),
    clientPME: document.getElementById('clientPME'),
    totalClientsPie: document.getElementById('totalClientsPie'),
    clientTypeChart: document.getElementById('clientTypeChart'),
    
    // Déclarations par statut
    statDeclarationsRecues: document.getElementById('statDeclarationsRecues'),
    statDeclarationsTraitement: document.getElementById('statDeclarationsTraitement'),
    statDeclarationsManquants: document.getElementById('statDeclarationsManquants'),
    statDeclarationsTerminees: document.getElementById('statDeclarationsTerminees'),
    declarationsRecuesBar: document.getElementById('declarationsRecuesBar'),
    declarationsTraitementBar: document.getElementById('declarationsTraitementBar'),
    declarationsManquantsBar: document.getElementById('declarationsManquantsBar'),
    declarationsTermineesBar: document.getElementById('declarationsTermineesBar'),
    
    // Activité récente
    activityTimeline: document.getElementById('activityTimeline'),
    refreshActivityBtn: document.getElementById('refreshActivityBtn'),
    
    // Notifications
    notifBtn: document.getElementById('notifBtn'),
    notifPanel: document.getElementById('notifPanel'),
    notifList: document.getElementById('notifList'),
    notifBadge: document.getElementById('notifBadge'),
    notifRefresh: document.getElementById('notifRefresh'),
    notifMarkRead: document.getElementById('notifMarkRead'),
    notifLastUpdate: document.getElementById('notifLastUpdate'),
    
    // Alertes & Toasts
    pageAlert: document.getElementById('pageAlert'),
    toastHost: document.getElementById('toastHost'),
    
    // Boutons
    refreshStatsBtn: document.getElementById('refreshStatsBtn'),
    adminLogoutBtn: document.getElementById('adminLogoutBtn'),
    
    // Footer
    dashboardLastUpdate: document.getElementById('dashboardLastUpdate')
  };

  // ====================================
  // 4. UTILITAIRES
  // ====================================
  
  /**
   * Formate une date en français
   */
  function formatDate(date, options = {}) {
    if (!date) return '—';
    try {
      const d = new Date(date);
      return new Intl.DateTimeFormat('fr-FR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        ...options
      }).format(d);
    } catch {
      return '—';
    }
  }

  /**
   * Formate une heure
   */
  function formatTime(date) {
    if (!date) return '—';
    try {
      const d = new Date(date);
      return d.toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch {
      return '—';
    }
  }

  /**
   * Échappe les caractères HTML (anti-XSS)
   */
  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Formate un nombre avec séparateur de milliers
   */
  function formatNumber(num) {
    if (num === null || num === undefined) return '0';
    return num.toLocaleString('fr-FR');
  }

  /**
   * Met à jour la date et l'heure en temps réel
   */
  function updateDateTime() {
    const now = new Date();
    
    if (elements.currentDate) {
      elements.currentDate.textContent = formatDate(now, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
    }
    
    if (elements.currentTime) {
      elements.currentTime.textContent = formatTime(now);
    }
    
    setTimeout(updateDateTime, 1000);
  }

  /**
   * Met à jour la date de dernière mise à jour
   */
  function updateLastUpdate() {
    if (elements.dashboardLastUpdate) {
      const now = new Date();
      elements.dashboardLastUpdate.textContent = `${formatTime(now)}`;
    }
    state.lastUpdate = new Date();
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

  /**
   * Affiche une alerte dans la page
   */
  function showAlert(message, type = 'info') {
    if (!elements.pageAlert) return;
    
    const styles = {
      success: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-800', icon: 'fa-circle-check' },
      error: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', icon: 'fa-circle-exclamation' },
      warning: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-800', icon: 'fa-triangle-exclamation' },
      info: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800', icon: 'fa-circle-info' }
    };
    
    const style = styles[type] || styles.info;
    
    elements.pageAlert.innerHTML = `
      <div class="flex items-start gap-3 w-full">
        <i class="fas ${style.icon} text-lg mt-0.5"></i>
        <div class="flex-1 font-medium">${escapeHtml(message)}</div>
        <button class="alert-close text-slate-400 hover:text-slate-600 transition">
          <i class="fas fa-times"></i>
        </button>
      </div>
    `;
    
    elements.pageAlert.className = `${style.bg} ${style.border} ${style.text} mb-8 rounded-2xl border px-5 py-4 text-sm flex items-start gap-3 animate-slideIn`;
    elements.pageAlert.classList.remove('hidden');
    
    elements.pageAlert.querySelector('.alert-close')?.addEventListener('click', () => {
      elements.pageAlert.classList.add('hidden');
    });
    
    setTimeout(() => elements.pageAlert.classList.add('hidden'), 5000);
  }

  // ====================================
  // 6. AUTHENTIFICATION & API
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
    
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...getAuthHeaders(),
          ...options.headers
        },
        credentials: 'include'
      });
      
      if (response.status === 401 || response.status === 403) {
        localStorage.removeItem('cc_admin_auth');
        window.location.href = '/admin/adminLogin.html?session=expired';
        throw new Error('Session expirée');
      }
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || error.message || `Erreur ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error(`API Error (${url}):`, error);
      throw error;
    }
  }

  // ====================================
  // 7. CHARGEMENT DES DONNÉES
  // ====================================
  
  /**
 * Charge les informations de l'administrateur
 */
async function loadAdminInfo() {
  try {
    // D'abord, essayer de charger depuis le localStorage
    const authData = localStorage.getItem('cc_admin_auth');
    if (authData) {
      const parsed = JSON.parse(authData);
      if (parsed.admin) {
        updateAdminDisplay(parsed.admin);
      }
    }
    
    // Ensuite, rafraîchir depuis l'API pour être sûr d'avoir les dernières données
    const data = await apiFetch(CONFIG.API.ME);
    if (data?.admin) {
      const admin = data.admin;
      
      // Mettre à jour l'affichage
      updateAdminDisplay(admin);
      
      // Mettre à jour localStorage avec les dernières données
      localStorage.setItem('cc_admin_auth', JSON.stringify({
        token: getToken(),
        admin
      }));
    }
  } catch (error) {
    console.error('Erreur chargement admin:', error);
  }
}

  /**
  * Fonction utilitaire pour mettre à jour l'affichage de l'admin
 */
  function updateAdminDisplay(admin) {
  if (!admin) return;
  
  // Construire le nom complet
  let fullName = '';
  let firstName = '';
  
  if (admin.first_name && admin.last_name) {
    fullName = `${admin.first_name} ${admin.last_name}`.trim();
    firstName = admin.first_name.charAt(0).toUpperCase() + admin.first_name.slice(1).toLowerCase();
  } else if (admin.first_name) {
    fullName = admin.first_name;
    firstName = admin.first_name.charAt(0).toUpperCase() + admin.first_name.slice(1).toLowerCase();
  } else if (admin.last_name) {
    fullName = admin.last_name;
    firstName = admin.last_name.charAt(0).toUpperCase() + admin.last_name.slice(1).toLowerCase();
  } else {
    fullName = admin.email || 'Administrateur';
    firstName = admin.email ? admin.email.split('@')[0] : 'Administrateur';
  }
  
  // Mettre à jour les éléments d'affichage
  if (elements.adminName) elements.adminName.textContent = fullName;
  
  // Pour welcomeAdminName, utiliser le prénom capitalisé
  if (elements.welcomeAdminName) {
    elements.welcomeAdminName.textContent = firstName;
  }
    
    // Initiales pour l'avatar
    if (elements.adminInitials) {
      const initials = admin.first_name && admin.last_name 
        ? (admin.first_name[0] + admin.last_name[0]).toUpperCase()
        : admin.first_name 
          ? admin.first_name.substring(0, 2).toUpperCase()
          : admin.last_name
            ? admin.last_name.substring(0, 2).toUpperCase()
            : admin.email 
              ? admin.email.substring(0, 2).toUpperCase() 
              : 'AD';
      elements.adminInitials.textContent = initials;
    }
    
    // Rôle
    if (elements.adminRole) {
      elements.adminRole.textContent = admin.role === 'superadmin' 
        ? 'Super Administrateur' 
        : admin.role === 'admin' 
          ? 'Administrateur' 
          : admin.role || 'Accès sécurisé';
    }
  }

  /**
   * Charge les statistiques principales
   */
  async function loadStats() {
    if (state.isLoading.stats) return;
    
    state.isLoading.stats = true;
    
    try {
      const data = await apiFetch(CONFIG.API.STATS);
      const s = data?.stats || {};
      
      // Mettre à jour l'état
      state.stats = {
        admins: s.adminsActive || 0,
        clients: s.clientsActive || 0,
        services: s.servicesCount || 0,
        declarations: s.declarationsYear || 0,
        testimonialsPending: s.testimonialsPending || 0,
        testimonialsPublished: s.testimonialsPublished || 0,
        testimonialsTotal: (s.testimonialsPending || 0) + (s.testimonialsPublished || 0)
      };
      
      // Mettre à jour l'UI
      updateStatsUI();
      
      // Charger les stats détaillées en parallèle
      await Promise.all([
        loadClientStats(),
        loadDeclarationStats(),
        loadDocumentsStats(),
        loadActivity()
      ]);
      
      updateLastUpdate();
      
    } catch (error) {
      console.error('Erreur chargement stats:', error);
      showAlert('Impossible de charger les statistiques', 'error');
    } finally {
      state.isLoading.stats = false;
    }
  }

  /**
   * Met à jour l'interface des statistiques
   */
  function updateStatsUI() {
    // Stats principales
    if (elements.statAdmins) elements.statAdmins.textContent = formatNumber(state.stats.admins);
    if (elements.statClients) elements.statClients.textContent = formatNumber(state.stats.clients);
    if (elements.statServices) elements.statServices.textContent = formatNumber(state.stats.services);
    if (elements.statDeclarations) elements.statDeclarations.textContent = formatNumber(state.stats.declarations);
    
    // Témoignages
    if (elements.statTestimonialsPending) {
      elements.statTestimonialsPending.textContent = formatNumber(state.stats.testimonialsPending);
    }
    if (elements.statTestimonialsPublished) {
      elements.statTestimonialsPublished.textContent = formatNumber(state.stats.testimonialsPublished);
    }
    if (elements.statTestimonialsTotal) {
      elements.statTestimonialsTotal.textContent = formatNumber(state.stats.testimonialsTotal);
    }
    
    // Barres de progression des témoignages
    if (state.stats.testimonialsTotal > 0) {
      if (elements.testimonialsPendingBar) {
        const pendingPercent = (state.stats.testimonialsPending / state.stats.testimonialsTotal) * 100;
        elements.testimonialsPendingBar.style.width = `${Math.min(pendingPercent, 100)}%`;
      }
      if (elements.testimonialsPublishedBar) {
        const publishedPercent = (state.stats.testimonialsPublished / state.stats.testimonialsTotal) * 100;
        elements.testimonialsPublishedBar.style.width = `${Math.min(publishedPercent, 100)}%`;
      }
    }
  }

  /**
   * Charge les statistiques clients
   */
  async function loadClientStats() {
    try {
      const data = await apiFetch(CONFIG.API.CLIENTS_STATS);
      if (data?.stats) {
        state.clientStats = {
          particuliers: data.stats.particuliers || 0,
          autonomes: data.stats.travailleurs_autonomes || 0,
          pme: data.stats.pme || 0,
          total: data.stats.total || 0
        };
        
        updateClientStatsUI();
        renderClientChart();
      }
    } catch (error) {
      console.error('Erreur chargement stats clients:', error);
    }
  }

  /**
   * Met à jour l'interface des stats clients
   */
  function updateClientStatsUI() {
    if (elements.clientParticuliers) {
      elements.clientParticuliers.textContent = formatNumber(state.clientStats.particuliers);
    }
    if (elements.clientAutonomes) {
      elements.clientAutonomes.textContent = formatNumber(state.clientStats.autonomes);
    }
    if (elements.clientPME) {
      elements.clientPME.textContent = formatNumber(state.clientStats.pme);
    }
    if (elements.totalClientsPie) {
      elements.totalClientsPie.textContent = formatNumber(state.clientStats.total);
    }
  }

  /**
   * Dessine le graphique de répartition des clients
   */
  function renderClientChart() {
    if (!elements.clientTypeChart) return;
    
    const ctx = elements.clientTypeChart.getContext('2d');
    
    // Détruire le graphique existant s'il y en a un
    if (window.clientChart) {
      window.clientChart.destroy();
    }
    
    const total = state.clientStats.total;
    if (total === 0) {
      // Pas de données
      ctx.clearRect(0, 0, 160, 160);
      ctx.font = '10px Inter';
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'center';
      ctx.fillText('Aucune donnée', 80, 85);
      return;
    }
    
    // Créer le graphique en camembert
    window.clientChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Particuliers', 'Travailleurs autonomes', 'PME'],
        datasets: [{
          data: [
            state.clientStats.particuliers,
            state.clientStats.autonomes,
            state.clientStats.pme
          ],
          backgroundColor: [
            CONFIG.CHART_COLORS.particuliers,
            CONFIG.CHART_COLORS.autonomes,
            CONFIG.CHART_COLORS.pme
          ],
          borderWidth: 0,
          hoverOffset: 5
        }]
      },
      options: {
        cutout: '70%',
        plugins: {
          tooltip: { enabled: false },
          legend: { display: false }
        },
        responsive: false,
        maintainAspectRatio: true
      }
    });
  }

  /**
   * Charge les statistiques des documents gouvernementaux
   */
  async function loadDocumentsStats() {
    try {
      const data = await apiFetch(CONFIG.API.DOCUMENTS_STATS);
      if (!data?.stats) return;

      const s = data.stats;

      const elTotal   = document.getElementById('statGovDocs');
      const elClients = document.getElementById('statGovDocsClients');

      if (elTotal) elTotal.textContent = formatNumber(s.total || 0);
      if (elClients) {
        elClients.innerHTML = `<i class="fas fa-users"></i><span>${s.clients_avec_docs || 0} client${(s.clients_avec_docs || 0) > 1 ? 's' : ''}</span>`;
      }
    } catch (error) {
      console.error('Erreur chargement stats documents gouvernementaux:', error);
    }
  }

  /**
   * Charge les statistiques des déclarations
   */
  async function loadDeclarationStats() {
    try {
      const data = await apiFetch(CONFIG.API.DECLARATIONS_STATS);
      if (data?.stats) {
        state.declarationStats = {
          recu: data.stats.recu || 0,
          submitted: data.stats.submitted || 0,  // ← AJOUT
          en_traitement: data.stats.en_traitement || 0,
          documents_manquants: data.stats.documents_manquants || 0,
          terminee: data.stats.terminee || 0,
          refusee: data.stats.refusee || 0,
          brouillon: data.stats.brouillon || 0,
          total: data.stats.total || 0
        };
        
        updateDeclarationStatsUI();
      }
    } catch (error) {
      console.error('Erreur chargement stats déclarations:', error);
    }
  }

  /**
  * Met à jour l'interface des stats déclarations
  */
  function updateDeclarationStatsUI() {
    // Définir les groupes de statuts
    const recusGroup = [
      'recu', 'received', 'reçu', 
      'submitted', 'soumis'  // ← On ajoute "submitted" ici
    ];
    
    // Calculer le total des reçus en incluant tous les statuts équivalents
    let recusTotal = state.declarationStats.recu;
    
    // Ajouter les statuts supplémentaires s'ils existent
    if (state.declarationStats.submitted) recusTotal += state.declarationStats.submitted;
    if (state.declarationStats.received) recusTotal += state.declarationStats.received;
    
    // Afficher les nombres
    if (elements.statDeclarationsRecues) {
      elements.statDeclarationsRecues.textContent = formatNumber(recusTotal);
    }
    if (elements.statDeclarationsTraitement) {
      elements.statDeclarationsTraitement.textContent = formatNumber(state.declarationStats.en_traitement);
    }
    if (elements.statDeclarationsManquants) {
      elements.statDeclarationsManquants.textContent = formatNumber(state.declarationStats.documents_manquants);
    }
    if (elements.statDeclarationsTerminees) {
      elements.statDeclarationsTerminees.textContent = formatNumber(state.declarationStats.terminee);
    }
    
    // Calculer le total affiché
    const displayedTotal = 
      recusTotal +
      state.declarationStats.en_traitement +
      state.declarationStats.documents_manquants +
      state.declarationStats.terminee;
    
    // Barres de progression
    if (displayedTotal > 0) {
      if (elements.declarationsRecuesBar) {
        const recuPercent = (recusTotal / displayedTotal) * 100;
        elements.declarationsRecuesBar.style.width = `${Math.min(recuPercent, 100)}%`;
      }
      if (elements.declarationsTraitementBar) {
        const traitementPercent = (state.declarationStats.en_traitement / displayedTotal) * 100;
        elements.declarationsTraitementBar.style.width = `${Math.min(traitementPercent, 100)}%`;
      }
      if (elements.declarationsManquantsBar) {
        const manquantsPercent = (state.declarationStats.documents_manquants / displayedTotal) * 100;
        elements.declarationsManquantsBar.style.width = `${Math.min(manquantsPercent, 100)}%`;
      }
      if (elements.declarationsTermineesBar) {
        const termineesPercent = (state.declarationStats.terminee / displayedTotal) * 100;
        elements.declarationsTermineesBar.style.width = `${Math.min(termineesPercent, 100)}%`;
      }
    }
    
    // Log de débogage
    console.log('Stats déclarations UI:', {
      recusTotal,
      en_traitement: state.declarationStats.en_traitement,
      documents_manquants: state.declarationStats.documents_manquants,
      terminee: state.declarationStats.terminee,
      displayedTotal
    });
  }

  /**
   * Charge l'activité récente
   */
  async function loadActivity() {
    if (state.isLoading.activity) return;
    
    state.isLoading.activity = true;
    
    try {
      const data = await apiFetch(CONFIG.API.ACTIVITY);
      state.activities = data?.activities || [];
      renderActivityTimeline();
    } catch (error) {
      console.error('Erreur chargement activité:', error);
    } finally {
      state.isLoading.activity = false;
    }
  }

  /**
   * Affiche la timeline d'activité
   */
  function renderActivityTimeline() {
    if (!elements.activityTimeline) return;
    
    if (state.activities.length === 0) {
      elements.activityTimeline.innerHTML = `
        <div class="flex flex-col items-center justify-center py-8">
          <div class="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-3">
            <i class="fas fa-clock text-2xl text-slate-400"></i>
          </div>
          <p class="text-sm font-medium text-slate-700">Aucune activité récente</p>
          <p class="text-xs text-slate-500 mt-1">Les actions récentes apparaîtront ici</p>
        </div>
      `;
      return;
    }
    
    elements.activityTimeline.innerHTML = state.activities.map((activity, index) => {
      const date = new Date(activity.created_at);
      const time = formatTime(date);
      const isToday = new Date().toDateString() === date.toDateString();
      
      return `
        <div class="timeline-item">
          <div class="flex items-start gap-3">
            <div class="w-8 h-8 rounded-full ${getActivityIconBg(activity.type)} flex items-center justify-center flex-shrink-0">
              <i class="fas ${getActivityIcon(activity.type)} text-white text-xs"></i>
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <p class="text-sm font-semibold text-slate-900">${escapeHtml(activity.title || 'Activité')}</p>
                <span class="text-xs px-2 py-0.5 rounded-full ${getActivityBadge(activity.type)}">
                  ${getActivityLabel(activity.type)}
                </span>
              </div>
              <p class="text-xs text-slate-600 mt-0.5">${escapeHtml(activity.description || '')}</p>
              <p class="text-xs text-slate-400 mt-1.5 flex items-center gap-1">
                <i class="fas fa-clock"></i>
                ${isToday ? `Aujourd'hui à ${time}` : formatDateTime(activity.created_at)}
              </p>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * Récupère l'icône pour un type d'activité
   */
  function getActivityIcon(type) {
    const icons = {
      declaration: 'fa-file-invoice',
      client: 'fa-user-plus',
      testimonial: 'fa-comment',
      service: 'fa-cog',
      admin: 'fa-user-shield',
      document: 'fa-file-pdf'
    };
    return icons[type] || 'fa-circle';
  }

  /**
   * Récupère la couleur de fond pour l'icône
   */
  function getActivityIconBg(type) {
    const bg = {
      declaration: 'bg-blue-600',
      client: 'bg-emerald-600',
      testimonial: 'bg-purple-600',
      service: 'bg-amber-600',
      admin: 'bg-indigo-600',
      document: 'bg-orange-600'
    };
    return bg[type] || 'bg-slate-600';
  }

  /**
   * Récupère le badge pour le type d'activité
   */
  function getActivityBadge(type) {
    const badges = {
      declaration: 'bg-blue-100 text-blue-800',
      client: 'bg-emerald-100 text-emerald-800',
      testimonial: 'bg-purple-100 text-purple-800',
      service: 'bg-amber-100 text-amber-800',
      admin: 'bg-indigo-100 text-indigo-800',
      document: 'bg-orange-100 text-orange-800'
    };
    return badges[type] || 'bg-slate-100 text-slate-800';
  }

  /**
   * Récupère le libellé pour le type d'activité
   */
  function getActivityLabel(type) {
    const labels = {
      declaration: 'Déclaration',
      client: 'Client',
      testimonial: 'Témoignage',
      service: 'Service',
      admin: 'Admin',
      document: 'Document'
    };
    return labels[type] || type;
  }

  // ====================================
  // 8. NOTIFICATIONS (système amélioré)
  // ====================================

  const NOTIF_KEYS = {
    SEEN_AT:   'cc_admin_notif_seen_at',
    TOTALS:    'cc_admin_notif_totals',
    TOASTED:   'cc_admin_notif_toasted'   // signature des derniers items toastés
  };

  // ── Persistance localStorage ────────────────────────────────────────────────

  function getSeenAt() {
    const raw = localStorage.getItem(NOTIF_KEYS.SEEN_AT);
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  function setSeenAt(iso) {
    try { localStorage.setItem(NOTIF_KEYS.SEEN_AT, iso); } catch {}
  }
  function getLastTotals() {
    try { return JSON.parse(localStorage.getItem(NOTIF_KEYS.TOTALS) || '{}') || {}; } catch { return {}; }
  }
  function setLastTotals(obj) {
    try { localStorage.setItem(NOTIF_KEYS.TOTALS, JSON.stringify(obj || {})); } catch {}
  }
  function getToastedSig() {
    return localStorage.getItem(NOTIF_KEYS.TOASTED) || '';
  }
  function setToastedSig(sig) {
    try { localStorage.setItem(NOTIF_KEYS.TOASTED, sig); } catch {}
  }

  // ── Badge ───────────────────────────────────────────────────────────────────

  function setBadge(count) {
    if (!elements.notifBadge) return;
    const val = Number(count || 0);
    if (val <= 0) {
      elements.notifBadge.classList.add('hidden');
      elements.notifBadge.textContent = '0';
      elements.notifBtn?.classList.remove('notif-pulse');
    } else {
      elements.notifBadge.classList.remove('hidden');
      elements.notifBadge.textContent = String(Math.min(val, 99));
      elements.notifBtn?.classList.add('notif-pulse');
    }
  }

  // ── Horloge relative "Mis à jour il y a Xs" ─────────────────────────────────

  let _notifLastUpdateAt = null;
  let _notifRelativeTimer = null;

  function startRelativeTimer() {
    if (_notifRelativeTimer) clearInterval(_notifRelativeTimer);
    _notifRelativeTimer = setInterval(updateRelativeTime, 10000);
  }

  function updateRelativeTime() {
    if (!elements.notifLastUpdate || !_notifLastUpdateAt) return;
    const diffMs  = Date.now() - _notifLastUpdateAt;
    const diffSec = Math.floor(diffMs / 1000);
    let label;
    if (diffSec < 10)       label = 'à l\'instant';
    else if (diffSec < 60)  label = `il y a ${diffSec}s`;
    else if (diffSec < 120) label = 'il y a 1 min';
    else                    label = `il y a ${Math.floor(diffSec / 60)} min`;
    elements.notifLastUpdate.textContent = label;
  }

  // ── Indicateur de chargement dans le panel ──────────────────────────────────

  function setNotifLoading(isLoading) {
    const btn = elements.notifRefresh;
    if (!btn) return;
    if (isLoading) {
      btn.innerHTML = '<i class="fas fa-spinner fa-spin text-xs"></i>';
      btn.disabled = true;
    } else {
      btn.innerHTML = '<i class="fas fa-sync-alt text-xs"></i>';
      btn.disabled = false;
    }
  }

  // ── Rendu du panel ───────────────────────────────────────────────────────────

  function formatNotificationLine(label, newCount, total, href, icon, color) {
    const isNew = newCount > 0;
    const badge = isNew
      ? `<span class="inline-flex items-center justify-center min-w-[22px] h-6 px-1.5 rounded-full bg-gradient-to-br from-red-600 to-red-500 text-white text-xs font-bold shadow">${Math.min(newCount, 99)}</span>`
      : `<span class="w-5 h-5 flex items-center justify-center rounded-full bg-slate-100 text-slate-400 text-xs">0</span>`;

    return `
      <a href="${href}"
         class="notification-item group flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-150
                ${isNew ? 'bg-blue-50 hover:bg-blue-100 border border-blue-100' : 'hover:bg-slate-50 border border-transparent'}">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-full ${color} flex items-center justify-center shadow-sm flex-shrink-0">
            <i class="fas ${icon} text-white text-xs"></i>
          </div>
          <div>
            <p class="text-sm font-semibold text-slate-900">${label}</p>
            <p class="text-xs text-slate-500 mt-0.5">${formatNumber(total)} au total</p>
          </div>
        </div>
        <div class="flex items-center gap-2 ml-2">
          ${badge}
          <i class="fas fa-chevron-right text-slate-300 text-xs group-hover:text-slate-500 transition-colors"></i>
        </div>
      </a>
    `;
  }

  function renderNotifications(summary, { loading = false, error = false } = {}) {
    if (!elements.notifList) return;

    if (loading) {
      elements.notifList.innerHTML = `
        <div class="flex flex-col items-center justify-center py-8 gap-3 text-slate-400">
          <i class="fas fa-spinner fa-spin text-2xl"></i>
          <p class="text-xs">Chargement…</p>
        </div>`;
      return;
    }

    if (error) {
      elements.notifList.innerHTML = `
        <div class="flex flex-col items-center justify-center py-8 gap-3 text-slate-400">
          <i class="fas fa-exclamation-circle text-2xl text-amber-400"></i>
          <p class="text-xs text-center">Impossible de charger<br>les notifications</p>
        </div>`;
      return;
    }

    const n = summary || {};
    const totalNew = (n.clientsNew || 0) + (n.declarationsNew || 0) + (n.testimonialsNew || 0) + (n.contactsNew || 0);

    const allReadHtml = `
      <div class="flex flex-col items-center justify-center py-6 gap-2 text-emerald-600">
        <div class="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
          <i class="fas fa-check-double text-emerald-600 text-base"></i>
        </div>
        <p class="text-sm font-semibold">Tout est à jour</p>
        <p class="text-xs text-slate-400">Aucun nouvel élément</p>
      </div>`;

    const lines = [
      formatNotificationLine('Nouveaux clients',    n.clientsNew,      n.clientsTotal,      '/admin/adminClients.html',       'fa-user-plus',    'bg-emerald-600'),
      formatNotificationLine('Déclarations',         n.declarationsNew, n.declarationsTotal, '/admin/adminDeclarations.html',  'fa-file-invoice', 'bg-blue-600'),
      formatNotificationLine('Témoignages en attente', n.testimonialsNew, n.testimonialsTotal, '/admin/adminTemoignages.html', 'fa-comments',     'bg-purple-600'),
      formatNotificationLine('Messages contact',     n.contactsNew,     n.contactsTotal,     '/admin/adminSettings.html',     'fa-envelope',     'bg-amber-600'),
    ];

    elements.notifList.innerHTML = `
      <div class="space-y-1.5 p-1">
        ${totalNew === 0 ? allReadHtml : ''}
        ${lines.join('')}
      </div>`;

    // Horloge relative
    _notifLastUpdateAt = Date.now();
    updateRelativeTime();
    startRelativeTimer();
  }

  // ── Toast intelligent (une seule fois par groupe d'items) ───────────────────

  function makeNotifSignature(summary) {
    return `${summary.clientsNew}|${summary.declarationsNew}|${summary.testimonialsNew}|${summary.contactsNew}`;
  }

  function makeHumanToast(summary) {
    const parts = [];
    if (summary.clientsNew      > 0) parts.push(`${summary.clientsNew} client${summary.clientsNew > 1 ? 's' : ''}`);
    if (summary.declarationsNew > 0) parts.push(`${summary.declarationsNew} déclaration${summary.declarationsNew > 1 ? 's' : ''}`);
    if (summary.testimonialsNew > 0) parts.push(`${summary.testimonialsNew} témoignage${summary.testimonialsNew > 1 ? 's' : ''}`);
    if (summary.contactsNew     > 0) parts.push(`${summary.contactsNew} message${summary.contactsNew > 1 ? 's' : ''}`);
    if (parts.length === 0) return null;
    return `📬 Nouveau : ${parts.join(', ')}`;
  }

  // ── Fetch depuis l'API ───────────────────────────────────────────────────────

  async function fetchNotifications() {
    const token = getToken();
    if (!token) return null;

    let seenAt = getSeenAt();
    if (!seenAt) {
      seenAt = new Date().toISOString();
      setSeenAt(seenAt);
    }

    const data = await apiFetch(`${CONFIG.API.NOTIFICATIONS}?since=${encodeURIComponent(seenAt)}`);
    if (!data?.success) return null;

    const n          = data.notifications || {};
    const lastTotals = getLastTotals();

    const resolve = (cat, key) => cat?.mode === 'since'
      ? (cat?.newSince ?? 0)
      : Math.max(0, (cat?.total ?? 0) - (lastTotals[key] ?? (cat?.total ?? 0)));

    const summary = {
      clientsNew:      resolve(n.clients,      'clientsTotal'),
      declarationsNew: resolve(n.declarations, 'declarationsTotal'),
      testimonialsNew: resolve(n.testimonials, 'testimonialsTotal'),
      contactsNew:     resolve(n.contacts,     'contactsTotal'),
      clientsTotal:      n.clients?.total      ?? 0,
      declarationsTotal: n.declarations?.total ?? 0,
      testimonialsTotal: n.testimonials?.total ?? 0,
      contactsTotal:     n.contacts?.total     ?? 0,
    };

    setLastTotals({
      clientsTotal:      summary.clientsTotal,
      declarationsTotal: summary.declarationsTotal,
      testimonialsTotal: summary.testimonialsTotal,
      contactsTotal:     summary.contactsTotal,
    });

    return { now: data.now, summary };
  }

  // ── Gestionnaire principal ──────────────────────────────────────────────────

  let _notifLastBadge = 0;
  let _notifErrorCount = 0;        // compteur d'erreurs consécutives
  let _notifPollingId  = null;
  let _notifPanelOpen  = false;

  async function refreshNotifications({ silent = false, showLoading = false } = {}) {
    if (state.isLoading.notifications) return;
    state.isLoading.notifications = true;
    if (showLoading) renderNotifications(null, { loading: true });
    setNotifLoading(true);

    try {
      const result = await fetchNotifications();

      if (!result) {
        _notifErrorCount++;
        if (!silent) renderNotifications(null, { error: true });
        return;
      }

      _notifErrorCount = 0;
      const { summary } = result;
      const totalNew = summary.clientsNew + summary.declarationsNew + summary.testimonialsNew + summary.contactsNew;

      renderNotifications(summary);
      setBadge(totalNew);

      // Toast uniquement si nouveaux éléments ET signature différente (anti-spam)
      if (!silent && totalNew > 0) {
        const sig = makeNotifSignature(summary);
        if (sig !== getToastedSig()) {
          const msg = makeHumanToast(summary);
          if (msg) showToast(msg, 'info');
          setToastedSig(sig);
        }
      }

      _notifLastBadge = totalNew;
    } catch (err) {
      _notifErrorCount++;
      console.error('Erreur notifications:', err);
      if (!silent) renderNotifications(null, { error: true });
    } finally {
      state.isLoading.notifications = false;
      setNotifLoading(false);
    }
  }

  // ── Polling adaptatif ───────────────────────────────────────────────────────

  function getPollingInterval() {
    // Backoff exponentiel sur erreurs, max 2 min
    if (_notifErrorCount > 0) return Math.min(CONFIG.NOTIFICATION_POLLING * Math.pow(2, _notifErrorCount), 120000);
    // Panel ouvert → intervalle court
    if (_notifPanelOpen) return 8000;
    return CONFIG.NOTIFICATION_POLLING;
  }

  function scheduleNextPoll() {
    if (_notifPollingId) clearTimeout(_notifPollingId);
    _notifPollingId = setTimeout(async () => {
      // Pause si onglet non visible
      if (!document.hidden) {
        await refreshNotifications({ silent: !_notifPanelOpen });
      }
      scheduleNextPoll();
    }, getPollingInterval());
  }

  function startNotifPolling() {
    scheduleNextPoll();
    // Page Visibility API : reprendre immédiatement quand l'onglet redevient visible
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        if (_notifPollingId) clearTimeout(_notifPollingId);
        refreshNotifications({ silent: true }).then(scheduleNextPoll);
      }
    });
  }

  // ── Contrôles du panel ──────────────────────────────────────────────────────

  function openNotifPanel() {
    if (!elements.notifPanel || !elements.notifBtn) return;
    _notifPanelOpen = true;

    elements.notifPanel.classList.remove('hidden');
    elements.notifPanel.style.opacity = '0';
    elements.notifPanel.style.transform = 'translateY(-8px) scale(0.97)';
    elements.notifPanel.style.transition = 'opacity 0.15s ease, transform 0.15s ease';
    requestAnimationFrame(() => {
      elements.notifPanel.style.opacity = '1';
      elements.notifPanel.style.transform = 'translateY(0) scale(1)';
    });

    elements.notifBtn.setAttribute('aria-expanded', 'true');
    setSeenAt(new Date().toISOString());
    refreshNotifications({ silent: true, showLoading: false });
  }

  function closeNotifPanel() {
    if (!elements.notifPanel || !elements.notifBtn) return;
    _notifPanelOpen = false;

    elements.notifPanel.style.opacity = '0';
    elements.notifPanel.style.transform = 'translateY(-8px) scale(0.97)';
    setTimeout(() => {
      elements.notifPanel.classList.add('hidden');
      elements.notifPanel.style.transition = '';
    }, 150);

    elements.notifBtn.setAttribute('aria-expanded', 'false');

    // Marquer comme vu une fois fermé → le badge s'efface au prochain poll
    setSeenAt(new Date().toISOString());
    setToastedSig('');                 // Réinitialiser la signature pour le prochain cycle
  }

  function toggleNotifPanel() {
    if (!elements.notifPanel) return;
    if (elements.notifPanel.classList.contains('hidden')) {
      openNotifPanel();
    } else {
      closeNotifPanel();
    }
  }

  function markAllAsRead() {
    setSeenAt(new Date().toISOString());
    setLastTotals({});
    setToastedSig('');
    _notifLastBadge = 0;
    setBadge(0);
    refreshNotifications({ silent: true });
    showToast('Notifications marquées comme lues', 'success');
  }

  // ====================================
  // 9. INITIALISATION DES ÉVÉNEMENTS
  // ====================================
  
  function initEventListeners() {
    // Rafraîchir les stats
    elements.refreshStatsBtn?.addEventListener('click', () => {
      loadStats();
      showToast('Données actualisées', 'success', 2000);
    });
    
    // Rafraîchir l'activité
    elements.refreshActivityBtn?.addEventListener('click', () => {
      loadActivity();
      showToast('Activité actualisée', 'success', 2000);
    });
    
    // Notifications
    elements.notifBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleNotifPanel();
    });
    
    elements.notifMarkRead?.addEventListener('click', markAllAsRead);
    
    elements.notifRefresh?.addEventListener('click', () => {
      refreshNotifications({ silent: true });
      showToast('Notifications actualisées', 'success', 2000);
    });
    
    elements.notifList?.addEventListener('click', (e) => {
      const a = e.target?.closest?.('a');
      if (!a) return;
      closeNotifPanel();
    });
    
    // Fermer les panels au clic extérieur
    document.addEventListener('click', (e) => {
      if (!elements.notifPanel || elements.notifPanel.classList.contains('hidden')) return;
      if (!elements.notifPanel.contains(e.target) && !elements.notifBtn?.contains(e.target)) {
        closeNotifPanel();
      }
    });
    
    // Touche Echap
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeNotifPanel();
      }
    });
  }

  /**
   * Formate une date avec heure
   */
  function formatDateTime(dateString) {
    if (!dateString) return '—';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '—';
    }
  }

  // ====================================
  // 10. INITIALISATION
  // ====================================
  
  async function init() {
    
    // Vérifier l'authentification
    if (!checkAuth()) return;
    
    // Démarrer l'horloge
    updateDateTime();
    
    // Charger les données admin
    await loadAdminInfo();
    
    // Charger les statistiques
    await loadStats();
    
    // Initialiser les notifications
    await refreshNotifications({ silent: true });

    // Initialiser les écouteurs d'événements
    initEventListeners();

    // Mettre à jour la date de dernière mise à jour
    updateLastUpdate();

    // Polling adaptatif des notifications (Page Visibility + backoff erreurs)
    startNotifPolling();

    // Rafraîchissement périodique des stats
    setInterval(() => {
      if (!document.hidden) loadStats();
    }, CONFIG.REFRESH_INTERVAL);
  }

  // Démarrer l'application
  init();
});