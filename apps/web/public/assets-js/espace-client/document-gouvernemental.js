// web/public/assets-js/espace-client/document-gouvernemental.js
'use strict';

(function () {

  const API = '/api/client/espace-client/gouvernemental-documents';

  let currentFilters = { year: '', authority: '' };

  // ============================================
  // HELPER FETCH (même pattern que documents.js)
  // ============================================

  async function fetchJson(url) {
    try {
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      return null;
    }
  }

  // ============================================
  // INIT
  // ============================================

  document.addEventListener('DOMContentLoaded', () => {
    populateYears();
    bindFilters();
    loadStats();
    loadDocuments();
  });

  // ============================================
  // FILTRES
  // ============================================

  function populateYears() {
    const sel = document.getElementById('filterYear');
    if (!sel) return;
    const current = new Date().getFullYear();
    for (let y = current; y >= current - 6; y--) {
      const opt = document.createElement('option');
      opt.value = y;
      opt.textContent = y;
      sel.appendChild(opt);
    }
  }

  function bindFilters() {
    document.getElementById('btnFilter')?.addEventListener('click', () => {
      currentFilters.year      = document.getElementById('filterYear')?.value || '';
      currentFilters.authority = document.getElementById('filterAuthority')?.value || '';
      loadDocuments();
    });

    document.getElementById('btnReset')?.addEventListener('click', () => {
      document.getElementById('filterYear').value      = '';
      document.getElementById('filterAuthority').value = '';
      currentFilters = { year: '', authority: '' };
      loadDocuments();
    });
  }

  // ============================================
  // STATS
  // ============================================

  async function loadStats() {
    try {
      const data = await fetchJson(`${API}/stats`);
      if (!data?.success) return;
      const s = data.stats;
      setText('statTotal',     s.total || 0);
      setText('statActifs',    s.actifs || 0);
      setText('statDownloads', s.total_telechargements || 0);
      setText('statAnnees',    s.annees_distinctes || 0);
    } catch (e) {
      // Silently fail
    }
  }

  // ============================================
  // CHARGEMENT DES DOCUMENTS
  // ============================================

  async function loadDocuments() {
    showState('loading');

    try {
      const params = new URLSearchParams();
      if (currentFilters.year)      params.set('year',      currentFilters.year);
      if (currentFilters.authority) params.set('authority', currentFilters.authority);

      const url = params.toString() ? `${API}?${params}` : API;
      const data = await fetchJson(url);

      if (!data?.success || !data.documents?.length) {
        showState('empty');
        return;
      }

      renderDocuments(data.documents);
      showState('list');
    } catch (e) {
      showState('empty');
    }
  }

  // ============================================
  // RENDU
  // ============================================

  function renderDocuments(docs) {
    const container = document.getElementById('documentsList');
    if (!container) return;

    // Clear existing listeners
    container.querySelectorAll('.doc-download-btn').forEach(btn => {
      btn.replaceWith(btn.cloneNode(true));
    });

    container.innerHTML = docs.map(doc => {
      const authorityBadge = authorityHtml(doc.document_authority);
      const date           = formatDate(doc.upload_date);
      const size           = formatSize(doc.file_size);
      const declType       = doc.declaration_type
        ? `<span class="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-medium">${esc(doc.declaration_type)}</span>`
        : '';

      return `
        <div class="doc-card bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="p-5 border-b border-slate-100">
            <div class="flex items-start gap-3">
              <div class="w-12 h-12 rounded-xl ${fileIconBg(doc.mime_type)} flex items-center justify-center flex-shrink-0 text-xl">
                ${fileIconHtml(doc.mime_type)}
              </div>
              <div class="min-w-0 flex-1">
                <p class="font-semibold text-slate-900 text-sm truncate" title="${esc(doc.original_name)}">
                  ${esc(doc.original_name)}
                </p>
                <div class="flex flex-wrap items-center gap-2 mt-1.5">
                  ${authorityBadge}
                  ${declType}
                </div>
              </div>
            </div>
          </div>

          <div class="px-5 py-4 space-y-2 text-sm text-slate-600">
            <div class="flex items-center justify-between">
              <span class="flex items-center gap-1.5 text-slate-400 text-xs"><i class="fas fa-calendar-alt"></i> Année fiscale</span>
              <span class="font-bold text-slate-900">${doc.tax_year || '—'}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="flex items-center gap-1.5 text-slate-400 text-xs"><i class="fas fa-clock"></i> Déposé le</span>
              <span class="text-slate-700 text-xs">${date}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="flex items-center gap-1.5 text-slate-400 text-xs"><i class="fas fa-weight-hanging"></i> Taille</span>
              <span class="text-slate-700 text-xs">${size}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="flex items-center gap-1.5 text-slate-400 text-xs"><i class="fas fa-download"></i> Téléchargements</span>
              <span class="font-semibold ${doc.download_count > 0 ? 'text-emerald-600' : 'text-slate-400'} text-xs">${doc.download_count || 0}</span>
            </div>
            ${doc.notes ? `
            <div class="mt-3 pt-3 border-t border-slate-100">
              <p class="text-xs text-slate-400 mb-1"><i class="fas fa-sticky-note mr-1"></i>Note</p>
              <p class="text-xs text-slate-600 italic">${esc(doc.notes)}</p>
            </div>` : ''}
          </div>

          <div class="px-5 py-3 bg-slate-50 border-t border-slate-100">
            <button
              data-doc-id="${parseInt(doc.id, 10)}"
              data-doc-name="${esc(doc.original_name)}"
              class="doc-download-btn w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-sm font-medium hover:from-blue-700 hover:to-indigo-700 transition shadow-sm shadow-blue-500/30">
              <i class="fas fa-download"></i>
              Télécharger
            </button>
          </div>
        </div>`;
    }).join('');

    // Attach event listeners for download buttons
    container.querySelectorAll('[data-doc-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.docId, 10);
        const name = btn.dataset.docName || '';
        if (id) window.downloadDocument(id, name);
      });
    });
  }

  // ============================================
  // TÉLÉCHARGEMENT
  // ============================================

  window.downloadDocument = function (documentId, originalName) {
    const a = document.createElement('a');
    a.href     = `${API}/${documentId}/download`;
    a.download = originalName || 'document';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(loadStats, 1500);
  };

  // ============================================
  // HELPERS UI
  // ============================================

  function showState(state) {
    const loading = document.getElementById('loadingState');
    const empty   = document.getElementById('emptyState');
    const list    = document.getElementById('documentsList');

    loading?.classList.toggle('hidden', state !== 'loading');
    loading?.classList.toggle('flex',   state === 'loading');
    empty?.classList.toggle('hidden',   state !== 'empty');
    empty?.classList.toggle('flex',     state === 'empty');
    list?.classList.toggle('hidden',    state !== 'list');
    list?.classList.toggle('grid',      state === 'list');
  }

  function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  function esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('fr-CA', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function formatSize(bytes) {
    if (!bytes) return '—';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function authorityHtml(authority) {
    const map = {
      REVENU_QUEBEC: ['badge-quebec', 'fa-map-pin',   'Revenu Québec'],
      REVENU_CANADA: ['badge-canada', 'fa-leaf',      'Revenu Canada'],
      BOTH:          ['badge-both',   'fa-handshake', 'Les deux'],
    };
    const [cls, icon, label] = map[authority] || ['badge-file', 'fa-building', authority || 'N/A'];
    return `<span class="${cls} px-2.5 py-0.5 rounded-full text-xs font-semibold inline-flex items-center gap-1">
              <i class="fas ${icon} text-xs"></i>${label}
            </span>`;
  }

  function fileIconHtml(mime) {
    if (mime?.includes('pdf'))   return '<i class="fas fa-file-pdf text-red-500"></i>';
    if (mime?.includes('word'))  return '<i class="fas fa-file-word text-blue-500"></i>';
    if (mime?.includes('image')) return '<i class="fas fa-file-image text-emerald-500"></i>';
    if (mime?.includes('zip'))   return '<i class="fas fa-file-zipper text-amber-500"></i>';
    return '<i class="fas fa-file text-slate-400"></i>';
  }

  function fileIconBg(mime) {
    if (mime?.includes('pdf'))   return 'bg-red-50';
    if (mime?.includes('word'))  return 'bg-blue-50';
    if (mime?.includes('image')) return 'bg-emerald-50';
    if (mime?.includes('zip'))   return 'bg-amber-50';
    return 'bg-slate-100';
  }

})();