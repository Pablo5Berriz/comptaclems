(function() {
    'use strict';
    
    const API_BASE_URL = '/api';
    
    document.addEventListener('DOMContentLoaded', function() {
        console.log('adminDocuments.js chargé');
        
        const auth = JSON.parse(localStorage.getItem('cc_admin_auth') || '{}');
        if (!auth.token || auth.expires_at < Date.now()) {
            window.location.href = '/admin/adminLogin.html';
            return;
        }
        
        initializeEventListeners();
        loadClients();
        loadDocuments();
        loadStats();
        populateYearSelects();
    });
    
    function initializeEventListeners() {
        const openUploadBtn = document.getElementById('openUploadModal');
        if (openUploadBtn) {
            openUploadBtn.addEventListener('click', function(e) {
                e.preventDefault();
                openUploadModal();
            });
        }
        
        const closeUploadBtn = document.getElementById('closeUploadModal');
        if (closeUploadBtn) closeUploadBtn.addEventListener('click', closeUploadModal);
        
        const cancelUploadBtn = document.getElementById('cancelUpload');
        if (cancelUploadBtn) cancelUploadBtn.addEventListener('click', closeUploadModal);
        
        const uploadBackdrop = document.getElementById('uploadBackdrop');
        if (uploadBackdrop) uploadBackdrop.addEventListener('click', closeUploadModal);
        
        const uploadForm = document.getElementById('uploadForm');
        if (uploadForm) uploadForm.addEventListener('submit', handleUpload);
        
        const fileInput = document.getElementById('documentFile');
        if (fileInput) fileInput.addEventListener('change', handleFileSelect);
        
        const applyFiltersBtn = document.getElementById('applyFilters');
        if (applyFiltersBtn) applyFiltersBtn.addEventListener('click', applyFilters);
        
        const resetFiltersBtn = document.getElementById('resetFilters');
        if (resetFiltersBtn) resetFiltersBtn.addEventListener('click', resetFilters);
        
        const prevPageBtn = document.getElementById('prevPage');
        if (prevPageBtn) prevPageBtn.addEventListener('click', () => changePage(currentPage - 1));
        
        const nextPageBtn = document.getElementById('nextPage');
        if (nextPageBtn) nextPageBtn.addEventListener('click', () => changePage(currentPage + 1));
        
        const limitSelect = document.getElementById('limit');
        if (limitSelect) {
            limitSelect.addEventListener('change', () => {
                currentPage = 1;
                loadDocuments();
            });
        }
        
        const drawerClose = document.getElementById('drawerClose');
        if (drawerClose) drawerClose.addEventListener('click', closeDrawer);
        
        const drawerBackdrop = document.getElementById('drawerBackdrop');
        if (drawerBackdrop) drawerBackdrop.addEventListener('click', closeDrawer);
        
        const downloadBtn = document.getElementById('downloadDocumentBtn');
        if (downloadBtn) downloadBtn.addEventListener('click', downloadCurrentDocument);
        
        const archiveBtn = document.getElementById('archiveDocumentBtn');
        if (archiveBtn) archiveBtn.addEventListener('click', toggleArchiveDocument);
        
        const deleteBtn = document.getElementById('deleteDocumentBtn');
        if (deleteBtn) deleteBtn.addEventListener('click', () => showDeleteConfirmation(currentViewDocument?.id));
        
        const confirmCancel = document.getElementById('confirmCancel');
        if (confirmCancel) confirmCancel.addEventListener('click', closeConfirmModal);
        
        const confirmAction = document.getElementById('confirmAction');
        if (confirmAction) confirmAction.addEventListener('click', executeConfirmedAction);
        
        const confirmBackdrop = document.getElementById('confirmBackdrop');
        if (confirmBackdrop) confirmBackdrop.addEventListener('click', closeConfirmModal);
        
        const logoutBtn = document.getElementById('adminLogoutBtn');
        if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
    }
    
    let currentPage = 1;
    let totalPages = 1;
    let currentFilters = { search: '', year: '', authority: '', status: 'all' };
    let currentViewDocument = null;
    let currentDocumentId = null;
    let currentAction = null;
    
    // ============================================
    // MODAL D'UPLOAD
    // ============================================
    
    function openUploadModal() {
        const modal = document.getElementById('uploadModal');
        if (modal) {
            modal.classList.remove('hidden');
            modal.classList.add('flex');
            const form = document.getElementById('uploadForm');
            if (form) form.reset();
            document.getElementById('fileInfo')?.classList.add('hidden');
        }
    }
    
    function closeUploadModal() {
        const modal = document.getElementById('uploadModal');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }
    }
    
    function handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;
        const fileInfo = document.getElementById('fileInfo');
        const fileName = document.getElementById('fileName');
        const fileSize = document.getElementById('fileSize');
        if (fileInfo && fileName && fileSize) {
            fileName.textContent = file.name;
            fileSize.textContent = formatFileSize(file.size);
            fileInfo.classList.remove('hidden');
        }
    }
    
    async function handleUpload(e) {
        e.preventDefault();
        
        // Lire clientId directement depuis le select — le hidden input du même nom
        // serait lu en premier par FormData et il est toujours vide
        const clientId = document.getElementById('clientSelect')?.value;
        if (!clientId) {
            showNotification('Veuillez sélectionner un client', 'error');
            return;
        }

        const formData = new FormData(e.target);
        // S'assurer que clientId est bien dans formData avec la bonne valeur
        formData.set('clientId', clientId);

        const submitBtn = document.getElementById('submitUpload');
        const originalText = submitBtn.innerHTML;
        
        try {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Téléversement...';
            
            const auth = JSON.parse(localStorage.getItem('cc_admin_auth') || '{}');
            
            const response = await fetch(`${API_BASE_URL}/admin/documents/clients/${clientId}/upload`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${auth.token}` },
                body: formData
            });
            
            const data = await response.json();
            
            if (data.success) {
                showNotification('Document téléversé avec succès', 'success');
                closeUploadModal();
                await loadDocuments();
                await loadStats();
            } else {
                showNotification(data.message || data.error || 'Erreur lors du téléversement', 'error');
            }
        } catch (error) {
            console.error('Erreur upload:', error);
            showNotification('Erreur de connexion au serveur', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
        }
    }
    
    // ============================================
    // CHARGEMENT DES DONNÉES
    // ============================================
    
    async function loadClients() {
        try {
            const auth = JSON.parse(localStorage.getItem('cc_admin_auth') || '{}');
            const response = await fetch(`${API_BASE_URL}/admin/clients?limit=100`, {
                headers: { 'Authorization': `Bearer ${auth.token}` }
            });
            const data = await response.json();
            if (data.success) {
                const select = document.getElementById('clientSelect');
                if (select) {
                    select.innerHTML = '<option value="">Sélectionner un client</option>';
                    data.clients.forEach(client => {
                        const option = document.createElement('option');
                        option.value = client.id;
                        option.textContent = `${client.first_name} ${client.last_name} (${client.email})`;
                        select.appendChild(option);
                    });
                }
            }
        } catch (error) {
            console.error('Erreur chargement clients:', error);
        }
    }
    
    async function loadDocuments() {
        showLoading();
        try {
            const auth = JSON.parse(localStorage.getItem('cc_admin_auth') || '{}');
            const limit = document.getElementById('limit')?.value || 20;
            const params = new URLSearchParams({ page: currentPage, limit, ...currentFilters });
            
            const response = await fetch(`${API_BASE_URL}/admin/documents?${params}`, {
                headers: { 'Authorization': `Bearer ${auth.token}` }
            });
            const data = await response.json();
            
            if (data.success) {
                renderDocuments(data.documents || []);
                updatePagination(data.pagination);
                document.getElementById('totalCount').textContent = data.pagination?.total || 0;
            }
        } catch (error) {
            console.error('Erreur chargement documents:', error);
            showNotification('Erreur de chargement', 'error');
        } finally {
            hideLoading();
        }
    }
    
    async function loadStats() {
        try {
            const auth = JSON.parse(localStorage.getItem('cc_admin_auth') || '{}');
            const response = await fetch(`${API_BASE_URL}/admin/documents/stats`, {
                headers: { 'Authorization': `Bearer ${auth.token}` }
            });
            const data = await response.json();
            if (data.success) {
                document.getElementById('totalDocumentsCount').textContent = data.stats?.total || 0;
                document.getElementById('totalDownloadsCount').textContent = data.stats?.total_downloads || 0;
            }
        } catch (error) {
            console.error('Erreur chargement stats:', error);
        }
    }
    
    function populateYearSelects() {
        const currentYear = new Date().getFullYear();
        ['taxYear', 'filterYear'].forEach(selectId => {
            const select = document.getElementById(selectId);
            if (select) {
                for (let year = currentYear; year >= currentYear - 5; year--) {
                    const option = document.createElement('option');
                    option.value = year;
                    option.textContent = year;
                    select.appendChild(option);
                }
            }
        });
    }
    
    // ============================================
    // RENDU
    // ============================================
    
    function escapeHtml(text) {
        if (!text && text !== 0) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function renderDocuments(documents) {
        const tbody = document.getElementById('documentsTbody');
        if (!tbody) return;
        
        if (documents.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="px-6 py-12 text-center text-slate-500">
                        <i class="fas fa-folder-open text-4xl mb-3 opacity-50 block"></i>
                        <p>Aucun document trouvé</p>
                    </td>
                </tr>`;
            return;
        }
        
        tbody.innerHTML = documents.map(doc => `
            <tr class="hover:bg-slate-50 transition cursor-pointer" onclick="window.viewDocumentDetails(${doc.id})">
                <td class="px-6 py-4">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-lg ${getFileIconColor(doc.mime_type)} flex items-center justify-center">
                            <i class="fas ${getFileIcon(doc.mime_type)}"></i>
                        </div>
                        <div class="min-w-0">
                            <p class="font-medium text-slate-900 truncate">${escapeHtml(doc.original_name) || 'Sans nom'}</p>
                            <p class="text-xs text-slate-500">${doc.file_name || ''}</p>
                        </div>
                    </div>
                </td>
                <td class="px-6 py-4">
                    <p class="font-medium text-slate-900">${escapeHtml(doc.client_name) || 'N/A'}</p>
                    <p class="text-xs text-slate-500">${escapeHtml(doc.client_email)}</p>
                </td>
                <td class="px-6 py-4">
                    <span class="px-3 py-1 bg-slate-100 rounded-full text-sm font-medium">${doc.tax_year || 'N/A'}</span>
                </td>
                <td class="px-6 py-4">${getAuthorityBadge(doc.document_authority)}</td>
                <td class="px-6 py-4 text-sm text-slate-600">${formatDate(doc.upload_date)}</td>
                <td class="px-6 py-4 text-center">
                    <span class="font-semibold ${doc.download_count > 0 ? 'text-emerald-600' : 'text-slate-400'}">${doc.download_count || 0}</span>
                </td>
                <td class="px-6 py-4">${getStatusBadge(doc.status)}</td>
                <td class="px-6 py-4 text-right">
                    <button onclick="event.stopPropagation(); window.viewDocumentDetails(${doc.id})" class="text-blue-600 hover:text-blue-800 mr-2" title="Voir détails"><i class="fas fa-eye"></i></button>
                    <button onclick="event.stopPropagation(); window.downloadDocument(${doc.id})" class="text-emerald-600 hover:text-emerald-800 mr-2" title="Télécharger"><i class="fas fa-download"></i></button>
                    <button onclick="event.stopPropagation(); window.showDeleteConfirmation(${doc.id})" class="text-red-600 hover:text-red-800" title="Supprimer"><i class="fas fa-trash"></i></button>
                </td>
            </tr>`).join('');
    }
    
    function getAuthorityBadge(authority) {
        const badges = {
            'REVENU_QUEBEC': '<span class="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium"><i class="fas fa-map-pin mr-1"></i>Québec</span>',
            'REVENU_CANADA': '<span class="px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-medium"><i class="fas fa-leaf mr-1"></i>Canada</span>',
            'BOTH': '<span class="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-xs font-medium"><i class="fas fa-handshake mr-1"></i>Les deux</span>'
        };
        return badges[authority] || '<span class="px-3 py-1 bg-slate-100 text-slate-800 rounded-full text-xs font-medium">N/A</span>';
    }
    
    function getStatusBadge(status) {
        const badges = {
            'active': '<span class="px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full text-xs font-medium"><i class="fas fa-check-circle mr-1"></i>Actif</span>',
            'archived': '<span class="px-3 py-1 bg-slate-100 text-slate-800 rounded-full text-xs font-medium"><i class="fas fa-archive mr-1"></i>Archivé</span>'
        };
        return badges[status] || '<span class="px-3 py-1 bg-slate-100 text-slate-800 rounded-full text-xs font-medium">N/A</span>';
    }
    
    function getFileIcon(mimeType) {
        if (mimeType?.includes('pdf')) return 'fa-file-pdf';
        if (mimeType?.includes('word')) return 'fa-file-word';
        if (mimeType?.includes('image')) return 'fa-file-image';
        if (mimeType?.includes('zip')) return 'fa-file-zipper';
        return 'fa-file';
    }
    
    function getFileIconColor(mimeType) {
        if (mimeType?.includes('pdf')) return 'bg-red-100 text-red-600';
        if (mimeType?.includes('word')) return 'bg-blue-100 text-blue-600';
        if (mimeType?.includes('image')) return 'bg-emerald-100 text-emerald-600';
        if (mimeType?.includes('zip')) return 'bg-amber-100 text-amber-600';
        return 'bg-slate-100 text-slate-600';
    }
    
    // ============================================
    // FILTRES ET PAGINATION
    // ============================================
    
    function applyFilters() {
        currentFilters = {
            search: document.getElementById('searchInput')?.value || '',
            year: document.getElementById('filterYear')?.value || '',
            authority: document.getElementById('filterAuthority')?.value || '',
            status: document.getElementById('filterStatus')?.value || 'all'
        };
        currentPage = 1;
        loadDocuments();
    }
    
    function resetFilters() {
        document.getElementById('searchInput').value = '';
        document.getElementById('filterYear').value = '';
        document.getElementById('filterAuthority').value = '';
        document.getElementById('filterStatus').value = 'all';
        currentFilters = { search: '', year: '', authority: '', status: 'all' };
        currentPage = 1;
        loadDocuments();
    }
    
    function updatePagination(pagination) {
        if (!pagination) return;
        currentPage = pagination.page || 1;
        totalPages = pagination.totalPages || 1;
        document.getElementById('currentPageDisplay').textContent = currentPage;
        document.getElementById('prevPage').disabled = currentPage <= 1;
        document.getElementById('nextPage').disabled = currentPage >= totalPages;
        document.getElementById('pageInfo').textContent = `Page ${currentPage} sur ${totalPages}`;
        document.getElementById('showingInfo').textContent =
            `Affichage de ${pagination.start || 0} à ${pagination.end || 0} sur ${pagination.total || 0} documents`;
    }
    
    function changePage(newPage) {
        if (newPage >= 1 && newPage <= totalPages) {
            currentPage = newPage;
            loadDocuments();
        }
    }
    
    // ============================================
    // DRAWER
    // ============================================
    
    window.viewDocumentDetails = async function(documentId) {
        try {
            const auth = JSON.parse(localStorage.getItem('cc_admin_auth') || '{}');
            const response = await fetch(`${API_BASE_URL}/admin/documents/${documentId}`, {
                headers: { 'Authorization': `Bearer ${auth.token}` }
            });
            const data = await response.json();
            if (data.success) {
                currentViewDocument = data.document;
                showDrawer(data.document);
            }
        } catch (error) {
            console.error('Erreur chargement détails:', error);
            showNotification('Erreur lors du chargement des détails', 'error');
        }
    };
    
    function showDrawer(doc) {
        document.getElementById('drawerFileName').textContent = doc.file_name || 'N/A';
        document.getElementById('drawerOriginalName').textContent = doc.original_name || 'N/A';
        document.getElementById('drawerClientName').textContent = doc.client_name || 'N/A';
        document.getElementById('drawerClientEmail').textContent = doc.client_email || '';
        document.getElementById('drawerTaxYear').textContent = doc.tax_year || 'N/A';
        document.getElementById('drawerDeclarationType').textContent = doc.declaration_type || 'Non spécifié';
        document.getElementById('drawerFileSize').textContent = formatFileSize(doc.file_size || 0);
        document.getElementById('drawerDownloadCount').textContent = doc.download_count || 0;
        document.getElementById('drawerUploadDate').textContent = formatDate(doc.upload_date, true);
        document.getElementById('drawerAdminName').textContent = doc.admin_name || 'N/A';
        
        const authoritySpan = document.getElementById('drawerAuthority');
        authoritySpan.className = `px-4 py-2 rounded-full text-sm font-medium ${getAuthorityClass(doc.document_authority)}`;
        authoritySpan.innerHTML = getAuthorityIcon(doc.document_authority) + getAuthorityText(doc.document_authority);
        
        const statusSpan = document.getElementById('drawerStatus');
        statusSpan.className = `px-4 py-2 rounded-full text-sm font-medium ${getStatusClass(doc.status)}`;
        statusSpan.innerHTML = getStatusIcon(doc.status) + (doc.status === 'active' ? ' Actif' : ' Archivé');
        
        const iconSpan = document.getElementById('drawerIcon');
        iconSpan.innerHTML = `<i class="fas ${getFileIcon(doc.mime_type)}"></i>`;
        
        const archiveBtnText = document.getElementById('archiveBtnText');
        if (archiveBtnText) archiveBtnText.textContent = doc.status === 'active' ? 'Archiver' : 'Restaurer';
        
        if (doc.notes) {
            document.getElementById('drawerNotesContainer').classList.remove('hidden');
            document.getElementById('drawerNotes').textContent = doc.notes;
        } else {
            document.getElementById('drawerNotesContainer').classList.add('hidden');
        }
        
        document.getElementById('drawerBackdrop').classList.remove('hidden');
        document.getElementById('drawer').classList.remove('translate-x-full');
    }
    
    function closeDrawer() {
        document.getElementById('drawerBackdrop').classList.add('hidden');
        document.getElementById('drawer').classList.add('translate-x-full');
        currentViewDocument = null;
    }
    
    function getAuthorityClass(authority) {
        const classes = { 'REVENU_QUEBEC': 'bg-blue-100 text-blue-800', 'REVENU_CANADA': 'bg-amber-100 text-amber-800', 'BOTH': 'bg-purple-100 text-purple-800' };
        return classes[authority] || 'bg-slate-100 text-slate-800';
    }
    function getAuthorityIcon(authority) {
        const icons = { 'REVENU_QUEBEC': '<i class="fas fa-map-pin mr-2"></i>', 'REVENU_CANADA': '<i class="fas fa-leaf mr-2"></i>', 'BOTH': '<i class="fas fa-handshake mr-2"></i>' };
        return icons[authority] || '<i class="fas fa-building mr-2"></i>';
    }
    function getAuthorityText(authority) {
        const texts = { 'REVENU_QUEBEC': 'Revenu Québec', 'REVENU_CANADA': 'Revenu Canada', 'BOTH': 'Les deux' };
        return texts[authority] || authority;
    }
    function getStatusClass(status) { return status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-800'; }
    function getStatusIcon(status) { return status === 'active' ? '<i class="fas fa-check-circle mr-2"></i>' : '<i class="fas fa-archive mr-2"></i>'; }
    
    // ============================================
    // ACTIONS
    // ============================================
    
    function getFilenameFromContentDisposition(header) {
        if (!header) return null;
        const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(header);
        if (utf8Match && utf8Match[1]) {
            try { return decodeURIComponent(utf8Match[1]); } catch (e) { /* ignore, fallback below */ }
        }
        const quotedMatch = /filename="([^"]+)"/i.exec(header);
        if (quotedMatch && quotedMatch[1]) return quotedMatch[1];
        const bareMatch = /filename=([^;]+)/i.exec(header);
        if (bareMatch && bareMatch[1]) return bareMatch[1].trim();
        return null;
    }

    // Téléchargement authentifié : le JWT admin passe uniquement par le header
    // Authorization (jamais dans l'URL — TOKEN-IN-URL-001). Réponse convertie
    // en Blob, ouverte via un <a download> temporaire, puis l'object URL est
    // révoqué (même schéma que adminDeclarations.js).
    window.downloadDocument = async function(documentId) {
        const auth = JSON.parse(localStorage.getItem('cc_admin_auth') || '{}');
        if (!auth.token) {
            window.location.href = '/admin/adminLogin.html';
            return;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/admin/documents/${documentId}/download`, {
                headers: { 'Authorization': `Bearer ${auth.token}` }
            });

            if (response.status === 401 || response.status === 403) {
                window.location.href = '/admin/adminLogin.html';
                return;
            }
            if (response.status === 404) {
                alert('Document introuvable.');
                return;
            }
            if (!response.ok) {
                alert(`Erreur lors du téléchargement (code ${response.status}).`);
                return;
            }

            const blob = await response.blob();
            const filename = getFilenameFromContentDisposition(response.headers.get('Content-Disposition')) || `document-${documentId}`;

            const objectUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = objectUrl;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(objectUrl);
        } catch (err) {
            console.error('Erreur téléchargement document', err);
            alert('Erreur réseau lors du téléchargement.');
        }
    };

    function downloadCurrentDocument() {
        if (currentViewDocument) window.downloadDocument(currentViewDocument.id);
    }
    
    async function toggleArchiveDocument() {
        if (!currentViewDocument) return;
        const newStatus = currentViewDocument.status === 'active' ? 'archived' : 'active';
        const action = newStatus === 'active' ? 'restaurer' : 'archiver';
        if (!confirm(`Voulez-vous ${action} ce document ?`)) return;
        try {
            const auth = JSON.parse(localStorage.getItem('cc_admin_auth') || '{}');
            const response = await fetch(`${API_BASE_URL}/admin/documents/${currentViewDocument.id}`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus })
            });
            const data = await response.json();
            if (data.success) {
                showNotification(`Document ${newStatus === 'archived' ? 'archivé' : 'restauré'} avec succès`, 'success');
                closeDrawer();
                await loadDocuments();
            } else {
                showNotification(data.message || 'Erreur', 'error');
            }
        } catch (error) {
            showNotification('Erreur de connexion', 'error');
        }
    }
    
    // ============================================
    // CONFIRMATION SUPPRESSION
    // ============================================
    
    window.showDeleteConfirmation = function(documentId) {
        const id = documentId || currentViewDocument?.id;
        if (!id) return;
        currentDocumentId = id;
        currentAction = 'delete';
        document.getElementById('confirmTitle').textContent = 'Confirmer la suppression';
        document.getElementById('confirmMessage').textContent = 'Cette action est irréversible. Voulez-vous vraiment supprimer ce document ?';
        document.getElementById('confirmIcon').className = 'fas fa-trash mr-2';
        document.getElementById('confirmButtonText').textContent = 'Supprimer';
        document.getElementById('confirmModal').classList.remove('hidden');
        document.getElementById('confirmModal').classList.add('flex');
    };
    
    function closeConfirmModal() {
        document.getElementById('confirmModal').classList.add('hidden');
        document.getElementById('confirmModal').classList.remove('flex');
        currentDocumentId = null;
        currentAction = null;
    }
    
    async function executeConfirmedAction() {
        if (!currentDocumentId || currentAction !== 'delete') { closeConfirmModal(); return; }
        try {
            const auth = JSON.parse(localStorage.getItem('cc_admin_auth') || '{}');
            const response = await fetch(`${API_BASE_URL}/admin/documents/${currentDocumentId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${auth.token}` }
            });
            const data = await response.json();
            if (data.success) {
                showNotification('Document supprimé avec succès', 'success');
                closeDrawer();
                await loadDocuments();
                await loadStats();
            } else {
                showNotification(data.message || 'Erreur lors de la suppression', 'error');
            }
        } catch (error) {
            showNotification('Erreur de connexion', 'error');
        } finally {
            closeConfirmModal();
        }
    }
    
    // ============================================
    // UTILITAIRES
    // ============================================
    
    function formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    function formatDate(dateString, detailed = false) {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        if (detailed) return date.toLocaleDateString('fr-CA', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        return date.toLocaleDateString('fr-CA', { year: 'numeric', month: 'short', day: 'numeric' });
    }
    
    function showNotification(message, type = 'info') {
        const host = document.getElementById('toastHost');
        if (!host) { alert(message); return; }
        const colors = type === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : type === 'error'
            ? 'bg-red-50 border-red-200 text-red-800'
            : 'bg-blue-50 border-blue-200 text-blue-800';
        const icon = type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle';
        const toast = document.createElement('div');
        toast.className = `${colors} border rounded-xl px-4 py-3 shadow-lg flex items-center gap-3 text-sm animate-fadeIn`;
        toast.innerHTML = `<i class="fas ${icon}"></i><span>${message}</span>`;
        host.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    }
    
    function showLoading() { document.getElementById('loadingIndicator')?.classList.remove('hidden'); }
    function hideLoading() { document.getElementById('loadingIndicator')?.classList.add('hidden'); }
    
    function handleLogout(e) {
        e.preventDefault();
        const btn = e.currentTarget;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Déconnexion...';
        btn.disabled = true;
        setTimeout(() => {
            localStorage.removeItem('cc_admin_auth');
            sessionStorage.clear();
            window.location.href = '/admin/adminLogin.html?logout=success';
        }, 300);
    }
    
})();