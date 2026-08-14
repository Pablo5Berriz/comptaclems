'use strict';

(function () {
  // ====================================
  // ÉLÉMENTS DOM - AJOUT DES NOUVEAUX ÉLÉMENTS
  // ====================================
  const els = {
    alert: document.getElementById('pageAlert'),
    loading: document.getElementById('loading'),
    profile: document.getElementById('profileSection'),
    nextSteps: document.getElementById('nextSteps'),
    btn: document.getElementById('btnContinueDeclaration'),
    btnLabel: document.getElementById('btnDeclarationLabel'),
    btnIcon: document.getElementById('btnDeclarationIcon'),

    fullName: document.getElementById('pFullName'),
    email: document.getElementById('pEmail'),
    fiscalYear: document.getElementById('pFiscalYear'),
    submissionId: document.getElementById('pSubmissionId'),
    status: document.getElementById('pStatus'),
    updatedAt: document.getElementById('pUpdatedAt'),
    
    // NOUVEAUX ÉLÉMENTS
    initials: document.getElementById('pInitials'),
    initialsContainer: document.getElementById('pInitialsContainer'),
    phone: document.getElementById('pPhone'),
    phoneContainer: document.getElementById('pPhoneContainer'),
    memberSince: document.getElementById('pMemberSince'),
    documentsBadge: document.getElementById('documentsBadge'),
    govDocsBadge: document.getElementById('govDocsBadge'),
    govDocsCardBadge: document.getElementById('govDocsCardBadge'),
    govDocsCardCount: document.getElementById('govDocsCardCount'),
    govDocsCardPlural: document.getElementById('govDocsCardPlural'),
    govDocsLastDate: document.getElementById('govDocsLastDate'),
    govDocsLastDateText: document.getElementById('govDocsLastDateText'),
    
    // Activité récente
    activityTimeline: document.getElementById('activityTimeline'),
    refreshActivityBtn: document.getElementById('refreshActivityBtn'),
  };

  // ====================================
  // CONFIGURATION
  // ====================================
  const CONFIG = {
    me: '/api/client/espace-client/me',
    declaration: '/espace-client/declaration.html',
    documents: '/espace-client/documents.html',
    follow: '/espace-client/suivi-declaration.html',
    activity: '/api/client/espace-client/activity/recent',
    documentsCount: '/api/client/espace-client/documents/count',
    govDocsStats: '/api/client/espace-client/gouvernemental-documents/stats',
  };

  // ====================================
  // STATUS MAPPING
  // ====================================
  const STATUS = {
    not_started: {
      label: 'À commencer',
      btn: ['Commencer une déclaration', `${CONFIG.declaration}?step=1`, 'fa-file-circle-plus'],
    },
    draft: {
      label: 'En cours',
      btn: ['Continuer ma déclaration', CONFIG.declaration, 'fa-file-pen'],
    },
    submitted: {
      label: 'Soumise',
      btn: ['Suivre ma déclaration', CONFIG.follow, 'fa-eye'], // Changé : redirige vers suivi
    },
    recu: {  // AJOUT : pour le statut "recu"
      label: 'Reçue',
      btn: ['Suivre ma déclaration', CONFIG.follow, 'fa-eye'],
    },
    received: {  // Garder pour compatibilité
      label: 'Reçue',
      btn: ['Suivre ma déclaration', CONFIG.follow, 'fa-eye'],
    },
    processing: {
      label: 'En traitement',
      btn: ['Suivre ma déclaration', CONFIG.follow, 'fa-spinner'],
    },
    en_traitement: {  // AJOUT : version française
      label: 'En traitement',
      btn: ['Suivre ma déclaration', CONFIG.follow, 'fa-spinner'],
    },
    needs_info: {
      label: 'Informations requises',
      btn: ['Compléter la déclaration', CONFIG.declaration, 'fa-triangle-exclamation'],
    },
    documents_manquants: {  // AJOUT
      label: 'Documents manquants',
      btn: ['Téléverser documents', CONFIG.declaration, 'fa-file-upload'],
    },
    completed: {
      label: 'Terminée',
      btn: ['Accéder à mes documents', CONFIG.documents, 'fa-folder-open'],
    },
    terminee: {  // AJOUT : version française
      label: 'Terminée',
      btn: ['Accéder à mes documents', CONFIG.documents, 'fa-folder-open'],
    },
    cancelled: {
      label: 'Annulée',
      btn: ['Consulter', CONFIG.follow, 'fa-eye'],
    },
    rejected: {
      label: 'Refusée',
      btn: ['Recommencer une déclaration', `${CONFIG.declaration}?new=1`, 'fa-rotate-left'],
    },
    refusee: {  // AJOUT : version française
      label: 'Refusée',
      btn: ['Recommencer une déclaration', `${CONFIG.declaration}?new=1`, 'fa-rotate-left'],
    },
  };

  // ====================================
  // FONCTION getInitials - EXTRAIT LES INITIALES
  // ====================================
  function getInitials(firstName, lastName) {
    if (!firstName && !lastName) return 'CL';
    const first = firstName ? firstName.charAt(0).toUpperCase() : '';
    const last = lastName ? lastName.charAt(0).toUpperCase() : '';
    return (first + last) || 'CL';
  }

  // ====================================
  // FONCTION formatMemberSince - FORMATTE LA DATE D'INSCRIPTION
  // ====================================
  function formatMemberSince(dateString) {
    if (!dateString) return '—';
    try {
      const date = new Date(dateString);
      return date.toLocaleString('fr-FR', {
        month: 'long',
        year: 'numeric'
      });
    } catch {
      return '—';
    }
  }

  // ====================================
  // FONCTION formatPhone - FORMATE EN FORMAT CANADIEN (514) 123-4567
  // ====================================
  function formatPhone(phone) {
    if (!phone) return null;
    const cleaned = String(phone).replace(/\D/g, '');
    // Format nord-américain 10 chiffres : (514) 123-4567
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0,3)}) ${cleaned.slice(3,6)}-${cleaned.slice(6)}`;
    }
    // Format avec indicatif +1 : +1 (514) 123-4567
    if (cleaned.length === 11 && cleaned[0] === '1') {
      return `+1 (${cleaned.slice(1,4)}) ${cleaned.slice(4,7)}-${cleaned.slice(7)}`;
    }
    return phone;
  }

  // ====================================
  // FONCTION getStatusClass — retourne la classe CSS sémantique (pas Tailwind)
  // ====================================
  function getStatusClass(normalizedStatus) {
    // Utilise directement le statut normalisé → classe CSS définie dans profil.css
    return `status-${normalizedStatus}`;
  }

  function normalizeStatus(status) {
    if (!status) return 'not_started';
    
    const statusMap = {
      'not_started': 'not_started',
      'draft': 'draft',
      'submitted': 'submitted',
      'recu': 'recu',
      'received': 'received',
      'en_traitement': 'en_traitement',
      'processing': 'processing',
      'needs_info': 'needs_info',
      'documents_manquants': 'documents_manquants',
      'terminee': 'terminee',
      'completed': 'completed',
      'refusee': 'refusee',
      'rejected': 'rejected',
      'cancelled': 'cancelled'
    };
    
    return statusMap[status] || 'not_started';
  }

  // ====================================
  // FONCTION getStatusIcon
  // ====================================
  function getStatusIcon(statusLabel) {
    const icons = {
      'À commencer': 'fa-clock',
      'En cours': 'fa-pen-to-square',
      'Soumise': 'fa-paper-plane',
      'Reçue': 'fa-inbox',
      'En traitement': 'fa-gear',
      'Informations requises': 'fa-circle-exclamation',
      'Terminée': 'fa-check-circle',
      'Annulée': 'fa-ban',
      'Refusée': 'fa-times-circle'
    };
    return icons[statusLabel] || 'fa-clock';
  }

  // ====================================
  // FONCTION formatDate
  // ====================================
  function formatDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleString('fr-CA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  // ====================================
  // FONCTION formatRelativeDate
  // ====================================
  function formatRelativeDate(dateString) {
    if (!dateString) return '—';
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now - date;
      const diffMin = Math.floor(diffMs / 60000);
      
      if (diffMin < 1) return "À l'instant";
      if (diffMin < 60) return `Il y a ${diffMin} min`;
      if (diffMin < 1440) return `Il y a ${Math.floor(diffMin / 60)} h`;
      if (diffMin < 10080) return `Il y a ${Math.floor(diffMin / 1440)} j`;
      
      return formatDate(dateString);
    } catch {
      return '—';
    }
  }

  // ====================================
  // FONCTION renderNextSteps
  // ====================================
  function renderNextSteps(status) {
    if (!els.nextSteps) return;

    const stepsMap = {
      'not_started': [
        'Démarrer votre déclaration fiscale',
        'Renseigner vos informations personnelles',
        'Téléverser vos documents'
      ],
      'draft': [
        'Compléter le formulaire fiscal',
        'Téléverser les justificatifs',
        'Soumettre votre déclaration'
      ],
      'submitted': [
        'Déclaration soumise avec succès',
        'En attente de réception par nos services',
        'Vous serez notifié par courriel'
      ],
      'recu': [
        'Déclaration reçue par notre équipe',
        'Vérification initiale des documents',
        'Traitement en cours'
      ],
      'received': [
        'Déclaration reçue par notre équipe',
        'Vérification initiale des documents',
        'Traitement en cours'
      ],
      'processing': [
        'Déclaration en cours de traitement',
        'Analyse des documents fiscaux',
        'Vous serez contacté si nécessaire'
      ],
      'en_traitement': [
        'Déclaration en cours de traitement',
        'Analyse des documents fiscaux',
        'Vous serez contacté si nécessaire'
      ],
      'needs_info': [
        'Documents manquants détectés',
        'Veuillez fournir les justificatifs demandés',
        'Contactez votre comptable si besoin'
      ],
      'documents_manquants': [
        'Documents supplémentaires requis',
        'Consultez les messages de votre comptable',
        'Téléversez les documents manquants'
      ],
      'completed': [
        'Déclaration traitée avec succès',
        'Documents disponibles en téléchargement',
        'Archivez vos documents pour vos dossiers'
      ],
      'terminee': [
        'Déclaration traitée avec succès',
        'Documents disponibles en téléchargement',
        'Archivez vos documents pour vos dossiers'
      ],
      'cancelled': [
        'Déclaration annulée',
        'Contactez-nous pour plus d\'informations',
        'Vous pouvez soumettre une nouvelle déclaration'
      ],
      'rejected': [
        'Déclaration refusée',
        'Consultez les messages pour les raisons',
        'Vous pouvez soumettre une nouvelle déclaration'
      ],
      'refusee': [
        'Déclaration refusée',
        'Consultez les messages pour les raisons',
        'Vous pouvez soumettre une nouvelle déclaration'
      ]
    };

    const steps = stepsMap[status] || stepsMap['not_started'];
    
    els.nextSteps.innerHTML = steps.map((step, index) => `
      <div class="step-item">
        <div class="w-8 h-8 rounded-lg ${index === 0 ? 'bg-blue-600' : 'bg-slate-200'} flex items-center justify-center flex-shrink-0">
          <i class="fas ${index === 0 ? 'fa-arrow-right text-white' : 'fa-circle text-slate-400'} text-sm"></i>
        </div>
        <div class="flex-1">
          <p class="text-sm font-medium ${index === 0 ? 'text-slate-900' : 'text-slate-600'}">${step}</p>
          ${index === 0 ? '<span class="inline-flex items-center gap-1 text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full mt-1"><i class="fas fa-clock"></i> Action requise</span>' : ''}
        </div>
      </div>
    `).join('');
  }

  // ====================================
  // FONCTION fetchActivity
  // ====================================
  async function fetchActivity() {
    if (!els.activityTimeline) return;
    
    try {
      const r = await fetch(CONFIG.activity, { credentials: 'include' });
      
      if (!r.ok) {
        els.activityTimeline.innerHTML = `
          <div class="flex flex-col items-center justify-center py-8 text-center">
            <div class="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-3">
              <i class="fas fa-clock text-2xl text-slate-400"></i>
            </div>
            <p class="text-sm font-medium text-slate-700">Activité récente</p>
            <p class="text-xs text-slate-500 mt-1">Bientôt disponible</p>
          </div>
        `;
        return;
      }
      
      const data = await r.json();
      const activities = data?.activities || [];
      
      if (activities.length === 0) {
        els.activityTimeline.innerHTML = `
          <div class="flex flex-col items-center justify-center py-8 text-center">
            <div class="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-3">
              <i class="fas fa-clock text-2xl text-slate-400"></i>
            </div>
            <p class="text-sm font-medium text-slate-700">Aucune activité récente</p>
            <p class="text-xs text-slate-500 mt-1">Vos actions apparaîtront ici</p>
          </div>
        `;
        return;
      }
      
      els.activityTimeline.innerHTML = activities.slice(0, 5).map(act => {
        let icon = 'fa-circle';
        let color = 'bg-slate-600';
        
        if (act.type === 'declaration') {
          icon = 'fa-file-invoice';
          color = 'bg-blue-600';
        } else if (act.type === 'document') {
          icon = 'fa-file-pdf';
          color = 'bg-emerald-600';
        } else if (act.type === 'login') {
          icon = 'fa-right-to-bracket';
          color = 'bg-indigo-600';
        }
        
        return `
          <div class="timeline-item">
            <div class="flex items-start gap-3">
              <div class="w-8 h-8 rounded-full ${color} flex items-center justify-center flex-shrink-0">
                <i class="fas ${icon} text-white text-xs"></i>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-slate-900">${act.title || 'Mise à jour'}</p>
                <p class="text-xs text-slate-600 mt-0.5">${act.description || ''}</p>
                <p class="text-xs text-slate-400 mt-1.5 flex items-center gap-1">
                  <i class="fas fa-clock"></i>
                  ${formatRelativeDate(act.created_at)}
                </p>
              </div>
            </div>
          </div>
        `;
      }).join('');
      
    } catch (e) {
      if (els.activityTimeline) {
        els.activityTimeline.innerHTML = `
          <div class="flex flex-col items-center justify-center py-8 text-center">
            <div class="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-3">
              <i class="fas fa-clock text-2xl text-slate-400"></i>
            </div>
            <p class="text-sm font-medium text-slate-700">Activité récente</p>
            <p class="text-xs text-slate-500 mt-1">Service temporairement indisponible</p>
          </div>
        `;
      }
    }
  }

  // ====================================
  // API - RÉCUPÉRATION DES DONNÉES CLIENT
  // ====================================
  async function fetchMe() {
    const r = await fetch(CONFIG.me, { credentials: 'include', cache: 'no-store' });
    if (!r.ok) return null;
    const j = await r.json();
    return j.success ? j.data : null;
  }

  // ====================================
  // NOUVELLE FONCTION : Récupérer le nombre de documents
  // ====================================
  async function fetchDocumentsCount() {
    try {
      const r = await fetch(CONFIG.documentsCount, { credentials: 'include' });
      if (!r.ok) {
        return 0;
      }
      const data = await r.json();
      // Adapter selon la structure réelle de la réponse
      return data.total || data.count || 0;
    } catch (e) {
      return 0;
    }
  }

  // ====================================
  // RENDER - MODIFIÉ POUR INCLURE LE COMPTEUR
  // ====================================
  async function render(data) {
    // Normaliser le statut
    const normalizedStatus = normalizeStatus(data.status);
    const meta = STATUS[normalizedStatus] || STATUS.not_started;

    // ===== INFORMATIONS PERSONNELLES =====
    if (els.fullName) els.fullName.textContent = data.fullName || 'Client';
    if (els.email) els.email.textContent = data.email || '—';
    
    // Téléphone
    if (data.phone) {
      const formattedPhone = formatPhone(data.phone);
      if (els.phone) els.phone.textContent = formattedPhone;
      if (els.phoneContainer) els.phoneContainer.style.display = 'flex';
    } else {
      if (els.phoneContainer) els.phoneContainer.style.display = 'none';
    }
    
    // Initiales
    if (data.fullName) {
      const nameParts = data.fullName.split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';
      const initials = getInitials(firstName, lastName);
      if (els.initials) els.initials.textContent = initials;
    }
    
    // Client depuis
    if (data.created_at) {
      if (els.memberSince) els.memberSince.textContent = formatMemberSince(data.created_at);
    }
    
    // ===== DOSSIER FISCAL =====
    if (els.fiscalYear) els.fiscalYear.textContent = data.fiscal_year || '—';
    if (els.submissionId) els.submissionId.textContent = data.submission_id || '—';
    
    // Statut avec mapping corrigé
    if (els.status) {
      const icon = getStatusIcon(meta.label);
      els.status.className = `status-badge ${getStatusClass(normalizedStatus)}`;
      els.status.innerHTML = `<i class="fas ${icon}"></i> ${meta.label}`;
    }
    
    if (els.updatedAt) els.updatedAt.textContent = formatDate(data.updated_at);

    // Bouton intelligent
    if (els.btn && els.btnLabel && els.btnIcon) {
      els.btn.href = meta.btn[1];
      els.btnLabel.textContent = meta.btn[0];
      els.btnIcon.className = `fas ${meta.btn[2]} text-sm`;
    }

    // ===== COMPTEUR DE DOCUMENTS =====
    if (els.documentsBadge) {
      try {
        const count = await fetchDocumentsCount();
        els.documentsBadge.textContent = count;
        
        if (count === 0) {
          els.documentsBadge.classList.add('hidden');
        } else {
          els.documentsBadge.classList.remove('hidden');
        }
      } catch (e) {
        console.error('Erreur chargement compteur documents:', e);
        els.documentsBadge.classList.add('hidden');
      }
    }

    // ===== COMPTEUR DOCUMENTS GOUVERNEMENTAUX =====
    try {
      const govData = await (window.http
        ? window.http.get(CONFIG.govDocsStats)
        : fetch(CONFIG.govDocsStats, { credentials: 'include' }).then(r => r.json()));
      if (govData?.success && govData?.stats) {
        const total = parseInt(govData.stats.actifs || govData.stats.total || 0);
        
        // Badge bouton colonne gauche
        if (els.govDocsBadge) {
          if (total > 0) {
            els.govDocsBadge.textContent = total;
            els.govDocsBadge.classList.remove('hidden');
          } else {
            els.govDocsBadge.classList.add('hidden');
          }
        }

        // Card colonne droite
        if (els.govDocsCardBadge && total > 0) {
          if (els.govDocsCardCount) els.govDocsCardCount.textContent = total;
          if (els.govDocsCardPlural) els.govDocsCardPlural.textContent = total > 1 ? 's' : '';
          els.govDocsCardBadge.classList.remove('hidden');
          els.govDocsCardBadge.classList.add('flex');
        }

        // Dernière date de dépôt
        if (govData.stats.dernier_depot && els.govDocsLastDate && els.govDocsLastDateText) {
          const date = new Date(govData.stats.dernier_depot).toLocaleDateString('fr-CA', {
            year: 'numeric', month: 'long', day: 'numeric'
          });
          els.govDocsLastDateText.textContent = `Dernier dépôt : ${date}`;
          els.govDocsLastDate.classList.remove('hidden');
          els.govDocsLastDate.classList.add('flex');
        }
      }
    } catch (e) {
      console.error('Erreur chargement stats documents gouvernementaux:', e);
    }

    // Affichage du profil + session pill desktop
    els.loading.classList.add('hidden');
    els.profile.classList.remove('hidden');
    const sessionPillDesktop = document.getElementById('sessionPill');
    if (sessionPillDesktop) sessionPillDesktop.style.display = 'inline-flex';
    
    // Prochaines étapes
    renderNextSteps(normalizedStatus);
    
    // Activité récente
    if (els.activityTimeline) {
      fetchActivity();
    }
  }

  // ====================================
  // INIT - MODIFIÉ
  // ====================================
  async function init() {
    els.loading.classList.remove('hidden');

    const me = await fetchMe();
    if (!me) {
      window.location.href = '/auth/login.html';
      return;
    }

    await render(me); 
    
    // Bouton rafraîchir activité
    if (els.refreshActivityBtn) {
      els.refreshActivityBtn.addEventListener('click', async () => {
        const icon = els.refreshActivityBtn.querySelector('i');
        if (icon) icon.classList.add('fa-spin');
        
        await fetchActivity();
        
        if (icon) setTimeout(() => icon.classList.remove('fa-spin'), 500);
      });
    }
  }

  // ====================================
  // DÉMARRAGE
  // ====================================
  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init)
    : init();
})();