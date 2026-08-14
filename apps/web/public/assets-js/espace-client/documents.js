'use strict';

(function () {
  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  const els = {
    list: document.getElementById('list'),
    empty: document.getElementById('empty'),
    refreshBtn: document.getElementById('refreshBtn'),
    logoutBtn: document.getElementById('logoutBtn'),
    searchInput: document.getElementById('searchInput'),
    yearSelect: document.getElementById('yearSelect'),
    statusSelect: document.getElementById('statusSelect'),
    previewModal: document.getElementById('previewModal'),
    previewFrame: document.getElementById('previewFrame'),
    previewTitle: document.getElementById('previewTitle'),
    closePreview: document.getElementById('closePreview'),
    statsTotal: document.getElementById('statsTotal'),
    statsPending: document.getElementById('statsPending'),
    statsValidated: document.getElementById('statsValidated'),
  };

  const API = {
    me: '/api/client/espace-client/me',
    logout: '/api/client/espace-client/session',
    declarations: '/api/client/espace-client/declarations',
    documents: (id) => `/api/client/espace-client/documents/by-declaration/${id}`,
    upload: (id) => `/api/client/espace-client/documents/upload/${id}`,
    delete: (docId) => `/api/client/espace-client/documents/${docId}`,
    download: (docId) => `/api/client/espace-client/documents/${docId}/download`,
    stats: '/api/client/espace-client/documents/stats',
  };

  const UPLOAD_ALLOWED_STATUS = new Set([
    'submitted',
    'received',
    'recu',
    'needs_info',
    'processing',
    'draft',
    'not_started'
  ]);

  const STATUS_BADGES = {
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

  let declarations = [];
  let docsByTax = new Map();

  async function fetchJson(url, options = {}) {
    try {
      const res = await fetch(url, { credentials: 'include', ...options });
      if (!res.ok) {
        console.error('Erreur HTTP:', res.status, res.statusText);
        return { res, json: null };
      }
      const json = await res.json().catch(() => null);
      return { res, json };
    } catch (e) {
      console.error(`Erreur fetch ${url}:`, e);
      return { res: null, json: null };
    }
  }

  async function loadStats() {
    try {
      const { json } = await fetchJson(API.stats);
      if (json?.success) {
        if (els.statsTotal) els.statsTotal.textContent = json.total || 0;
        if (els.statsPending) els.statsPending.textContent = json.pending || 0;
        if (els.statsValidated) els.statsValidated.textContent = json.validated || 0;
      }
    } catch (e) {
      console.error('Erreur chargement stats:', e);
    }
  }

  async function loadAll() {
    try {
      // Récupérer les déclarations
      const declRes = await fetchJson(API.declarations);
      declarations = declRes?.json?.data || [];

      // Générer les options des années
      const years = [...new Set(declarations.map(d => d.year))];
      els.yearSelect.innerHTML =
        `<option value="">Toutes les années</option>` +
        years.map(y => `<option value="${y}">${y}</option>`).join('');

      // Charger les documents
      docsByTax.clear();
      
      for (const d of declarations) {
        const r = await fetchJson(API.documents(d.id));
        docsByTax.set(d.id, r?.json?.documents || []);
      }

      // Charger les stats
      await loadStats();

      render();
    } catch (e) {
      console.error('Erreur loadAll:', e);
    }
  }

  function getStatusBadge(status) {
    const badge = STATUS_BADGES[status] || STATUS_BADGES.pending;
    return `<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${badge.class} border">
      <i class="fas ${badge.icon} text-xs"></i>
      ${badge.label}
    </span>`;
  }

  function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function getFileIcon(mimeType) {
    if (!mimeType) return 'fa-file';
    if (mimeType.includes('pdf')) return 'fa-file-pdf text-red-500';
    if (mimeType.includes('image')) return 'fa-file-image text-blue-500';
    if (mimeType.includes('word')) return 'fa-file-word text-blue-700';
    if (mimeType.includes('excel')) return 'fa-file-excel text-green-600';
    return 'fa-file text-slate-500';
  }

  function render() {
    els.list.innerHTML = '';

    const q = els.searchInput.value.toLowerCase().trim();
    const y = els.yearSelect.value;
    const s = els.statusSelect.value;

    const filtered = declarations.filter(d => {
      if (y && String(d.year) !== y) return false;
      if (s && d.status !== s) return false;
      return true;
    });

    if (!filtered.length) {
      els.empty.classList.remove('hidden');
      return;
    }

    els.empty.classList.add('hidden');

    for (const decl of filtered) {
      const docs = (docsByTax.get(decl.id) || []).filter(d =>
        d.original_filename?.toLowerCase().includes(q)
      );

      const canUpload = UPLOAD_ALLOWED_STATUS.has(decl.status);

      const docsHtml = docs.length
        ? docs.map(d => {
            const fileIcon = getFileIcon(d.mime_type);
            const fileSize = formatFileSize(d.size_bytes || 0);
            const statusBadge = getStatusBadge(d.status || 'pending');
            
            return `
            <div class="border rounded-xl p-4 bg-slate-50 hover:bg-white transition-all duration-200">
              <div class="flex items-start justify-between gap-4">
                <div class="flex items-start gap-3 flex-1 min-w-0">
                  <div class="w-10 h-10 rounded-lg bg-white flex items-center justify-center shadow-sm">
                    <i class="fas ${fileIcon} text-lg"></i>
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                      <span class="font-semibold text-slate-900 truncate max-w-[300px]" title="${escapeHtml(d.original_filename)}">
                        ${escapeHtml(d.original_filename)}
                      </span>
                      ${statusBadge}
                    </div>
                    <div class="flex items-center gap-3 mt-1 text-xs text-slate-500">
                      <span>${d.document_type_label || 'Document'}</span>
                      <span>•</span>
                      <span>${fileSize}</span>
                      <span>•</span>
                      <span><i class="far fa-calendar mr-1"></i>${new Date(d.uploaded_at).toLocaleDateString('fr-FR')}</span>
                    </div>
                    ${d.status === 'rejected' && d.rejection_reason ? `
                      <div class="mt-2 text-xs text-red-600 bg-red-50 p-2 rounded-lg">
                        <i class="fas fa-exclamation-triangle mr-1"></i>
                        Rejeté : ${escapeHtml(d.rejection_reason)}
                      </div>
                    ` : ''}
                  </div>
                </div>
                <div class="flex gap-2">
                  <button data-preview="${d.id}" data-name="${d.original_filename}" 
                          class="px-3 py-2 border rounded-lg hover:bg-slate-100 transition-colors" title="Prévisualiser">
                    <i class="fa-solid fa-eye"></i>
                  </button>
                  <a href="${API.download(d.id)}" download 
                     class="px-3 py-2 border rounded-lg hover:bg-slate-100 transition-colors" title="Télécharger">
                    <i class="fa-solid fa-download"></i>
                  </a>
                  ${canUpload ? `
                  <button data-delete="${d.id}" 
                          class="px-3 py-2 border rounded-lg text-red-600 hover:bg-red-50 hover:border-red-200 transition-colors" 
                          title="Supprimer">
                    <i class="fa-solid fa-trash"></i>
                  </button>` : ''}
                </div>
              </div>
            </div>
          `}).join('')
        : `<div class="text-slate-500 text-center py-6 bg-slate-50 rounded-xl border-2 border-dashed">
            <i class="far fa-folder-open text-3xl text-slate-300 mb-2"></i>
            <p>Aucun document pour cette déclaration</p>
           </div>`;

      const docCount = docs.length;
      const countBadge = docCount > 0 
        ? `<span class="ml-2 px-2 py-0.5 bg-slate-200 text-slate-700 rounded-full text-xs">${docCount}</span>`
        : '';

      els.list.insertAdjacentHTML('beforeend', `
        <div class="bg-white border rounded-2xl p-6 space-y-4 shadow-sm hover:shadow-md transition-shadow">
          <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center">
                  <i class="fas fa-file-invoice text-white text-sm"></i>
                </div>
                <div>
                  <div class="font-bold text-lg flex items-center gap-2">
                    Déclaration ${decl.year}
                    ${countBadge}
                  </div>
                  <div class="flex items-center gap-2 mt-1">
                    <span class="text-sm text-slate-500">Statut: ${decl.status}</span>
                  </div>
                </div>
              </div>
            </div>
            ${canUpload ? `
            <label class="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 text-white hover:from-indigo-700 hover:to-indigo-800 cursor-pointer transition-all shadow-md hover:shadow-lg flex items-center gap-2">
              <i class="fas fa-upload"></i>
              Ajouter des documents
              <input type="file" hidden multiple data-upload="${decl.id}">
            </label>` : ''}
          </div>
          <div class="space-y-3">
            ${docsHtml}
          </div>
        </div>
      `);
    }

    bindActions();
  }

  function bindActions() {
    document.querySelectorAll('[data-upload]').forEach(input =>
      input.onchange = async (e) => {
        const id = e.target.dataset.upload;
        const fd = new FormData();
        [...e.target.files].forEach(f => fd.append('documents', f));
        
        try {
          const res = await fetch(API.upload(id), { 
            method: 'POST', 
            credentials: 'include', 
            body: fd 
          });
          
          if (res.ok) {
            await loadAll();
          }
        } catch (e) {
          console.error('Erreur upload:', e);
        }
      }
    );

    document.querySelectorAll('[data-delete]').forEach(btn =>
      btn.onclick = async () => {
        const docId = btn.dataset.delete;

        // Créer une modal de confirmation
        const dialog = document.createElement('dialog');
        dialog.style.cssText = 'border:none;border-radius:0.75rem;padding:0;max-width:24rem;box-shadow:0 20px 60px rgba(0,0,0,0.15);';
        dialog.innerHTML = `
          <div style="padding:1.5rem;font-family:inherit;">
            <p style="margin:0 0 1rem;font-size:0.9375rem;font-weight:600;color:#1e293b;">Supprimer ce document ?</p>
            <p style="margin:0 0 1.5rem;font-size:0.8125rem;color:#64748b;">Cette action est irréversible.</p>
            <div style="display:flex;gap:0.75rem;justify-content:flex-end;">
              <button id="dlgCancel" style="padding:0.5rem 1rem;border:1px solid #e2e8f0;border-radius:0.5rem;background:#fff;cursor:pointer;font-weight:500;color:#1e293b;">Annuler</button>
              <button id="dlgConfirm" style="padding:0.5rem 1rem;border:none;border-radius:0.5rem;background:#ef4444;color:#fff;cursor:pointer;font-weight:500;">Supprimer</button>
            </div>
          </div>`;
        document.body.appendChild(dialog);
        dialog.showModal();

        dialog.querySelector('#dlgCancel').onclick = () => { dialog.close(); dialog.remove(); };
        dialog.querySelector('#dlgConfirm').onclick = async () => {
          dialog.close();
          dialog.remove();
          try {
            const res = await fetch(API.delete(docId), {
              method: 'DELETE',
              credentials: 'include'
            });

            if (res.ok) {
              await loadAll();
            }
          } catch (e) {
            console.error('Erreur suppression:', e);
          }
        };
      }
    );

    document.querySelectorAll('[data-preview]').forEach(btn =>
      btn.onclick = (e) => {
        e.preventDefault();
        const docId = btn.dataset.preview;
        window.open(API.download(docId), '_blank');
      }
    );
  }

  els.closePreview.onclick = () => {
    els.previewFrame.src = '';
    els.previewModal.classList.add('hidden');
  };

  els.refreshBtn.onclick = loadAll;
  els.searchInput.oninput = render;
  els.yearSelect.onchange = render;
  els.statusSelect.onchange = render;

  els.logoutBtn.onclick = async () => {
    try {
      await fetch('/api/client/espace-client/session', { method: 'DELETE', credentials: 'include' });
    } catch (_) {}
    localStorage.removeItem('cc_client_auth');
    window.location.href = '/auth/login.html';
  };

  loadAll();
})();