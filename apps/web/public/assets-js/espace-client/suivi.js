'use strict';

(function () {
  const TZ = 'America/Toronto';
  
  const API_ME = '/api/client/espace-client/me';
  const DECL_ENDPOINT_PRIMARY = '/api/taxes/particuliers';
  const DECL_ENDPOINT_FALLBACK = '/api/client/espace-client/declarations';

  // ====================================
  // ÉLÉMENTS DOM
  // ====================================
  const els = {
    // Alert & Toast
    alert: document.getElementById('alert'),
    toastHost: document.getElementById('toastHost'),
    
    // KPIs
    kpiTotal: document.getElementById('kpiTotal'),
    kpiInProgress: document.getElementById('kpiInProgress'),
    kpiAction: document.getElementById('kpiAction'),
    
    // Liste
    listContainer: document.getElementById('listContainer'),
    emptyList: document.getElementById('emptyList'),
    refreshBtn: document.getElementById('refreshBtn'),
    
    // Filtres
    searchInput: document.getElementById('searchInput'),
    yearFilter: document.getElementById('yearFilter'),
    statusFilter: document.getElementById('statusFilter'),
    
    // Détails
    detailTitle: document.getElementById('detailTitle'),
    detailMeta: document.getElementById('detailMeta'),
    detailBadge: document.getElementById('detailBadge'),
    detailUpdated: document.getElementById('detailUpdated'),
    detailAction: document.getElementById('detailAction'),
    detailNotes: document.getElementById('detailNotes'),
    detailProgressText: document.getElementById('detailProgressText'),
    
    // Boutons
    btnUpload: document.getElementById('btnUpload'),
    btnSupport: document.getElementById('btnSupport'),
    
    // Timeline & Historique
    timeline: document.getElementById('timeline'),
    history: document.getElementById('history'),
  };

  // ====================================
  // STATE
  // ====================================
  const state = {
    me: null,
    declarations: [],
    filtered: [],
    selectedId: null,
    endpoint: null,
    isLoading: false,
  };

  // ====================================
  // CONFIGURATION
  // ====================================
  const statusLabels = {
    submitted: 'Soumise',
    received: 'Reçue',
    in_review: 'En revue',
    waiting_docs: 'Documents requis',
    need_info: 'Information requise',
    action_required: 'Action requise',
    processing: 'En traitement',
    filed: 'Transmise',
    completed: 'Terminée',
    cancelled: 'Annulée',
  };

  const statusClasses = {
    submitted: 'cc-badge-submitted',
    received: 'cc-badge-received',
    in_review: 'cc-badge-in_review',
    waiting_docs: 'cc-badge-need_info',
    need_info: 'cc-badge-need_info',
    action_required: 'cc-badge-need_info',
    processing: 'cc-badge-processing',
    filed: 'cc-badge-filed',
    completed: 'cc-badge-completed',
    cancelled: 'cc-badge-cancelled',
  };

  const steps = [
    { key: 'received', label: 'Réception' },
    { key: 'submitted', label: 'Soumission' },
    { key: 'in_review', label: 'Analyse' },
    { key: 'need_info', label: 'Information requise' },
    { key: 'waiting_docs', label: 'Documents requis' },
    { key: 'processing', label: 'Préparation' },
    { key: 'filed', label: 'Transmission' },
    { key: 'completed', label: 'Terminé' },
  ];

  // ====================================
  // UTILITAIRES
  // ====================================
  function escapeHtml(s) {
    if (!s && s !== 0) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatDate(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '';
      return d.toLocaleDateString('fr-FR', { 
        timeZone: TZ, 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    } catch {
      return '';
    }
  }

  function formatRelativeDate(iso) {
    if (!iso) return '';
    try {
      const date = new Date(iso);
      const now = new Date();
      const diffMs = now - date;
      const diffMin = Math.floor(diffMs / 60000);
      
      if (diffMin < 1) return "À l'instant";
      if (diffMin < 60) return `Il y a ${diffMin} min`;
      if (diffMin < 1440) return `Il y a ${Math.floor(diffMin / 60)} h`;
      if (diffMin < 10080) return `Il y a ${Math.floor(diffMin / 1440)} j`;
      
      return formatDate(iso);
    } catch {
      return '';
    }
  }

  function showToast(message, type = 'info', duration = 5000) {
    if (!els.toastHost) return;

    const icons = {
      success: 'fa-circle-check',
      error: 'fa-circle-exclamation',
      warning: 'fa-triangle-exclamation',
      info: 'fa-circle-info'
    };

    const colorMap = {
      success: { bg: '#f0fdf4', border: '#86efac', text: '#166534' },
      error: { bg: '#fef2f2', border: '#fca5a5', text: '#991b1b' },
      warning: { bg: '#fffbeb', border: '#fcd34d', text: '#92400e' },
      info: { bg: '#eff6ff', border: '#93c5fd', text: '#1e40af' }
    };

    const colors = colorMap[type] || colorMap.info;

    const toast = document.createElement('div');
    toast.style.cssText = `position:fixed;top:1.25rem;left:50%;transform:translateX(-50%);z-index:9999;max-width:28rem;width:calc(100% - 2rem);border-radius:0.875rem;border:1px solid ${colors.border};padding:1rem 1.25rem;font-size:0.875rem;display:flex;align-items:flex-start;gap:0.75rem;box-shadow:0 20px 60px rgba(0,0,0,0.15);background:${colors.bg};color:${colors.text};animation:cc-slide 0.3s ease forwards;`;
    toast.innerHTML = `
      <i class="fas ${icons[type]} text-lg mt-0.5"></i>
      <div style="flex:1;font-weight:500;">${escapeHtml(message)}</div>
      <button class="toast-close" style="background:none;border:none;cursor:pointer;opacity:0.7;transition:opacity 0.2s;">
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
    }, duration);
  }

  function showAlert(msg, type = 'info') {
    if (!els.alert) return;

    const colorMap = {
      success: { bg: '#f0fdf4', border: '#86efac', text: '#166534' },
      error: { bg: '#fef2f2', border: '#fca5a5', text: '#991b1b' },
      info: { bg: '#eff6ff', border: '#93c5fd', text: '#1e40af' },
      warning: { bg: '#fffbeb', border: '#fcd34d', text: '#92400e' }
    };

    const icons = {
      success: 'fa-circle-check',
      error: 'fa-circle-exclamation',
      info: 'fa-circle-info',
      warning: 'fa-triangle-exclamation',
    };

    const colors = colorMap[type] || colorMap.info;

    els.alert.style.cssText = `margin-bottom:2rem;padding:1.25rem;border-radius:0.875rem;font-size:0.875rem;border:1px solid ${colors.border};display:flex;align-items:flex-start;gap:0.75rem;background:${colors.bg};color:${colors.text};animation:cc-slide 0.3s ease forwards;`;
    els.alert.innerHTML = `
      <i class="fas ${icons[type] || 'fa-circle-info'} text-lg mt-0.5"></i>
      <div style="flex:1;font-weight:500;">${escapeHtml(msg)}</div>
      <button class="alert-close" style="background:none;border:none;cursor:pointer;color:inherit;opacity:0.7;transition:opacity 0.2s;">
        <i class="fas fa-times"></i>
      </button>
    `;
    els.alert.classList.remove('hidden');

    els.alert.querySelector('.alert-close').addEventListener('click', () => {
      els.alert.classList.add('hidden');
    });

    setTimeout(() => els.alert.classList.add('hidden'), 5000);
  }

  function hideAlert() {
    els.alert?.classList.add('hidden');
  }

  // ====================================
  // AUTH & API
  // ====================================
  async function fetchMeOrRedirect() {
    try {
      const res = await fetch(API_ME, {
        credentials: 'include',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });

      if (res.status === 401) {
        const redirect = encodeURIComponent(window.location.pathname + window.location.search + window.location.hash);
        window.location.assign(`/auth/login.html?redirect=${redirect}`);
        return null;
      }

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success || !json?.data) {
        showAlert("Impossible de vérifier la session. Réessaie.", 'error');
        return null;
      }

      return json.data;
    } catch (e) {
      console.error('[AUTH]', e);
      showAlert("Erreur de connexion au serveur.", 'error');
      return null;
    }
  }

  async function tryFetchJson(url) {
    try {
      const res = await fetch(url, {
        credentials: 'include',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      const json = await res.json().catch(() => null);
      return { res, json };
    } catch (e) {
      console.error('[FETCH]', url, e);
      return { res: null, json: null };
    }
  }

  // ====================================
  // NORMALISATION DES DONNÉES
  // ====================================
  function normalizeDeclarationsPayload(json) {
    const arr =
      Array.isArray(json?.data) ? json.data :
      Array.isArray(json?.declarations) ? json.declarations :
      Array.isArray(json) ? json :
      [];

    return arr
      .filter(Boolean)
      .map((d) => {
        const id = d.id ?? d.declaration_id ?? d.uuid ?? null;
        const created = d.created_at ?? d.createdAt ?? d.submitted_at ?? d.submittedAt ?? null;
        const updated = d.updated_at ?? d.updatedAt ?? d.last_update ?? d.lastUpdate ?? created;
        const rawStatus = String(d.status ?? d.state ?? 'received');

        const requiresAction =
          Boolean(d.requires_action ?? d.action_required ?? d.is_action_required) ||
          rawStatus === 'waiting_docs' ||
          rawStatus === 'need_info' ||
          rawStatus === 'action_required';

        return {
          id,
          year: d.year ?? d.fiscal_year ?? d.tax_year ?? d.annee ?? null,
          type: d.type ?? d.kind ?? d.category ?? 'Déclaration',
          status: rawStatus,
          created_at: created,
          updated_at: updated,
          requires_action: requiresAction,
          action_message: d.action_message ?? d.actionMessage ?? d.next_action ?? d.nextAction ?? '',
          notes: d.notes ?? d.internal_note ?? d.client_note ?? '',
          timeline: Array.isArray(d.timeline) ? d.timeline : [],
          history: Array.isArray(d.history) ? d.history : Array.isArray(d.events) ? d.events : [],
          reference: d.reference ?? d.ref ?? d.number ?? '',
          missing_docs: Array.isArray(d.missing_docs) ? d.missing_docs : Array.isArray(d.missingDocs) ? d.missingDocs : [],
        };
      })
      .filter((d) => d.id !== null);
  }

  // ====================================
  // CHARGEMENT DES DONNÉES
  // ====================================
  async function fetchDeclarations() {
  hideAlert();

  if (!els.listContainer) return false;

  // Afficher les squelettes
  els.listContainer.innerHTML = `
    <div class="cc-skeleton h-16"></div>
    <div class="cc-skeleton h-16"></div>
    <div class="cc-skeleton h-16"></div>
  `;
  els.emptyList?.classList.add('hidden');

  const candidates = [DECL_ENDPOINT_PRIMARY, DECL_ENDPOINT_FALLBACK]; 

  for (const url of candidates) { 
    const { res, json } = await tryFetchJson(url);

    if (res?.status === 401) {
      const redirect = encodeURIComponent(window.location.pathname + window.location.search + window.location.hash);
      window.location.assign(`/auth/login.html?redirect=${redirect}`);
      return false;
    }

    if (res?.status === 404) {
      continue;
    }
    if (!res?.ok || !json) continue;
    if (json?.success === false) continue;

    const list = normalizeDeclarationsPayload(json);
    state.endpoint = url;
    state.declarations = Array.isArray(list) ? list : []; 
    return true;
  }

  state.endpoint = null;
  state.declarations = [];
  return false;
}

  // ====================================
  // FILTRES
  // ====================================
  function buildFilters() {
    if (!els.yearFilter || !els.statusFilter) return;

    const years = Array.from(new Set(state.declarations.map((d) => d.year).filter(Boolean)))
      .map((y) => String(y))
      .sort((a, b) => Number(b) - Number(a));

    const currentYearValue = String(els.yearFilter.value || '');

    els.yearFilter.innerHTML =
      `<option value="">Toutes les années</option>` +
      years.map((y) => `<option value="${escapeHtml(y)}">${escapeHtml(y)}</option>`).join('');

    if (years.includes(currentYearValue)) els.yearFilter.value = currentYearValue;

    const statuses = Array.from(new Set(state.declarations.map((d) => String(d.status || 'received'))));
    const currentStatusValue = String(els.statusFilter.value || '');

    els.statusFilter.innerHTML =
      `<option value="">Tous les statuts</option>` +
      statuses
        .sort()
        .map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(statusLabels[s] || s)}</option>`)
        .join('');

    if (statuses.includes(currentStatusValue)) els.statusFilter.value = currentStatusValue;
  }

  function applyFilter() {
    const q = String(els.searchInput?.value || '').trim().toLowerCase();
    const year = String(els.yearFilter?.value || '').trim();
    const status = String(els.statusFilter?.value || '').trim();

    state.filtered = state.declarations.filter((d) => {
      if (year && String(d.year || '') !== year) return false;
      if (status && String(d.status || '') !== status) return false;

      if (!q) return true;

      const hay = [
        d.id,
        d.year,
        d.type,
        d.status,
        statusLabels[d.status] || d.status,
        d.reference,
      ]
        .map((x) => String(x ?? '').toLowerCase())
        .join(' ');

      return hay.includes(q);
    });
  }

  // ====================================
  // RENDU
  // ====================================
  function renderKpis() {
    const total = state.declarations.length;
    const inProgress = state.declarations.filter((d) => {
      const s = String(d.status || '');
      return !['completed', 'cancelled'].includes(s);
    }).length;
    const action = state.declarations.filter((d) => d.requires_action || String(d.status) === 'waiting_docs').length;

    if (els.kpiTotal) els.kpiTotal.textContent = String(total);
    if (els.kpiInProgress) els.kpiInProgress.textContent = String(inProgress);
    if (els.kpiAction) els.kpiAction.textContent = String(action);
  }

  function statusBadge(status) {
    const s = String(status || 'received');
    const label = statusLabels[s] || s;
    const cls = statusClasses[s] || 'cc-badge-received';

    return `<span class="cc-badge ${cls}"><i class="fas fa-circle"></i>${escapeHtml(label)}</span>`;
  }

  function computeStepIndex(status) {
    const s = String(status || 'received');
    const idx = steps.findIndex((x) => x.key === s);
    if (idx >= 0) return idx;

    if (s === 'waiting_documents') return steps.findIndex((x) => x.key === 'waiting_docs');
    if (s === 'review') return steps.findIndex((x) => x.key === 'in_review');
    if (s === 'done') return steps.findIndex((x) => x.key === 'completed');

    return 0;
  }

  function renderList() {
    if (!els.listContainer || !els.emptyList) return;

    if (!state.filtered.length) {
      els.listContainer.innerHTML = '';
      els.emptyList.classList.remove('hidden');
      return;
    }

    els.emptyList.classList.add('hidden');

    els.listContainer.innerHTML = state.filtered
      .slice()
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
      .map((d) => {
        const isSelected = String(d.id) === String(state.selectedId);
        const created = formatDate(d.created_at);
        const hasAction = d.requires_action || d.status === 'waiting_docs' || d.status === 'need_info' || d.status === 'action_required';

        return `
          <button type="button" data-id="${escapeHtml(d.id)}" 
                  class="w-full text-left p-5 rounded-2xl border transition-all ${isSelected ? 'selected' : 'declaration-item'}">
            <div class="flex items-start justify-between gap-3">
              <div class="flex-1 min-w-0">
                <div class="font-extrabold text-slate-900 flex items-center gap-2">
                  ${escapeHtml(d.type)} 
                  ${d.year ? `<span class="text-sm font-normal text-slate-500">• ${escapeHtml(d.year)}</span>` : ''}
                </div>
                <div class="text-xs text-slate-500 mt-1 flex flex-wrap gap-x-3">
                  <span class="inline-flex items-center gap-1">
                    <i class="fas fa-hashtag"></i> ${escapeHtml(d.id)}
                  </span>
                  ${d.reference ? `<span class="inline-flex items-center gap-1"><i class="fas fa-tag"></i> ${escapeHtml(d.reference)}</span>` : ''}
                  ${created ? `<span class="inline-flex items-center gap-1"><i class="fas fa-calendar"></i> ${escapeHtml(created)}</span>` : ''}
                </div>
              </div>
              <div class="shrink-0">
                ${statusBadge(d.status)}
              </div>
            </div>
            ${hasAction ? `
              <div class="mt-3 action-badge inline-flex">
                <i class="fas fa-triangle-exclamation"></i>
                Action requise
              </div>
            ` : ''}
          </button>
        `;
      })
      .join('');

    els.listContainer.querySelectorAll('button[data-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.selectedId = btn.getAttribute('data-id');
        renderDetail();
        
        // Mise à jour visuelle de la sélection
        document.querySelectorAll('.declaration-item, .selected').forEach(el => {
          el.classList.remove('selected');
        });
        btn.classList.add('selected');
      });
    });
  }

  function renderTimeline(d) {
    if (!els.timeline) return;

    const idx = computeStepIndex(d.status);

    const mapDates = new Map();
    if (Array.isArray(d.timeline)) {
      d.timeline.forEach((t) => {
        const k = String(t.key || t.status || '').trim();
        if (!k) return;
        mapDates.set(k, t.at || t.date || t.created_at || t.createdAt || null);
      });
    }

    els.timeline.innerHTML = steps
      .map((s, i) => {
        const done = i < idx;
        const current = i === idx;

        const dt = mapDates.get(s.key) || (s.key === 'received' ? d.created_at : (current ? d.updated_at : null));
        const dateText = dt ? formatRelativeDate(dt) : '';

        const dotClass = done ? 'completed' : (current ? 'current' : 'pending');

        return `
          <div class="timeline-step">
            <div class="timeline-dot ${dotClass}"></div>
            <div class="flex-1 pb-4">
              <div class="flex items-center gap-3 flex-wrap">
                <span class="font-bold text-slate-900">${escapeHtml(s.label)}</span>
                ${current ? '<span style="font-size:0.75rem;font-weight:600;background:#f0fdf4;color:#166534;border:1px solid #86efac;padding:0.25rem 0.5rem;border-radius:9999px;">En cours</span>' : ''}
                ${done ? '<span style="font-size:0.75rem;font-weight:600;background:#f0fdf4;color:#166534;border:1px solid #86efac;padding:0.25rem 0.5rem;border-radius:9999px;">Terminé</span>' : ''}
              </div>
              <div class="text-sm text-slate-600 mt-1">
                ${dateText ? `Le ${escapeHtml(dateText)}` : '—'}
              </div>
            </div>
            ${i < steps.length - 1 ? '<div class="timeline-line"></div>' : ''}
          </div>
        `;
      })
      .join('');
  }

  function renderHistory(d) {
    if (!els.history) return;

    const events = [];

    if (Array.isArray(d.history) && d.history.length) {
      d.history.forEach((ev) => {
        const at = ev.at || ev.date || ev.created_at || ev.createdAt || null;
        const label = ev.label || ev.message || ev.note || ev.status || 'Mise à jour';
        events.push({ at, label });
      });
    }

    if (!events.length) {
      if (d.created_at) events.push({ at: d.created_at, label: 'Déclaration reçue' });
      if (d.updated_at) events.push({ at: d.updated_at, label: 'Dernière mise à jour' });
    }

    events.sort((a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime());

    els.history.innerHTML = events
      .slice(0, 12)
      .map((ev) => {
        const date = ev.at ? formatRelativeDate(ev.at) : '';
        return `
          <div class="history-item flex items-start justify-between gap-4">
            <div class="font-medium text-slate-900">${escapeHtml(ev.label)}</div>
            <div class="text-xs text-slate-500 whitespace-nowrap">${escapeHtml(date)}</div>
          </div>
        `;
      })
      .join('');

    if (!events.length) {
      els.history.innerHTML = `
        <div class="text-center py-8 text-slate-500">
          <i class="fas fa-clock text-3xl text-slate-300 mb-3"></i>
          <p>Aucun historique disponible</p>
        </div>
      `;
    }
  }

  function renderDetail() {
    const d = state.declarations.find((x) => String(x.id) === String(state.selectedId)) || null;
    
    if (!d) {
      // État vide par défaut
      if (els.detailTitle) els.detailTitle.textContent = 'Aucune déclaration sélectionnée';
      if (els.detailMeta) els.detailMeta.innerHTML = '<span class="text-slate-500">Sélectionnez une déclaration dans la liste</span>';
      if (els.detailBadge) els.detailBadge.innerHTML = '<span class="cc-badge">—</span>';
      if (els.detailUpdated) els.detailUpdated.innerHTML = '<i class="fas fa-clock"></i><span>—</span>';
      if (els.detailAction) els.detailAction.textContent = '—';
      if (els.detailNotes) els.detailNotes.textContent = '—';
      if (els.detailProgressText) els.detailProgressText.textContent = '—';
      if (els.timeline) els.timeline.innerHTML = '';
      if (els.history) els.history.innerHTML = '';
      if (els.btnUpload) els.btnUpload.href = '/espace-client/documents.html';
      return;
    }

    const created = formatDate(d.created_at);
    const updated = formatRelativeDate(d.updated_at);
    const title = `${d.type || 'Déclaration'}${d.year ? ` • ${d.year}` : ''}`;

    if (els.detailTitle) els.detailTitle.textContent = title;

    if (els.detailMeta) {
      els.detailMeta.innerHTML = [
        `<span class="inline-flex items-center gap-1"><i class="fas fa-hashtag"></i>${escapeHtml(d.id)}</span>`,
        d.reference ? `<span class="inline-flex items-center gap-1"><i class="fas fa-tag"></i>${escapeHtml(d.reference)}</span>` : '',
        created ? `<span class="inline-flex items-center gap-1"><i class="fas fa-calendar"></i>${escapeHtml(created)}</span>` : '',
      ].filter(Boolean).join('<span class="text-slate-300 mx-1">•</span>');
    }

    if (els.detailBadge) els.detailBadge.innerHTML = statusBadge(d.status);

    if (els.detailUpdated) {
      els.detailUpdated.innerHTML = updated 
        ? `<i class="fas fa-clock"></i><span>Mis à jour ${escapeHtml(updated)}</span>`
        : '<i class="fas fa-clock"></i><span>—</span>';
    }

    const needsDocs = d.requires_action ||
      String(d.status) === 'waiting_docs' ||
      String(d.status) === 'need_info' ||
      String(d.status) === 'action_required';

    const missing = Array.isArray(d.missing_docs) ? d.missing_docs : [];

    const actionText = needsDocs
      ? (d.action_message || (missing.length ? `Documents requis : ${missing.join(', ')}` : "Action requise : un document ou une information manque."))
      : (d.action_message || 'Aucune action requise pour le moment.');

    if (els.detailAction) els.detailAction.textContent = actionText;

    if (els.detailNotes) {
      els.detailNotes.textContent = d.notes || 'Aucune note.';
    }

    const idx = computeStepIndex(d.status);
    if (els.detailProgressText) els.detailProgressText.textContent = `${Math.min(idx + 1, steps.length)}/${steps.length} étapes`;

    if (els.btnUpload) {
      els.btnUpload.href = `/espace-client/documents.html${d.id ? `?tax_id=${encodeURIComponent(d.id)}` : ''}`;
    }

    renderTimeline(d);
    renderHistory(d);
  }

  function renderAll() {
    applyFilter();
    renderKpis();
    renderList();
    renderDetail();
  }

  // ====================================
  // ÉVÉNEMENTS
  // ====================================
  function attachUiEvents() {
    els.refreshBtn?.addEventListener('click', async () => {
      showToast('Actualisation des données...', 'info', 2000);
      await bootData();
      showToast('Données actualisées', 'success', 2000);
    });

    els.searchInput?.addEventListener('input', renderAll);
    els.yearFilter?.addEventListener('change', renderAll);
    els.statusFilter?.addEventListener('change', renderAll);
  }

  // ====================================
  // INITIALISATION
  // ====================================
  async function bootData() {
    hideAlert();

    const ok = await fetchDeclarations();
    if (!ok) {
      if (els.listContainer) els.listContainer.innerHTML = '';
      els.emptyList?.classList.remove('hidden');
      renderDetail();
      showAlert(
        "Aucune donnée récupérée. Vérifiez que l'endpoint de suivi est accessible.",
        'error'
      );
      return;
    }

    buildFilters();

    if (!state.selectedId && state.declarations.length) {
      const sorted = [...state.declarations].sort(
        (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
      );
      state.selectedId = sorted[0]?.id || null;
    }

    renderAll();

    if (state.endpoint) {
      showAlert('Données chargées avec succès.', 'success');
    }
  }

  async function boot() {
    
    attachUiEvents();

    state.me = await fetchMeOrRedirect();
    if (!state.me) return;

    await bootData();
  }

  // Démarrer selon l'état du document
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();