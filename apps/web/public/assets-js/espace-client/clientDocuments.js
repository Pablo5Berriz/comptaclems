'use strict';

/* ============================================================
 *  clientDocuments.js — Page "Mes documents fiscaux"
 *  Appelle /api/client/espace-client/client-documents/*
 * ============================================================ */

const BASE = '/api/client/espace-client/client-documents';

/* ── État global ── */
let allDocuments = [];
let currentPage  = 1;
const PER_PAGE   = 12;

/* ── Éléments DOM ── */
const els = {};

function boot() {
  els.list           = document.getElementById('list');
  els.loading        = document.getElementById('loading');
  els.empty          = document.getElementById('empty');
  els.pagination     = document.getElementById('pagination');
  els.currentPage    = document.getElementById('currentPage');
  els.showingInfo    = document.getElementById('showingInfo');
  els.prevPage       = document.getElementById('prevPage');
  els.nextPage       = document.getElementById('nextPage');
  els.searchInput    = document.getElementById('searchInput');
  els.yearSelect     = document.getElementById('yearSelect');
  els.authoritySelect= document.getElementById('authoritySelect');
  els.applyFilters   = document.getElementById('applyFilters');
  els.refreshBtn     = document.getElementById('refreshBtn');
  els.logoutBtn      = document.getElementById('logoutBtn');
  els.statsTotal     = document.getElementById('statsTotal');
  els.statsQuebec    = document.getElementById('statsQuebec');
  els.statsCanada    = document.getElementById('statsCanada');
  els.statsDownloads = document.getElementById('statsDownloads');
  els.activeFiltersCount = document.getElementById('activeFiltersCount');
  els.previewModal   = document.getElementById('previewModal');
  els.previewFrame   = document.getElementById('previewFrame');
  els.previewTitle   = document.getElementById('previewTitle');
  els.previewMeta    = document.getElementById('previewMeta');
  els.previewIcon    = document.getElementById('previewIcon');
  els.closePreview   = document.getElementById('closePreview');

  bindEvents();
  loadStats();
  loadDocuments();
}

/* ── Chargement stats ── */
async function loadStats() {
  try {
    const res  = await fetch(`${BASE}/stats`, { credentials: 'include' });
    const data = await res.json();
    if (!data.success) return;
    const s = data.stats;
    if (els.statsTotal)     els.statsTotal.textContent     = s.total_documents   || 0;
    if (els.statsQuebec)    els.statsQuebec.textContent    = s.quebec_docs        || 0;
    if (els.statsCanada)    els.statsCanada.textContent    = s.canada_docs        || 0;
    if (els.statsDownloads) els.statsDownloads.textContent = s.total_downloads    || 0;

    // Remplir le select des années
    if (data.available_years && els.yearSelect) {
      data.available_years.forEach(yr => {
        const opt = document.createElement('option');
        opt.value = yr;
        opt.textContent = yr;
        els.yearSelect.appendChild(opt);
      });
    }
  } catch (_) {}
}

/* ── Chargement documents ── */
async function loadDocuments() {
  setLoading(true);

  const year      = els.yearSelect?.value      || '';
  const authority = els.authoritySelect?.value || '';
  const params    = new URLSearchParams();
  if (year)      params.set('year', year);
  if (authority) params.set('authority', authority);

  // Compteur filtres actifs
  let activeCount = 0;
  if (year) activeCount++;
  if (authority) activeCount++;
  if (els.searchInput?.value.trim()) activeCount++;
  if (els.activeFiltersCount) els.activeFiltersCount.textContent = activeCount;

  try {
    const res  = await fetch(`${BASE}?${params}`, { credentials: 'include' });
    const data = await res.json();

    if (!data.success) {
      showError('Impossible de charger vos documents. Veuillez réessayer.');
      return;
    }

    allDocuments = data.documents || [];

    // Filtre texte côté client
    const search = (els.searchInput?.value || '').toLowerCase().trim();
    const filtered = search
      ? allDocuments.filter(d =>
          (d.original_name || d.file_name || '').toLowerCase().includes(search))
      : allDocuments;

    currentPage = 1;
    renderPage(filtered);
  } catch (_) {
    showError('Erreur de connexion. Veuillez vérifier votre réseau.');
  } finally {
    setLoading(false);
  }
}

/* ── Rendu d'une page ── */
function renderPage(docs) {
  const total  = docs.length;
  const pages  = Math.max(1, Math.ceil(total / PER_PAGE));
  currentPage  = Math.min(currentPage, pages);
  const start  = (currentPage - 1) * PER_PAGE;
  const slice  = docs.slice(start, start + PER_PAGE);

  if (total === 0) {
    els.list.innerHTML = '';
    els.empty.classList.remove('hidden');
    els.pagination.classList.add('hidden');
    return;
  }

  els.empty.classList.add('hidden');
  els.list.innerHTML = `
    <div class="docs-grid">
      ${slice.map(docCard).join('')}
    </div>`;

  // Pagination
  if (total > PER_PAGE) {
    els.pagination.classList.remove('hidden');
    els.currentPage.textContent = currentPage;
    els.showingInfo.textContent =
      `Affichage de ${start + 1} à ${Math.min(start + PER_PAGE, total)} sur ${total} documents`;
    els.prevPage.disabled = currentPage === 1;
    els.nextPage.disabled = currentPage === pages;
  } else {
    els.pagination.classList.add('hidden');
    els.showingInfo.textContent = `${total} document${total > 1 ? 's' : ''}`;
  }

  // Bind boutons
  slice.forEach(doc => {
    document.getElementById(`download-${doc.id}`)
      ?.addEventListener('click', () => downloadDoc(doc));
    document.getElementById(`preview-${doc.id}`)
      ?.addEventListener('click', () => previewDoc(doc));
  });
}

/* ── Carte document ── */
function docCard(doc) {
  const ext      = (doc.original_name || doc.file_name || '').split('.').pop().toLowerCase();
  const icon     = extIcon(ext);
  const authLabel= authorityLabel(doc.document_authority);
  const size     = doc.file_size_formatted || formatSize(doc.file_size);
  const date     = doc.upload_date ? new Date(doc.upload_date).toLocaleDateString('fr-CA') : '—';

  return `
    <div class="doc-card" data-id="${doc.id}">
      <div class="doc-card-header">
        <div class="doc-icon ${extClass(ext)}" aria-hidden="true">
          <i class="fas ${icon}"></i>
        </div>
        <div class="doc-badges">
          <span class="badge badge-authority">${authLabel}</span>
          ${doc.tax_year ? `<span class="badge badge-year">${doc.tax_year}</span>` : ''}
        </div>
      </div>
      <div class="doc-card-body">
        <p class="doc-name" title="${doc.original_name || doc.file_name}">${doc.original_name || doc.file_name || 'Sans titre'}</p>
        <p class="doc-meta">${size} · Ajouté le ${date}</p>
        ${doc.notes ? `<p class="doc-notes">${doc.notes}</p>` : ''}
      </div>
      <div class="doc-card-actions">
        <button id="preview-${doc.id}" class="btn btn-outline btn-sm" aria-label="Prévisualiser">
          <i class="fas fa-eye"></i> Aperçu
        </button>
        <button id="download-${doc.id}" class="btn btn-navy btn-sm" aria-label="Télécharger">
          <i class="fas fa-download"></i> Télécharger
        </button>
      </div>
    </div>`;
}

/* ── Téléchargement ── */
async function downloadDoc(doc) {
  try {
    const res = await fetch(`${BASE}/${doc.id}/download`, { credentials: 'include' });
    if (!res.ok) { showToast('Téléchargement impossible.', 'error'); return; }
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = doc.original_name || doc.file_name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Téléchargement démarré.', 'success');
  } catch (_) {
    showToast('Erreur lors du téléchargement.', 'error');
  }
}

/* ── Prévisualisation ── */
async function previewDoc(doc) {
  const ext = (doc.original_name || doc.file_name || '').split('.').pop().toLowerCase();
  if (!['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) {
    showToast('Aperçu non disponible pour ce type de fichier. Veuillez télécharger.', 'info');
    return;
  }
  els.previewTitle.textContent = doc.original_name || doc.file_name;
  els.previewMeta.textContent  = `${doc.tax_year || ''} · ${authorityLabel(doc.document_authority)}`;
  els.previewIcon.querySelector('i').className = `fas ${extIcon(ext)}`;
  els.previewFrame.src = `${BASE}/${doc.id}/download`;
  els.previewModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

/* ── Helpers ── */
function extIcon(ext) {
  if (['pdf'].includes(ext))              return 'fa-file-pdf';
  if (['xls','xlsx'].includes(ext))      return 'fa-file-excel';
  if (['doc','docx'].includes(ext))      return 'fa-file-word';
  if (['png','jpg','jpeg','webp'].includes(ext)) return 'fa-file-image';
  return 'fa-file';
}
function extClass(ext) {
  if (ext === 'pdf')                      return 'icon-pdf';
  if (['xls','xlsx'].includes(ext))      return 'icon-excel';
  if (['doc','docx'].includes(ext))      return 'icon-word';
  if (['png','jpg','jpeg','webp'].includes(ext)) return 'icon-image';
  return 'icon-default';
}
function authorityLabel(auth) {
  if (auth === 'REVENU_QUEBEC') return 'Revenu Québec';
  if (auth === 'REVENU_CANADA') return 'Revenu Canada';
  if (auth === 'BOTH')          return 'Fédéral & Provincial';
  return auth || '—';
}
function formatSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
function setLoading(on) {
  els.loading?.classList.toggle('hidden', !on);
  if (on) { els.list.innerHTML = ''; els.empty.classList.add('hidden'); }
}
function showError(msg) {
  els.list.innerHTML = `<div class="state-box"><p class="state-title">${msg}</p></div>`;
}
function showToast(msg, type = 'info') {
  const host = document.getElementById('toastHost');
  if (!host) return;
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  host.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

/* ── Événements ── */
function bindEvents() {
  els.applyFilters?.addEventListener('click', () => { currentPage = 1; loadDocuments(); });
  els.searchInput?.addEventListener('keydown', e => { if (e.key === 'Enter') { currentPage = 1; loadDocuments(); } });
  els.refreshBtn?.addEventListener('click', () => { currentPage = 1; loadDocuments(); loadStats(); });

  els.prevPage?.addEventListener('click', () => {
    if (currentPage > 1) { currentPage--; rerenderCurrent(); }
  });
  els.nextPage?.addEventListener('click', () => {
    currentPage++;
    rerenderCurrent();
  });

  els.closePreview?.addEventListener('click', closePreviewModal);
  els.previewModal?.addEventListener('click', e => {
    if (e.target === els.previewModal) closePreviewModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closePreviewModal();
  });

  els.logoutBtn?.addEventListener('click', async () => {
    await fetch('/api/client/espace-client/session', { method: 'DELETE', credentials: 'include' }).catch(() => {});
    window.location.assign('/auth/login.html');
  });
}

function closePreviewModal() {
  els.previewModal?.classList.add('hidden');
  els.previewFrame && (els.previewFrame.src = '');
  document.body.style.overflow = '';
}

function rerenderCurrent() {
  const search   = (els.searchInput?.value || '').toLowerCase().trim();
  const filtered = search
    ? allDocuments.filter(d => (d.original_name || d.file_name || '').toLowerCase().includes(search))
    : allDocuments;
  renderPage(filtered);
}

/* ── Init ── */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
