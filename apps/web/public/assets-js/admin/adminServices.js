'use strict';

document.addEventListener('DOMContentLoaded', () => {
  // ====================================
  // 1. CONSTANTES & ÉLÉMENTS DOM
  // ====================================
  
  // Éléments principaux
  const tbody = document.getElementById('servicesTbody');
  const alertBox = document.getElementById('pageAlert');
  const toastHost = document.getElementById('toastHost');
  
  // Modal
  const modal = document.getElementById('serviceModal');
  const modalTitle = document.getElementById('modalTitle');
  const serviceForm = document.getElementById('serviceForm');
  const modalBackdrop = document.getElementById('modalBackdrop');
  
  // Boutons
  const openBtn = document.getElementById('openCreateService');
  const closeBtn = document.getElementById('closeModal');
  const cancelBtn = document.getElementById('cancelModal');
  const refreshBtn = document.getElementById('refreshServices');
  const submitBtn = document.getElementById('submitServiceBtn');
  const submitBtnText = document.getElementById('submitBtnText');
  
  // Champs du formulaire
  const inputId = document.getElementById('service_id');
  const inputTitle = document.getElementById('service_title');
  const inputDescription = document.getElementById('service_description');
  const inputPriceLabel = document.getElementById('service_price_label');
  const inputPrice = document.getElementById('service_price');
  const inputOrder = document.getElementById('service_order');
  const inputActive = document.getElementById('service_active');
  const inputIcon = document.getElementById('service_icon');
  const inputCtaLabel = document.getElementById('service_cta_label');
  const inputCtaHref = document.getElementById('service_cta_href');
  const iconPreview = document.getElementById('iconPreview');
  const iconPreviewBtn = document.getElementById('iconPreviewBtn');
  const descriptionCounter = document.getElementById('descriptionCounter');
  
  // Filtres et recherche
  const searchInput = document.getElementById('searchServices');
  const filterStatus = document.getElementById('filterStatus');
  
  // Statistiques
  const totalServicesEl = document.getElementById('totalServices');
  const activeServicesEl = document.getElementById('activeServices');
  const serviceCountEl = document.getElementById('serviceCount');
  const lastUpdateEl = document.getElementById('lastUpdate');
  
  // Confirmation modal
  const confirmModal = document.getElementById('confirmModal');
  const confirmMessage = document.getElementById('confirmMessage');
  const confirmDeleteBtn = document.getElementById('confirmDelete');
  const confirmCancelBtn = document.getElementById('confirmCancel');
  const confirmBackdrop = document.getElementById('confirmBackdrop');
  
  // ====================================
  // 2. STATE MANAGEMENT
  // ====================================
  
  let servicesCache = [];           
  let filteredServices = [];      
  let serviceToDelete = null;     
  let searchTimeout = null;      
  let isSubmitting = false;      
  
  // ====================================
  // 3. UTILITAIRES
  // ====================================
  
  /**
   * Formate une date en français
   * @param {string} dateString 
   * @returns {string}
   */
  function formatDate(dateString) {
    if (!dateString) return '-';
    try {
      const date = new Date(dateString);
      return new Intl.DateTimeFormat('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }).format(date);
    } catch {
      return dateString.substring(0, 10) || '-';
    }
  }
  
  /**
   * Affiche une notification toast
   * @param {string} message 
   * @param {string} type 
   * @param {number} duration 
   */
  function showToast(message, type = 'info', duration = 5000) {
    if (!toastHost) return;
    
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
    
    // Bouton fermer
    toast.querySelector('.toast-close').addEventListener('click', () => {
      toast.remove();
    });
    
    toastHost.appendChild(toast);
    
    // Auto-fermeture
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
  function showAlert(msg, type = 'error') {
    if (!alertBox) return;
    
    const icons = {
      success: 'fa-circle-check',
      error: 'fa-circle-exclamation',
      warning: 'fa-triangle-exclamation',
      info: 'fa-circle-info'
    };
    
    alertBox.className = 'hidden mb-8 rounded-2xl border px-5 py-4 text-sm flex items-start gap-3 animate-slideIn';
    alertBox.classList.remove('hidden');
    
    if (type === 'success') {
      alertBox.classList.add('bg-emerald-50', 'border-emerald-200', 'text-emerald-800');
    } else {
      alertBox.classList.add('bg-red-50', 'border-red-200', 'text-red-800');
    }
    
    alertBox.innerHTML = `
      <i class="fas ${icons[type] || 'fa-circle-info'} text-lg mt-0.5"></i>
      <div class="flex-1">${msg}</div>
      <button class="alert-close hover:opacity-70 transition" onclick="this.closest('#pageAlert').classList.add('hidden')">
        <i class="fas fa-times"></i>
      </button>
    `;
  }
  
  /**
   * Met à jour les statistiques
   */
  function updateStats() {
    if (!totalServicesEl || !activeServicesEl || !serviceCountEl) return;
    
    const total = servicesCache.length;
    const active = servicesCache.filter(s => s.is_active).length;
    
    totalServicesEl.textContent = total;
    activeServicesEl.textContent = active;
    serviceCountEl.textContent = `${total} service${total > 1 ? 's' : ''}`;
    
    // Dernière mise à jour
    if (lastUpdateEl) {
      const now = new Date();
      lastUpdateEl.textContent = `à ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    }
  }
  
  // ====================================
  // 4. AUTH & API
  // ====================================
  
  function getToken() {
    const raw = localStorage.getItem('cc_admin_auth');
    if (!raw) return null;
    try {
      return JSON.parse(raw)?.token || null;
    } catch {
      return null;
    }
  }
  
  async function api(path, options = {}) {
    const token = getToken();
    if (!token) {
      window.location.href = '/admin/adminLogin.html?session=expired';
      throw new Error('Session expirée');
    }
    
    try {
      const res = await fetch(path, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(options.headers || {})
        }
      });
      
      const data = await res.json().catch(() => ({}));
      
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          localStorage.removeItem('cc_admin_auth');
          window.location.href = '/admin/adminLogin.html?session=expired';
        }
        throw new Error(data?.error || data?.message || 'Erreur serveur');
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
  // 5. GESTION DES SERVICES (CRUD)
  // ====================================
  
  /**
   * Chargement des services depuis l'API
   */
  async function loadServices() {
    try {
      // Afficher un état de chargement
      if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="6" class="px-6 py-12 text-center text-slate-500">
              <div class="flex flex-col items-center gap-3">
                <i class="fas fa-spinner fa-spin text-3xl text-slate-300"></i>
                <p class="text-sm">Chargement des services...</p>
              </div>
            </td>
          </tr>
        `;
      }
      
      const data = await api('/api/admin/services');
      servicesCache = data.services || [];
      
      // Appliquer les filtres
      applyFilters();
      updateStats();
      
      // Cacher l'alerte si succès
      if (alertBox) alertBox.classList.add('hidden');
      
    } catch (error) {
      console.error('Erreur chargement services:', error);
      showAlert(error.message, 'error');
      showToast(error.message, 'error');
      
      if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="6" class="px-6 py-12 text-center">
              <div class="flex flex-col items-center gap-4">
                <i class="fas fa-exclamation-triangle text-3xl text-red-400"></i>
                <p class="text-sm text-red-600 font-medium">Erreur de chargement</p>
                <button onclick="location.reload()" class="px-4 py-2 bg-slate-100 rounded-lg text-sm hover:bg-slate-200 transition">
                  <i class="fas fa-sync-alt mr-2"></i>Réessayer
                </button>
              </div>
            </td>
          </tr>
        `;
      }
    }
  }
  
  /**
   * Rendu du tableau des services
   */
  function renderServicesTable(services) {
    if (!tbody) return;
    
    if (!services || services.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="px-6 py-16 text-center">
            <div class="flex flex-col items-center gap-4">
              <div class="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center">
                <i class="fas fa-box-open text-3xl text-slate-400"></i>
              </div>
              <div>
                <p class="text-lg font-medium text-slate-700">Aucun service trouvé</p>
                <p class="text-sm text-slate-500 mt-1">Commencez par créer votre premier service</p>
              </div>
              <button onclick="document.getElementById('openCreateService').click()" class="mt-2 px-6 py-3 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition flex items-center gap-2">
                <i class="fas fa-plus-circle"></i>
                Créer un service
              </button>
            </div>
          </td>
        </tr>
      `;
      return;
    }
    
    tbody.innerHTML = services.map(service => {
      // Déterminer l'icône à afficher
      const iconClass = service.icon_class || 'fas fa-cog';
      
      return `
        <tr class="service-row hover:bg-slate-50 transition cursor-pointer" data-id="${service.id}">
          <td class="px-6 py-4">
            <div class="flex items-center gap-4">
              <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
                <i class="${iconClass} text-slate-700"></i>
              </div>
              <div>
                <div class="font-semibold text-slate-900">${escapeHtml(service.title) || 'Sans titre'}</div>
                <div class="text-xs text-slate-500 mt-0.5 max-w-xs truncate">
                  ${escapeHtml(service.description?.substring(0, 60) || 'Aucune description')}...
                </div>
              </div>
            </div>
          </td>
          <td class="px-6 py-4">
            <div class="font-medium text-slate-900">
              ${escapeHtml(service.price_label || 'À partir de')}
            </div>
            ${service.starting_price_cad ? `
              <div class="text-sm font-semibold text-emerald-600 mt-1">
                ${Number(service.starting_price_cad).toFixed(2)} $ CAD
              </div>
            ` : `
              <div class="text-xs text-slate-400 mt-1">Prix non défini</div>
            `}
          </td>
          <td class="px-6 py-4">
            <span class="px-3 py-1.5 bg-slate-100 rounded-lg text-sm font-mono">
              ${service.display_order || '-'}
            </span>
          </td>
          <td class="px-6 py-4">
            ${service.is_active ? `
              <span class="badge-active">
                <i class="fas fa-check-circle text-xs"></i>
                Actif
              </span>
            ` : `
              <span class="badge-inactive">
                <i class="fas fa-times-circle text-xs"></i>
                Inactif
              </span>
            `}
          </td>
          <td class="px-6 py-4 text-sm text-slate-600">
            <div>${formatDate(service.created_at)}</div>
            <div class="text-xs text-slate-400 mt-1">ID: ${service.id}</div>
          </td>
          <td class="px-6 py-4 text-right">
            <div class="flex items-center justify-end gap-2">
              <button class="editBtn px-4 py-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition flex items-center gap-2 text-slate-700 shadow-sm" data-id="${service.id}">
                <i class="fas fa-pencil-alt text-xs"></i>
                <span class="hidden sm:inline">Modifier</span>
              </button>
              <button class="deleteBtn px-4 py-2.5 bg-gradient-to-r from-red-600 to-red-500 text-white rounded-xl hover:from-red-700 hover:to-red-600 transition flex items-center gap-2 shadow-md shadow-red-500/30" data-id="${service.id}">
                <i class="fas fa-trash-alt text-xs"></i>
                <span class="hidden sm:inline">Supprimer</span>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
    
    // Ajouter l'événement de clic sur la ligne
    tbody.querySelectorAll('.service-row').forEach(row => {
      row.addEventListener('click', (e) => {
        // Ne pas déclencher si on clique sur un bouton
        if (e.target.closest('button')) return;
        const id = row.dataset.id;
        const service = servicesCache.find(s => String(s.id) === String(id));
        if (service) openModal(true, service);
      });
    });
  }
  
  /**
   * Échappe les caractères HTML pour éviter XSS
   */
  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  // ====================================
  // 6. FILTRES ET RECHERCHE
  // ====================================
  
  /**
   * Applique les filtres et la recherche
   */
  function applyFilters() {
    let filtered = [...servicesCache];
    
    // Filtre par statut
    const status = filterStatus?.value || 'all';
    if (status === 'active') {
      filtered = filtered.filter(s => s.is_active === true);
    } else if (status === 'inactive') {
      filtered = filtered.filter(s => s.is_active === false);
    }
    
    // Recherche textuelle
    const searchTerm = searchInput?.value?.toLowerCase().trim() || '';
    if (searchTerm) {
      filtered = filtered.filter(s => 
        (s.title?.toLowerCase() || '').includes(searchTerm) ||
        (s.description?.toLowerCase() || '').includes(searchTerm) ||
        (s.price_label?.toLowerCase() || '').includes(searchTerm)
      );
    }
    
    // Trier par ordre d'affichage
    filtered.sort((a, b) => {
      const orderA = a.display_order ?? 9999;
      const orderB = b.display_order ?? 9999;
      if (orderA !== orderB) return orderA - orderB;
      return (a.id || 0) - (b.id || 0);
    });
    
    filteredServices = filtered;
    renderServicesTable(filteredServices);
    updateStats();
  }
  
  /**
   * Gestionnaire de recherche avec debounce
   */
  function handleSearch() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      applyFilters();
    }, 300);
  }
  
  // ====================================
  // 7. MODAL
  // ====================================
  
  function openModal(edit = false, service = null) {
    if (!modal) return;
    
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    
    // Réinitialiser le formulaire
    serviceForm.reset();
    
    if (edit && service) {
      // Mode édition
      modalTitle.textContent = 'Modifier le service';
      submitBtnText.textContent = 'Mettre à jour';
      
      inputId.value = service.id || '';
      inputTitle.value = service.title || '';
      inputDescription.value = service.description || '';
      inputPriceLabel.value = service.price_label || 'À partir de';
      inputPrice.value = service.starting_price_cad ?? '';
      inputOrder.value = service.display_order ?? '';
      inputActive.checked = service.is_active ?? true;
      inputIcon.value = service.icon_class || 'fas fa-cog';
      inputCtaLabel.value = service.cta_label || 'En savoir plus';
      inputCtaHref.value = service.cta_href || '#contact';
      
      // Mettre à jour l'aperçu de l'icône
      if (iconPreview) {
        iconPreview.className = service.icon_class || 'fas fa-cog';
      }
      
    } else {
      // Mode création
      modalTitle.textContent = 'Créer un service';
      submitBtnText.textContent = 'Publier le service';
      
      inputId.value = '';
      inputActive.checked = true;
      inputPriceLabel.value = 'À partir de';
      inputIcon.value = 'fas fa-cog';
      inputCtaLabel.value = 'En savoir plus';
      inputCtaHref.value = '#contact';
      
      if (iconPreview) {
        iconPreview.className = 'fas fa-cog';
      }
    }
    
    // Mettre à jour le compteur de description
    updateDescriptionCounter();
  }
  
  function closeModal() {
    if (modal) {
      modal.classList.add('hidden');
      document.body.style.overflow = '';
      serviceForm.reset();
      isSubmitting = false;
    }
  }
  
  /**
   * Met à jour le compteur de caractères de la description
   */
  function updateDescriptionCounter() {
    if (descriptionCounter && inputDescription) {
      const length = inputDescription.value?.length || 0;
      descriptionCounter.textContent = `${length}/1000`;
    }
  }
  
  // ====================================
  // 8. CONFIRMATION DE SUPPRESSION
  // ====================================
  
  function openConfirmModal(serviceId) {
    if (!confirmModal) return;
    
    serviceToDelete = serviceId;
    const service = servicesCache.find(s => String(s.id) === String(serviceId));
    
    if (confirmMessage) {
      confirmMessage.textContent = `Voulez-vous supprimer le service "${service?.title || 'sans titre'}" ? Cette action est irréversible.`;
    }
    
    confirmModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }
  
  function closeConfirmModal() {
    if (confirmModal) {
      confirmModal.classList.add('hidden');
      document.body.style.overflow = '';
      serviceToDelete = null;
    }
  }
  
  // ====================================
  // 9. ÉVÉNEMENTS
  // ====================================
  
  // --- Table actions ---
  tbody?.addEventListener('click', async (e) => {
    const editBtn = e.target.closest('.editBtn');
    const deleteBtn = e.target.closest('.deleteBtn');
    
    if (editBtn) {
      e.stopPropagation();
      const id = editBtn.dataset.id;
      const service = servicesCache.find(s => String(s.id) === String(id));
      if (service) openModal(true, service);
    }
    
    if (deleteBtn) {
      e.stopPropagation();
      const id = deleteBtn.dataset.id;
      openConfirmModal(id);
    }
  });
  
  // --- Confirmation de suppression ---
  confirmDeleteBtn?.addEventListener('click', async () => {
    if (!serviceToDelete) return;
    
    try {
      confirmDeleteBtn.disabled = true;
      confirmDeleteBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Suppression...';
      
      await api(`/api/admin/services/${serviceToDelete}`, { method: 'DELETE' });
      
      showToast('Service supprimé avec succès', 'success');
      await loadServices();
      closeConfirmModal();
      
    } catch (err) {
      showToast(err.message, 'error');
      closeConfirmModal();
    } finally {
      confirmDeleteBtn.disabled = false;
      confirmDeleteBtn.innerHTML = '<i class="fas fa-trash mr-2"></i>Supprimer';
    }
  });
  
  confirmCancelBtn?.addEventListener('click', closeConfirmModal);
  confirmBackdrop?.addEventListener('click', closeConfirmModal);
  
  // --- Formulaire de création/édition ---
  serviceForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (isSubmitting) return;
    
    // Validation des champs obligatoires
    if (!inputTitle?.value?.trim()) {
      showToast('Le titre est obligatoire', 'error');
      inputTitle?.focus();
      return;
    }
    
    if (!inputDescription?.value?.trim()) {
      showToast('La description est obligatoire', 'error');
      inputDescription?.focus();
      return;
    }
    
    const payload = {
      title: inputTitle.value.trim(),
      description: inputDescription.value.trim(),
      price_label: inputPriceLabel?.value?.trim() || 'À partir de',
      starting_price_cad: inputPrice?.value ? Number(inputPrice.value) : null,
      display_order: inputOrder?.value ? Number(inputOrder.value) : null,
      is_active: inputActive?.checked ?? true,
      icon_class: inputIcon?.value?.trim() || 'fas fa-cog',
      cta_label: inputCtaLabel?.value?.trim() || 'En savoir plus',
      cta_href: inputCtaHref?.value?.trim() || '#contact'
    };
    
    try {
      isSubmitting = true;
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Enregistrement...';
      
      if (inputId?.value) {
        // Mode édition
        await api(`/api/admin/services/${inputId.value}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        showToast('Service modifié avec succès', 'success');
      } else {
        // Mode création
        await api('/api/admin/services', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        showToast('Service créé avec succès', 'success');
      }
      
      closeModal();
      await loadServices();
      
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      isSubmitting = false;
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fas fa-save"></i><span id="submitBtnText" class="ml-2">' + 
        (inputId?.value ? 'Mettre à jour' : 'Publier le service') + 
        '</span>';
    }
  });
  
  // --- Boutons du modal ---
  openBtn?.addEventListener('click', () => openModal(false));
  closeBtn?.addEventListener('click', closeModal);
  cancelBtn?.addEventListener('click', closeModal);
  modalBackdrop?.addEventListener('click', closeModal);
  
  // --- Actualisation ---
  refreshBtn?.addEventListener('click', () => {
    refreshBtn.disabled = true;
    refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Actualisation...';
    
    loadServices().finally(() => {
      setTimeout(() => {
        refreshBtn.disabled = false;
        refreshBtn.innerHTML = '<i class="fas fa-sync-alt mr-2"></i><span class="hidden sm:inline">Actualiser</span>';
      }, 500);
    });
  });
  
  // --- Filtres et recherche ---
  searchInput?.addEventListener('input', handleSearch);
  filterStatus?.addEventListener('change', applyFilters);
  
  // --- Aperçu de l'icône ---
  inputIcon?.addEventListener('input', () => {
    if (iconPreview) {
      iconPreview.className = inputIcon.value?.trim() || 'fas fa-cog';
    }
  });
  
  iconPreviewBtn?.addEventListener('click', () => {
    if (inputIcon && iconPreview) {
      iconPreview.className = inputIcon.value?.trim() || 'fas fa-cog';
      showToast('Aperçu mis à jour', 'info', 2000);
    }
  });
  
  // --- Compteur de description ---
  inputDescription?.addEventListener('input', updateDescriptionCounter);
  
  // --- Fermeture avec Echap ---
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!modal?.classList.contains('hidden')) {
        closeModal();
      }
      if (!confirmModal?.classList.contains('hidden')) {
        closeConfirmModal();
      }
    }
  });
  
  // --- Initialisation ---
  loadServices();
});