'use strict';

class DeclarationForm {
    constructor() {
        this.currentStep = 1;
        this.totalSteps = 8;
        this.isSubmitting = false;
        this.uploadedFiles = [];
        this.maxFiles = 10;
        this.maxFileSize = 10 * 1024 * 1024; 
        this.allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
        
        this.formData = {
            personal: {},
            fiscal: {},
            spouse: {},
            children: [],
            incomes: {
                client: [],
                spouse: []
            },
            expenses: [],
            documents: []
        };

        // Variables pour la gestion des enfants
        this.currentChildIndex = 0;
        this.totalChildren = 0;
        this.childFormsValidated = 0;

        this.elements = {};
        this.init();
    }

    init() {
        this.cacheElements();
        this.bindEvents();
        this.initializeForm();
        this.setupFileUpload();
    }

    cacheElements() {
        // Formulaire et étapes
        this.elements.form = document.getElementById('tax-declaration-form');
        this.elements.steps = document.querySelectorAll('.form-step');
        
        if (!this.elements.steps || this.elements.steps.length === 0) {
            console.error('Aucun élément .form-step trouvé dans le DOM.');
        }
        
        this.elements.prevBtn = document.getElementById('prev-btn');
        this.elements.nextBtn = document.getElementById('next-btn');
        this.elements.submitBtn = document.getElementById('submit-btn');
        
        // Champs personnels - ADAPTÉ À VOTRE HTML
        this.elements.firstName = document.querySelector('input[name="firstName"]'); 
        this.elements.lastName = document.querySelector('input[name="lastName"]');    
        this.elements.dob = document.querySelector('input[name="date_of_birth"]');
        this.elements.nas = document.querySelector('input[name="nas"]');
        this.elements.phone = document.querySelector('input[name="phone"]');
        this.elements.email = document.querySelector('input[name="email"]');
        this.elements.maritalStatus = document.getElementById('marital_status'); 
        this.elements.address = document.querySelector('input[name="address_line1"]');
        this.elements.city = document.querySelector('input[name="city"]');
        this.elements.province = document.querySelector('select[name="province"]');
        this.elements.postalCode = document.querySelector('input[name="postal_code"]');
        
        // Champs statut fiscal
        this.elements.canadaStatus    = document.querySelector('select[name="canada_status"]');
        this.elements.firstDeclaration = document.querySelector('select[name="first_declaration"]');
        this.elements.fiscalProfile   = document.querySelector('select[name="fiscal_profile"]');
        this.elements.hasChildren     = document.getElementById('has_children');
        this.elements.childrenCountWrapper = document.getElementById('children-count-wrapper');
        this.elements.childrenCount = document.querySelector('select[name="children_count"]');
        
        // Déclaration conjointe
        this.elements.jointDeclaration = document.querySelector('input[name="joint_declaration"]');
        this.elements.jointQuestion = document.getElementById('joint-question');
        
        // Champs conjoint - ADAPTÉ À VOTRE HTML
        this.elements.spouseFirstName = document.querySelector('input[name="spouseFirstName"]'); 
        this.elements.spouseLastName = document.querySelector('input[name="spouseLastName"]'); 
        this.elements.spouseDob = document.querySelector('input[name="spouseDob"]');
        this.elements.spouseNas = document.querySelector('input[name="spouseNas"]'); 
        this.elements.spousePhone = document.querySelector('input[name="spousePhone"]'); 
        this.elements.spouseEmail = document.querySelector('input[name="spouseEmail"]'); 
        this.elements.spouseSameAddress = document.getElementById('spouse_same_address_select');
        this.elements.spouseAddressSection = document.getElementById('spouse-address');
        
        // Liste des enfants
        this.elements.childrenList = document.getElementById('children-list');
        this.elements.childNavigation = document.getElementById('child-navigation');
        this.elements.nextChildBtn = document.getElementById('next-child-btn');
        this.elements.prevChildBtn = document.getElementById('prev-child-btn');
        this.elements.finishChildrenBtn = document.getElementById('finish-children-btn');
        
        // Revenus et dépenses
        this.elements.clientDocs = document.querySelectorAll('input[name="client_docs[]"]');
        this.elements.spouseDocs = document.querySelectorAll('input[name="spouse_docs[]"]');
        this.elements.childrenExpenses = document.querySelectorAll('input[name="children_expenses[]"]');
        
        // Téléversement et résumé
        this.elements.fileInput = document.getElementById('file-upload');
        this.elements.consent = document.getElementById('consent');
        this.elements.summaryContainer = document.getElementById('summary-container');
        
        // Message d'alerte
        this.createAlertElement();

    }

    createAlertElement() {
        if (!document.getElementById('form-alert')) {
            const alertDiv = document.createElement('div');
            alertDiv.id = 'form-alert';
            alertDiv.setAttribute('style',
                'position:fixed;top:1.25rem;right:1.25rem;z-index:9999;max-width:26rem;' +
                'background:#fff;border-radius:.625rem;box-shadow:0 4px 16px rgba(0,0,0,.15);' +
                'padding:1rem 1.25rem;display:none;border-left:4px solid #60a5fa;'
            );
            alertDiv.innerHTML = `
                <div style="display:flex;align-items:flex-start;gap:.75rem;">
                    <i class="fas" style="font-size:1.125rem;margin-top:.125rem;"></i>
                    <p style="flex:1;margin:0;font-size:.875rem;font-weight:500;"></p>
                    <button type="button" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:1rem;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
            document.body.appendChild(alertDiv);
        }
        this.elements.alert = document.getElementById('form-alert');
    }

    bindEvents() {
        // Navigation
        if (this.elements.prevBtn) {
            this.elements.prevBtn.addEventListener('click', () => this.prevStep());
        }
        if (this.elements.nextBtn) {
            this.elements.nextBtn.addEventListener('click', () => this.nextStep());
        }

        // Gestion des étapes conditionnelles
        if (this.elements.maritalStatus) {
            this.elements.maritalStatus.addEventListener('change', () => {
                this.toggleJointDeclaration();
            });
        }

        if (this.elements.hasChildren) {
            this.elements.hasChildren.addEventListener('change', () => {
                this.toggleChildrenFields();
            });
        }

        // Logique "Aucune dépense" pour l'étape 7
        document.addEventListener('change', (e) => {
            if (e.target.name === 'children_expenses[]') {
                const allExpenses = document.querySelectorAll('input[name="children_expenses[]"]');
                const noneCheckbox = document.getElementById('expense_aucune');
                if (!noneCheckbox) return;

                if (e.target.id === 'expense_aucune' && e.target.checked) {
                    // Décocher toutes les autres si "aucune" est coché
                    allExpenses.forEach(cb => {
                        if (cb.id !== 'expense_aucune') cb.checked = false;
                    });
                } else if (e.target.id !== 'expense_aucune' && e.target.checked) {
                    // Décocher "aucune" si une autre option est cochée
                    noneCheckbox.checked = false;
                }
            }
        });

        if (this.elements.childrenCount) {
            this.elements.childrenCount.addEventListener('change', () => {
                this.prepareChildrenForms();
            });
        }

        if (this.elements.spouseSameAddress) {
            this.elements.spouseSameAddress.addEventListener('change', () => this.toggleSpouseAddress());
        }

        // Navigation enfants
        if (this.elements.nextChildBtn) {
            this.elements.nextChildBtn.addEventListener('click', () => this.nextChild());
        }
        if (this.elements.prevChildBtn) {
            this.elements.prevChildBtn.addEventListener('click', () => this.prevChild());
        }
        if (this.elements.finishChildrenBtn) {
            this.elements.finishChildrenBtn.addEventListener('click', () => this.finishChildren());
        }

        // Adresse différente enfant (délégation sur document — éléments créés dynamiquement)
        document.addEventListener('change', (e) => {
            if (e.target.classList.contains('child-same-address')) {
                const wrapper = e.target.closest('.child-entry');
                if (!wrapper) return;
                const addressBlock = wrapper.querySelector('.child-address');
                if (addressBlock) {
                    addressBlock.classList.toggle('hidden', e.target.value !== 'no');
                }
            }
        });

        // Validation en temps réel
        this.setupRealTimeValidation();

        // Soumission du formulaire
        if (this.elements.form) {
            this.elements.form.addEventListener('submit', (e) => this.handleSubmit(e));
        }
    }

    initializeForm() {
        // Vérifier que steps existe et est un itérable
        if (!this.elements.steps || this.elements.steps.length === 0) {
            console.error('Aucune étape trouvée avec la classe .form-step');
            return;
        }

        // Afficher toutes les étapes
        this.elements.steps.forEach((step, index) => {
            if (index === 0) {
                step.classList.add('active');
            } else {
                step.classList.remove('active');
            }
        });

        // Définir la date max pour les dates de naissance
        const today = new Date().toISOString().split('T')[0];
        if (this.elements.dob) this.elements.dob.max = today;
        if (this.elements.spouseDob) this.elements.spouseDob.max = today;

        // Initialiser la gestion des enfants
        this.prepareChildrenForms();

        // Mettre à jour les boutons
        this.updateNavigationButtons();
    }

    toggleJointDeclaration() {
        if (!this.elements.jointQuestion) return;

        const isMarried = ['married', 'common_law'].includes(this.elements.maritalStatus.value);
        if (isMarried) {
            this.elements.jointQuestion.classList.remove('hidden');
        } else {
            this.elements.jointQuestion.classList.add('hidden');
            if (this.elements.jointDeclaration) {
                this.elements.jointDeclaration.checked = false;
            }
        }
    }

    toggleChildrenFields() {
        if (!this.elements.hasChildren || !this.elements.childrenCountWrapper) return;

        const hasChildren = this.elements.hasChildren.value === 'yes';
        if (hasChildren) {
            this.elements.childrenCountWrapper.classList.remove('hidden');
            this.prepareChildrenForms();
        } else {
            this.elements.childrenCountWrapper.classList.add('hidden');
            this.elements.childrenCount.value = '1';
            this.elements.childrenList.innerHTML = '<p class="text-gray-500">Aucun enfant à charge</p>';
            if (this.elements.childNavigation) {
                this.elements.childNavigation.classList.add('hidden');
            }
        }
    }

    prepareChildrenForms() {
        if (!this.elements.childrenList) return;

        const hasChildren = this.elements.hasChildren?.value === 'yes';
        
        if (!hasChildren) {
            this.elements.childrenList.innerHTML = '<p class="text-gray-500">Aucun enfant à charge</p>';
            if (this.elements.childNavigation) {
                this.elements.childNavigation.classList.add('hidden');
            }
            return;
        }

        this.totalChildren = parseInt(this.elements.childrenCount?.value || '1');
        this.currentChildIndex = 0;
        this.childFormsValidated = 0;
        
        // Vider la liste
        this.elements.childrenList.innerHTML = '';
        
        // Créer les formulaires pour tous les enfants
        for (let i = 0; i < this.totalChildren; i++) {
            // Dans prepareChildrenForms(), remplacez le childHtml par :
            const childHtml = `
            <div class="child-entry ${i === 0 ? '' : 'hidden'}" data-index="${i}"
                 style="padding:1rem;border:1px solid var(--border-color,#e2e8f0);border-radius:.5rem;margin-bottom:.75rem;">
                <h4 style="font-weight:600;margin:0 0 1rem;font-size:.9375rem;">
                    Enfant ${i + 1} sur ${this.totalChildren}
                </h4>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;">
                    <input type="text" placeholder="Prénom *"
                        class="form-input child-first-name" required style="width:100%;box-sizing:border-box;">
                    <input type="text" placeholder="Nom *"
                        class="form-input child-last-name" required style="width:100%;box-sizing:border-box;">
                    <input type="date" class="form-input child-dob"
                        max="${new Date().toISOString().split('T')[0]}" required
                        style="width:100%;box-sizing:border-box;">
                    <input type="text" placeholder="NAS (optionnel)"
                        class="form-input child-nas" style="width:100%;box-sizing:border-box;">
                </div>
                <div style="margin-top:.75rem;">
                    <select class="form-select child-same-address" data-index="${i}" required style="width:100%;max-width:440px;">
                        <option value="">Réside à la même adresse que vous ?</option>
                        <option value="yes">Oui, même adresse</option>
                        <option value="no">Non, adresse différente</option>
                    </select>
                </div>
                <div class="child-address hidden"
                     style="margin-top:.75rem;padding:.875rem;background:var(--bg-subtle,#f8fafc);
                            border-radius:.375rem;border:1px dashed var(--border-color,#e2e8f0);">
                    <p style="margin:0 0 .625rem;font-size:.8125rem;color:var(--text-secondary,#64748b);font-weight:500;">
                        <i class="fas fa-map-marker-alt" style="margin-right:.375rem;"></i>Adresse de l'enfant
                    </p>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:.625rem;">
                        <input type="text" placeholder="Adresse" class="form-input child-address-line"
                               style="grid-column:span 2;width:100%;box-sizing:border-box;">
                        <input type="text" placeholder="Ville" class="form-input child-city"
                               style="width:100%;box-sizing:border-box;">
                        <input type="text" placeholder="Province" class="form-input child-province"
                               style="width:100%;box-sizing:border-box;">
                        <input type="text" placeholder="Code postal" class="form-input child-postal"
                               style="width:100%;box-sizing:border-box;">
                    </div>
                </div>
            </div>
            `;
            this.elements.childrenList.insertAdjacentHTML('beforeend', childHtml);
            }
        
        // Afficher la navigation enfants
        if (this.elements.childNavigation) {
            this.elements.childNavigation.classList.remove('hidden');
            this.updateChildNavigation();
        }
    }

    nextChild() {
        if (!this.validateCurrentChild()) {
            return;
        }
        
        if (this.currentChildIndex < this.totalChildren - 1) {
            document.querySelector(`.child-entry[data-index="${this.currentChildIndex}"]`).classList.add('hidden');
            this.currentChildIndex++;
            document.querySelector(`.child-entry[data-index="${this.currentChildIndex}"]`).classList.remove('hidden');
            this.updateChildNavigation();
        }
    }
        
    prevChild() {
        if (this.currentChildIndex > 0) {
            document.querySelector(`.child-entry[data-index="${this.currentChildIndex}"]`).classList.add('hidden');
            this.currentChildIndex--;
            document.querySelector(`.child-entry[data-index="${this.currentChildIndex}"]`).classList.remove('hidden');
            this.updateChildNavigation();
        }
    }

    finishChildren() {
        if (!this.validateCurrentChild()) {
            return;
        }
        
        this.childFormsValidated = this.totalChildren;
        this.showAlert('Informations enfants enregistrées', 'success');
        this.nextStep(); 
    }

    validateCurrentChild() {

        const currentChild = document.querySelector(`.child-entry[data-index="${this.currentChildIndex}"]`);
        let valid = true;

        const required = currentChild.querySelectorAll('input[required], select[required]');

        required.forEach(field => {
            if (!field.value.trim()) {
                this.showFieldError(field, 'Champ obligatoire');
                valid = false;
            } else {
                this.clearFieldError(field);
            }
        });

        const sameAddress = currentChild.querySelector('.child-same-address').value;

        if (sameAddress === 'no') {
            const addressFields = currentChild.querySelectorAll('.child-address input');
            addressFields.forEach(field => {
                if (!field.value.trim()) {
                    this.showFieldError(field, 'Adresse obligatoire');
                    valid = false;
                }
            });
        }

        return valid;
    }

    updateChildNavigation() {
        if (!this.elements.prevChildBtn || !this.elements.nextChildBtn || !this.elements.finishChildrenBtn) return;
        
        // Bouton précédent
        this.elements.prevChildBtn.disabled = this.currentChildIndex === 0;
        
        // Bouton suivant
        if (this.currentChildIndex < this.totalChildren - 1) {
            this.elements.nextChildBtn.classList.remove('hidden');
            this.elements.finishChildrenBtn.classList.add('hidden');
        } else {
            this.elements.nextChildBtn.classList.add('hidden');
            this.elements.finishChildrenBtn.classList.remove('hidden');
        }
    }

    toggleSpouseAddress() {
        if (!this.elements.spouseSameAddress || !this.elements.spouseAddressSection) return;
        
        if (this.elements.spouseSameAddress.value === 'no') {
            this.elements.spouseAddressSection.classList.remove('hidden');
        } else {
            this.elements.spouseAddressSection.classList.add('hidden');
        }
    }

    setupFileUpload() {

        if (!this.elements.fileInput) return;

        const fileInput = this.elements.fileInput;
        const dropZone = document.getElementById('drop-zone');

        /* =========================
        CLICK DIRECT
        ========================= */
        fileInput.addEventListener('change', (e) => {
            const files = Array.from(e.target.files || []);
            if (files.length > 0) {
                this.validateAndAddFiles(files);
            }

            // reset propre
            fileInput.value = '';
        });

        /* =========================
        DROP ZONE
        ========================= */
        if (dropZone) {

            dropZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropZone.classList.add('border-blue-500', 'bg-blue-50');
            });

            dropZone.addEventListener('dragleave', () => {
                dropZone.classList.remove('border-blue-500', 'bg-blue-50');
            });

            dropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropZone.classList.remove('border-blue-500', 'bg-blue-50');

                const files = Array.from(e.dataTransfer.files || []);
                if (files.length > 0) {
                    this.validateAndAddFiles(files);
                }
            });
        }
    }

    validateAndAddFiles(files) {

        const validFiles = [];
        const errors = [];

        files.forEach(file => {

            // Vérifier doublon
            const isDuplicate = this.uploadedFiles.some(
                f => f.name === file.name && f.file.size === file.size
            );

            if (isDuplicate) {
                errors.push(`${file.name} est déjà téléversé`);
                return;
            }

            // Taille max
            if (file.size > this.maxFileSize) {
                errors.push(`${file.name} dépasse 10MB`);
                return;
            }

            // Type autorisé
            if (!this.allowedTypes.includes(file.type)) {
                errors.push(`${file.name} n'est pas un type de fichier autorisé`);
                return;
            }

            // Nombre max
            if (this.uploadedFiles.length + validFiles.length >= this.maxFiles) {
                errors.push(`Maximum ${this.maxFiles} fichiers autorisés`);
                return;
            }

            validFiles.push(file);
        });

        // Ajouter fichiers valides
        validFiles.forEach(file => {
            this.uploadedFiles.push({
                file: file,
                id: Date.now() + Math.random(),
                name: file.name,
                size: this.formatFileSize(file.size),
                type: file.type
            });
        });

        if (errors.length > 0) {
            this.showAlert(errors.join('<br>'), 'error');
        }

        if (validFiles.length > 0) {
            this.showAlert(`${validFiles.length} fichier(s) ajouté(s)`, 'success');
        }

        this.updateFileList();
    }

    updateFileList() {
        const fileList = document.getElementById('file-list');
        if (!fileList) return;

        if (this.uploadedFiles.length === 0) {
            fileList.innerHTML = '<p class="text-gray-500 text-sm">Aucun fichier téléversé</p>';
            return;
        }

        let html = '<div class="space-y-2">';
        this.uploadedFiles.forEach((fileData, index) => {
            const icon = this.getFileIcon(fileData.type);
            html += `
                <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div class="flex items-center">
                        <i class="${icon} mr-3"></i>
                        <div>
                            <p class="font-medium text-gray-700">${fileData.name}</p>
                            <p class="text-sm text-gray-500">${fileData.size}</p>
                        </div>
                    </div>
                    <button type="button" onclick="declarationForm.removeFile(${index})" 
                            class="text-red-500 hover:text-red-700 ml-2">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
        });
        html += '</div>';
        
        fileList.innerHTML = html;
    }

    getFileIcon(mimeType) {
        if (mimeType.includes('pdf')) return 'fas fa-file-pdf text-red-500';
        if (mimeType.includes('image')) return 'fas fa-file-image text-green-500';
        if (mimeType.includes('word')) return 'fas fa-file-word text-blue-500';
        if (mimeType.includes('excel') || mimeType.includes('sheet')) return 'fas fa-file-excel text-green-600';
        return 'fas fa-file text-gray-500';
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    removeFile(index) {
        this.uploadedFiles.splice(index, 1);
        this.updateFileList();
        this.showAlert('Fichier supprimé', 'success');
    }

    setupRealTimeValidation() {
        if (this.elements.nas) {
            this.elements.nas.addEventListener('input', (e) => {
                this.formatNAS(e.target);
            });
        }

        if (this.elements.spouseNas) {
            this.elements.spouseNas.addEventListener('input', (e) => {
                this.formatNAS(e.target);
            });
        }

        if (this.elements.postalCode) {
            this.elements.postalCode.addEventListener('input', (e) => {
                this.formatPostalCode(e.target);
            });
        }

        if (this.elements.phone) {
            this.elements.phone.addEventListener('blur', (e) => {
                this.formatPhone(e.target);
            });
        }

        if (this.elements.email) {
            this.elements.email.addEventListener('blur', (e) => {
                this.validateEmail(e.target);
            });
        }
    }

    formatNAS(input) {
        let value = input.value.replace(/\D/g, '');
        if (value.length > 9) value = value.substring(0, 9);
        
        if (value.length > 0) {
            let formatted = '';
            for (let i = 0; i < value.length; i++) {
                if (i === 3 || i === 6) formatted += ' ';
                formatted += value[i];
            }
            input.value = formatted;
        }
    }

    formatPostalCode(input) {
        let value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (value.length > 6) value = value.substring(0, 6);
        
        if (value.length > 3) {
            input.value = value.substring(0, 3) + ' ' + value.substring(3);
        } else {
            input.value = value;
        }
    }

    formatPhone(input) {
        let value = input.value.replace(/\D/g, '');
        if (value.length > 10) value = value.substring(0, 10);
        
        if (value.length >= 10) {
            input.value = `(${value.substring(0, 3)}) ${value.substring(3, 6)}-${value.substring(6)}`;
        }
    }

    validateEmail(input) {
        const email = input.value.trim();
        if (!email) return true;
        
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            this.showFieldError(input, 'Adresse courriel invalide');
            return false;
        }
        
        this.clearFieldError(input);
        return true;
    }

    showFieldError(input, message) {
        if (!input || !input.parentNode) {
            console.error('[DeclarationForm] showFieldError: élément invalide', input);
            return;
        }
        
        this.clearFieldError(input);
        input.classList.add('border-red-500', 'ring-2', 'ring-red-200');
        
        // Vérifier qu'on n'ajoute pas un doublon
        if (input.parentNode.querySelector('.text-red-500.text-sm')) return;
        
        const errorDiv = document.createElement('div');
        errorDiv.className = 'text-red-500 text-sm mt-1';
        errorDiv.innerHTML = `<i class="fas fa-exclamation-circle mr-1"></i> ${message}`;
        
        input.parentNode.appendChild(errorDiv);
    }

    clearFieldError(input) {
        if (!input || !input.parentNode) {
            console.error('[DeclarationForm] clearFieldError: élément invalide', input);
            return;
        }
        
        input.classList.remove('border-red-500', 'ring-2', 'ring-red-200');
        
        const errorDiv = input.parentNode.querySelector('.text-red-500.text-sm');
        if (errorDiv) {
            errorDiv.remove();
        }
    }

    validateStep(step) {
        let isValid = true;
        
        switch(step) {
            case 1:
                isValid = this.validatePersonalInfo();
                break;
            case 2:
                isValid = this.validateFiscalStatus();
                break;
            case 3:
                // Étape 3 (conjoint)
                if (this.shouldSkipStep3()) {
                    break;
                }
                isValid = this.validateSpouseInfo();
                break;
            case 4:
                // Étape 4 (enfants) 
                if (this.shouldSkipStep4()) {
                    return true; 
                }
                isValid = this.validateChildrenInfo();
                break;
            case 5:
                // Étape 5 
                isValid = this.validateClientDocuments();
                break;
            case 6:
                // Étape 6 (documents conjoint) 
                if (this.shouldSkipStep6()) {
                    return true; 
                }
                isValid = this.validateSpouseDocuments();
                break;
            case 7:
                // Étape 7 (dépenses enfants) 
                if (this.shouldSkipStep7()) {
                    return true; 
                }
                isValid = this.validateChildrenExpenses();
                break;
            case 8:
                isValid = this.validateFinalStep();
                break;
        }
        
        return isValid;
    }

    shouldSkipStep3() {
        const isMarried = ['married', 'common_law'].includes(this.elements.maritalStatus?.value);
        return !isMarried;
    }


    shouldSkipStep4() {
        return this.elements.hasChildren?.value !== 'yes';
    }

    shouldSkipStep6() {
        return !this.elements.jointDeclaration?.checked;
    }

    shouldSkipStep7() {
        return this.elements.hasChildren?.value !== 'yes';
    }

    nextStep() {
        /* =========================
        GESTION SPÉCIALE ÉTAPE 4 (ENFANTS)
        ========================= */
        if (this.currentStep === 4 && this.elements.hasChildren?.value === 'yes') {

            // Valider enfant courant
            if (!this.validateCurrentChild()) return;

            // S'il reste des enfants à compléter
            if (this.totalChildren > 1 && this.currentChildIndex < this.totalChildren - 1) {
                this.nextChild();
                return;
            }
        }

        /* =========================
        VALIDATION ÉTAPE COURANTE
        ========================= */
        if (!this.validateStep(this.currentStep)) return;

        let nextStep = this.currentStep + 1;

        /* =========================
        SAUT DES ÉTAPES CONDITIONNELLES
        ========================= */
        while (nextStep <= this.totalSteps) {

            if (nextStep === 3 && this.shouldSkipStep3()) {
                nextStep++;
                continue;
            }

            if (nextStep === 4 && this.shouldSkipStep4()) {
                nextStep++;
                continue;
            }

            if (nextStep === 6 && this.shouldSkipStep6()) {
                nextStep++;
                continue;
            }

            if (nextStep === 7 && this.shouldSkipStep7()) {
                nextStep++;
                continue;
            }

            break;
        }

        if (nextStep > this.totalSteps) {
            nextStep = this.totalSteps;
        }

        /* =========================
        CHANGEMENT D'ÉTAPE
        ========================= */
        this.elements.steps[this.currentStep - 1].classList.remove('active');
        this.currentStep = nextStep;
        this.elements.steps[this.currentStep - 1].classList.add('active');

        this.updateNavigationButtons();

        /* =========================
        GÉNÉRATION RÉSUMÉ
        ========================= */
        if (this.currentStep === 8) {
            this.generateSummary();
        }
    }


    prevStep() {
        if (this.currentStep <= 1) return;
        
        let prevStep = this.currentStep - 1;
        
        // Sauter les étapes conditionnelles en arrière
        while (prevStep >= 1) {
            if (prevStep === 3 && this.shouldSkipStep3()) {
                prevStep--;
                continue;
            }
            if (prevStep === 4 && this.shouldSkipStep4()) {
                prevStep--;
                continue;
            }
            if (prevStep === 6 && this.shouldSkipStep6()) {
                prevStep--;
                continue;
            }
            if (prevStep === 7 && this.shouldSkipStep7()) {
                prevStep--;
                continue;
            }
            break;
        }
        
        if (prevStep < 1) {
            prevStep = 1;
        }
        
        this.elements.steps[this.currentStep - 1].classList.remove('active');
        this.currentStep = prevStep;
        this.elements.steps[this.currentStep - 1].classList.add('active');
        this.updateNavigationButtons();
        
        // Si on retourne à l'étape 8, régénérer le résumé
        if (this.currentStep === 8) {
            this.generateSummary();
        }
    }

    updateNavigationButtons() {
        if (!this.elements.prevBtn || !this.elements.nextBtn) return;

        /* =========================
        BOUTON PRÉCÉDENT
        ========================= */
        this.elements.prevBtn.disabled = this.currentStep === 1;

        /* =========================
        DERNIÈRE ÉTAPE
        ========================= */
        if (this.currentStep === this.totalSteps) {
            this.elements.nextBtn.style.display = 'none';
            if (this.elements.submitBtn) {
                this.elements.submitBtn.style.display = 'block';
            }
            return;
        } else {
            this.elements.nextBtn.style.display = 'block';
            if (this.elements.submitBtn) {
                this.elements.submitBtn.style.display = 'none';
            }
        }

        /* =========================
        ÉTAPE 4 – ENFANTS
        ========================= */
        if (this.currentStep === 4 && this.elements.hasChildren?.value === 'yes') {

            if (this.totalChildren > 1 && this.currentChildIndex < this.totalChildren - 1) {
                this.elements.nextBtn.textContent = 'Prochain enfant';
            } else {
                this.elements.nextBtn.textContent = 'Suivant';
            }

            return;
        }

        /* =========================
        CAS NORMAL
        ========================= */
        this.elements.nextBtn.textContent = 'Suivant';
    }

    validatePersonalInfo() {
        let isValid = true;
        const requiredFields = [
            { field: this.elements.firstName, name: 'firstName' },
            { field: this.elements.lastName, name: 'lastName' },
            { field: this.elements.dob, name: 'date_of_birth' },
            { field: this.elements.nas, name: 'nas' },
            { field: this.elements.phone, name: 'phone' },
            { field: this.elements.email, name: 'email' },
            { field: this.elements.maritalStatus, name: 'maritalStatus' },
            { field: this.elements.address, name: 'address' },
            { field: this.elements.city, name: 'city' },
            { field: this.elements.province, name: 'province' },
            { field: this.elements.postalCode, name: 'postalCode' }
        ];

        requiredFields.forEach(item => {
            const field = item.field;
            
            if (!field) {
                console.error(`[DeclarationForm] Champ ${item.name} non trouvé dans le DOM`);
                return;
            }
            
            if (!field.value || !field.value.trim()) {
                this.showFieldError(field, 'Ce champ est obligatoire');
                isValid = false;
            } else {
                this.clearFieldError(field);
            }
        });

        // Validation NAS
        if (this.elements.nas && this.elements.nas.value) {
            const nasValue = this.elements.nas.value.replace(/\s/g, '');
            if (nasValue.length !== 9 || !/^\d{9}$/.test(nasValue)) {
                this.showFieldError(this.elements.nas, 'NAS invalide (9 chiffres requis)');
                isValid = false;
            }
        }

        return isValid;
    }

    validateFiscalStatus() {
        let isValid = true;

        if (!this.elements.canadaStatus || !this.elements.canadaStatus.value) {
            this.showFieldError(this.elements.canadaStatus, 'Ce champ est obligatoire');
            isValid = false;
        } else {
            this.clearFieldError(this.elements.canadaStatus);
        }

        if (!this.elements.fiscalProfile || !this.elements.fiscalProfile.value) {
            this.showFieldError(this.elements.fiscalProfile, 'Veuillez sélectionner votre profil');
            isValid = false;
        } else {
            this.clearFieldError(this.elements.fiscalProfile);
        }

        return isValid;
    }

    validateSpouseInfo() {
        const isMarried = ['married', 'common_law'].includes(this.elements.maritalStatus.value);
        const hasJointDeclaration = this.elements.jointDeclaration?.checked || false;
        
        if (!isMarried || !hasJointDeclaration) return true;
        
        let isValid = true;
        const requiredFields = [
            this.elements.spouseFirstName,
            this.elements.spouseLastName,
            this.elements.spouseDob,
            this.elements.spouseNas
        ];
        
        requiredFields.forEach(field => {
            if (!field || !field.value.trim()) {
                this.showFieldError(field, 'Ce champ est obligatoire');
                isValid = false;
            } else {
                this.clearFieldError(field);
            }
        });
        
        return isValid;
    }

    validateChildrenInfo() {

        if (this.elements.hasChildren?.value !== 'yes') {
            return true;
        }

        const currentChild = document.querySelector(
            `.child-entry[data-index="${this.currentChildIndex}"]`
        );

        if (!currentChild) return true;

        return this.validateCurrentChild();
    }

    validateClientDocuments() {
        let hasSelection = false;
        this.elements.clientDocs.forEach(doc => {
            if (doc.checked) hasSelection = true;
        });
        
        if (!hasSelection) {
            this.showAlert('Veuillez sélectionner au moins un type de document de revenu', 'warning');
            return false;
        }
        
        return true;
    }

    validateSpouseDocuments() {
        const isMarried = ['married', 'common_law'].includes(this.elements.maritalStatus.value);
        const hasJointDeclaration = this.elements.jointDeclaration?.checked || false;
        
        if (!isMarried || !hasJointDeclaration) return true;
        
        let hasSelection = false;
        this.elements.spouseDocs.forEach(doc => {
            if (doc.checked) hasSelection = true;
        });
        
        if (!hasSelection) {
            this.showAlert('Veuillez sélectionner au moins un type de document de revenu pour le conjoint', 'warning');
            return false;
        }
        
        return true;
    }

    validateChildrenExpenses() {
        return true;
    }

    validateFinalStep() {
        let isValid = true;

        if (!this.elements.consent || !this.elements.consent.checked) {
            this.showAlert('Vous devez accepter les conditions avant de soumettre', 'error');
            isValid = false;
        }

        if (this.uploadedFiles.length === 0) {
            this.showAlert('Veuillez téléverser au moins un document', 'error');
            isValid = false;
        }

        // Avertir si aucun fichier téléversé alors que des revenus ont été sélectionnés
        if (isValid) {
            const clientDocsSelected = this.elements.clientDocs
                ? Array.from(this.elements.clientDocs).filter(d => d.checked).length
                : 0;
            if (clientDocsSelected > 0 && this.uploadedFiles.length === 0) {
                this.showAlert(
                    'Vous avez sélectionné des types de revenus (étape 5) mais n\'avez téléversé aucun document.',
                    'warning'
                );
            }
        }

        return isValid;
    }

    showAlert(message, type = 'info') {
        const alert = this.elements.alert;
        if (!alert) return;

        const styles = {
            success: { border: '#34d399', bg: '#f0fdf4', color: '#065f46', icon: 'fas fa-check-circle' },
            error:   { border: '#f87171', bg: '#fef2f2', color: '#991b1b', icon: 'fas fa-exclamation-circle' },
            warning: { border: '#fbbf24', bg: '#fffbeb', color: '#92400e', icon: 'fas fa-exclamation-triangle' },
            info:    { border: '#60a5fa', bg: '#eff6ff', color: '#1e40af', icon: 'fas fa-info-circle' }
        };
        const s = styles[type] || styles.info;

        alert.style.borderLeftColor = s.border;
        alert.style.background      = s.bg;
        alert.style.color           = s.color;

        const icon = alert.querySelector('i.fas');
        if (icon) icon.className = s.icon;

        const p = alert.querySelector('p');
        if (p) { p.innerHTML = message; p.style.color = s.color; }

        alert.style.display = 'block';

        clearTimeout(this._alertTimer);
        this._alertTimer = setTimeout(() => { alert.style.display = 'none'; }, 5000);

        const closeBtn = alert.querySelector('button');
        if (closeBtn) closeBtn.onclick = () => { alert.style.display = 'none'; };
    }

    generateSummary() {

        if (!this.elements.summaryContainer) return;

        const summary = this.collectFormData();

        // Styles réutilisables
        const S = {
            card:   'padding:1rem 1.125rem;background:#fff;border:1px solid var(--border-color,#e2e8f0);border-radius:.625rem;',
            label:  'font-size:.75rem;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--text-tertiary,#94a3b8);margin:0 0 .375rem;',
            value:  'font-size:.875rem;color:var(--text-primary,#1e293b);margin:0;',
            header: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem;padding-bottom:.625rem;border-bottom:1px solid var(--border-color,#e2e8f0);',
            title:  'font-size:.9375rem;font-weight:700;color:var(--text-primary,#1e293b);margin:0;',
            row:    'display:flex;flex-direction:column;gap:.125rem;',
        };

        const editBtn = (step) =>
            `<button type="button" onclick="declarationForm.goToStep(${step})"
                style="background:none;border:none;cursor:pointer;font-size:.8125rem;
                       color:var(--navy-500,#4f6ef7);font-weight:500;padding:0;text-decoration:underline;">
                <i class="fas fa-pencil-alt" style="font-size:.6875rem;margin-right:.25rem;"></i>Modifier
             </button>`;

        const field = (label, val) => val
            ? `<div style="${S.row}"><p style="${S.label}">${label}</p><p style="${S.value}">${val}</p></div>`
            : '';

        // Labels documents & dépenses
        const docLabels = {
            t4: 'T4 – Revenus d\'emploi', releve1: 'Relevé 1 – Emploi (Québec)',
            t4a: 'T4A – Pensions / bourses', t4e: 'T4E – Assurance-emploi',
            travailleur_autonome: 'Travailleur autonome', t4ps: 'T4PS – Participation employés',
            t5: 'T5 / Relevé 3 – Intérêts/dividendes', t3: 'T3 / Relevé 16 – Fiducies/FNB',
            t4rsp: 'T4RSP / Relevé 2 – Retraits REER', t4rif: 'T4RIF / Relevé 2 – Retraits FERR',
            t4ap: 'T4A(P) – RRQ/RPC', t4aoas: 'T4A(OAS) – Sécurité vieillesse',
            t5007: 'T5007 / Relevé 5 – Aide sociale/CSST', reer: 'REER – Cotisations',
            celiapp: 'CELIAPP', r31: 'Relevé 31 – Logement', interet_hypothecaire: 'Intérêts hypothécaires',
            t2202: 'T2202 / Relevé 8 – Scolarité', medical: 'Frais médicaux',
            dons: 'Dons de bienfaisance', syndicat: 'Cotisations syndicales',
            teletravail: 'Télétravail (T2200)', credit_solidarite: 'Crédit de solidarité',
            ae: 'T4E – Assurance-emploi'
        };
        const expenseLabels = {
            garderie: 'Frais de garde', scolaire: 'Frais scolaires', camp: 'Camps de jour/vacances',
            tuteur: 'Cours privés / tutorat', transport: 'Transport scolaire',
            sport: 'Activités sportives', art: 'Activités artistiques', loisirs: 'Autres loisirs',
            medical: 'Frais médicaux enfants', therapie: 'Thérapies', dentaire: 'Soins dentaires',
            vision: 'Soins de la vue'
        };

        const clientDocsSelected = summary.incomes.client.filter(v => v).length;
        const spouseDocsSelected = summary.incomes.spouse.filter(v => v).length;
        const expensesSelected   = summary.expenses.filter(v => v && v !== 'aucune').length;
        const noExpenses         = summary.expenses.includes('aucune');

        const estimated = this.calculateEstimatedAmount();

        // Helpers inline
        const badge = (txt, color = '#4f6ef7') =>
            `<span style="display:inline-block;padding:.2rem .55rem;background:${color}18;color:${color};
                          border-radius:.375rem;font-size:.75rem;font-weight:600;">${txt}</span>`;

        const docList = (docs) => docs.length === 0
            ? `<p style="margin:.5rem 0 0;font-size:.8125rem;color:#94a3b8;">Aucun document sélectionné</p>`
            : `<ul style="margin:.5rem 0 0;padding-left:1.25rem;list-style:disc;display:flex;flex-direction:column;gap:.25rem;">
                   ${docs.map(v => `<li style="font-size:.8125rem;color:#475569;">${docLabels[v] || v}</li>`).join('')}
               </ul>`;

        // ── Section header en couleur (pleine largeur) ──────────────────────
        const sectionTitle = (icon, text) =>
            `<div style="display:flex;align-items:center;gap:.5rem;margin:1.5rem 0 .75rem;">
                <span style="font-size:1rem;">${icon}</span>
                <h3 style="margin:0;font-size:.8125rem;font-weight:700;text-transform:uppercase;
                            letter-spacing:.06em;color:#94a3b8;">${text}</h3>
                <div style="flex:1;height:1px;background:#e2e8f0;margin-left:.5rem;"></div>
             </div>`;

        // ── Grille 2 colonnes ────────────────────────────────────────────────
        const gridOpen  = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;">`;
        const gridClose = `</div>`;

        // ── En-tête du récap ─────────────────────────────────────────────────
        let html = `<div style="display:flex;flex-direction:column;gap:0;">

            <div style="padding:1.125rem 1.25rem;background:linear-gradient(135deg,#1e3a8a,#3b5fd9);
                        border-radius:.75rem .75rem 0 0;display:flex;justify-content:space-between;align-items:center;">
                <div>
                    <h2 style="margin:0;font-size:1rem;font-weight:700;color:#fff;">
                        Récapitulatif de votre déclaration
                    </h2>
                    <p style="margin:.25rem 0 0;font-size:.8125rem;color:#bfdbfe;">
                        Vérifiez toutes les informations avant soumission.
                    </p>
                </div>
                <i class="fas fa-file-alt" style="color:#bfdbfe;font-size:1.5rem;"></i>
            </div>

            <div style="padding:1.25rem;background:#f8fafc;border:1px solid #e2e8f0;
                        border-top:none;border-radius:0 0 .75rem .75rem;">
        `;

        // ══════════════════════════════════════════════
        // SECTION 1 — IDENTITÉ & ADRESSE
        // ══════════════════════════════════════════════
        html += sectionTitle('👤', 'Identité & adresse');
        html += gridOpen;

        // Carte infos personnelles
        html += `<div style="${S.card}">
            <div style="${S.header}">
                <p style="${S.title}">Informations personnelles</p>
                ${editBtn(1)}
            </div>
            <div style="display:flex;flex-direction:column;gap:.625rem;">
                ${field('Nom complet',         `${summary.personal.firstName} ${summary.personal.lastName}`)}
                ${field('Date de naissance',   summary.personal.dob)}
                ${field('Statut marital',       this.getMaritalStatusLabel(summary.personal.maritalStatus))}
                ${field('Téléphone',            summary.personal.phone)}
                ${field('Courriel',             summary.personal.email)}
                ${field('NAS',                  '••••••••• (masqué)')}
                ${field('Déclaration conjointe',summary.fiscal.jointDeclaration ? 'Oui' : 'Non')}
            </div>
        </div>`;

        // Carte adresse
        const fullAddress = [
            summary.personal.address,
            [summary.personal.city, summary.personal.province].filter(Boolean).join(', '),
            summary.personal.postalCode
        ].filter(Boolean).join('\n');
        html += `<div style="${S.card}">
            <div style="${S.header}">
                <p style="${S.title}">Adresse</p>
                ${editBtn(1)}
            </div>
            <div style="display:flex;flex-direction:column;gap:.625rem;">
                ${field('Rue',          summary.personal.address)}
                ${field('Ville',        summary.personal.city)}
                ${field('Province',     summary.personal.province)}
                ${field('Code postal',  summary.personal.postalCode)}
            </div>
        </div>`;

        html += gridClose;

        // ══════════════════════════════════════════════
        // SECTION 2 — STATUT FISCAL (+ CONJOINT si applicable)
        // ══════════════════════════════════════════════
        html += sectionTitle('📊', 'Statut fiscal');
        html += gridOpen;

        html += `<div style="${S.card}">
            <div style="${S.header}">
                <p style="${S.title}">Profil fiscal</p>
                ${editBtn(2)}
            </div>
            <div style="display:flex;flex-direction:column;gap:.625rem;">
                ${field('Statut au Canada',     this.getCanadaStatusLabel(summary.fiscal.canadaStatus))}
                ${field('Profil',               this.getFiscalProfileLabel(summary.fiscal.fiscalProfile))}
                ${field('Première déclaration', summary.fiscal.firstDeclaration === 'yes' ? 'Oui' : 'Non')}
                ${field('Enfants à charge',     summary.fiscal.hasChildren ? `Oui (${summary.children.length})` : 'Non')}
            </div>
        </div>`;

        if (summary.fiscal.jointDeclaration) {
            html += `<div style="${S.card}">
                <div style="${S.header}">
                    <p style="${S.title}">Conjoint(e)</p>
                    ${editBtn(3)}
                </div>
                <div style="display:flex;flex-direction:column;gap:.625rem;">
                    ${field('Nom complet',       `${summary.spouse.firstName} ${summary.spouse.lastName}`)}
                    ${field('Date de naissance', summary.spouse.dob)}
                    ${field('Téléphone',         summary.spouse.phone)}
                    ${field('Courriel',          summary.spouse.email)}
                    ${field('NAS',               '••••••••• (masqué)')}
                </div>
            </div>`;
        } else {
            // Cellule vide pour l'alignement
            html += `<div></div>`;
        }

        html += gridClose;

        // ══════════════════════════════════════════════
        // SECTION 3 — ENFANTS (pleine largeur)
        // ══════════════════════════════════════════════
        if (summary.children.length > 0) {
            html += sectionTitle('👶', 'Enfants à charge');
            html += `<div style="${S.card}">
                <div style="${S.header}">
                    <p style="${S.title}">${summary.children.length} enfant(s) à charge</p>
                    ${editBtn(4)}
                </div>
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:.75rem;margin-top:.25rem;">`;

            summary.children.forEach((child, i) => {
                html += `<div style="padding:.75rem;background:#f8fafc;border:1px solid #e2e8f0;border-radius:.5rem;">
                    <p style="margin:0 0 .5rem;font-size:.8125rem;font-weight:700;color:#3b5fd9;">
                        Enfant ${i + 1}
                    </p>
                    ${field('Prénom / Nom', `${child.firstName} ${child.lastName}`)}
                    ${field('Naissance',    child.dob)}
                    ${field('NAS',          '••••••••• (masqué)')}
                </div>`;
            });

            html += `</div></div>`;
        }

        // ══════════════════════════════════════════════
        // SECTION 4 — DOCUMENTS SÉLECTIONNÉS
        // ══════════════════════════════════════════════
        html += sectionTitle('📄', 'Documents sélectionnés');
        html += gridOpen;

        // Docs client (étape 5)
        html += `<div style="${S.card}">
            <div style="${S.header}">
                <p style="${S.title}">Revenus — Vous</p>
                ${editBtn(5)}
            </div>
            ${clientDocsSelected > 0
                ? badge(`${clientDocsSelected} type(s)`) + docList(summary.incomes.client)
                : `<p style="margin:.5rem 0 0;font-size:.8125rem;color:#94a3b8;">Aucun document sélectionné</p>`
            }
        </div>`;

        // Docs conjoint (étape 6) ou dépenses (étape 7) selon le cas
        if (summary.fiscal.jointDeclaration) {
            html += `<div style="${S.card}">
                <div style="${S.header}">
                    <p style="${S.title}">Revenus — Conjoint(e)</p>
                    ${editBtn(6)}
                </div>
                ${spouseDocsSelected > 0
                    ? badge(`${spouseDocsSelected} type(s)`) + docList(summary.incomes.spouse)
                    : `<p style="margin:.5rem 0 0;font-size:.8125rem;color:#94a3b8;">Aucun document sélectionné</p>`
                }
            </div>`;
        } else if (summary.fiscal.hasChildren) {
            // Dépenses enfants dans la 2e colonne si pas de conjoint
            html += `<div style="${S.card}">
                <div style="${S.header}">
                    <p style="${S.title}">Dépenses — Enfants</p>
                    ${editBtn(7)}
                </div>
                ${noExpenses
                    ? `<p style="margin:.5rem 0 0;font-size:.8125rem;color:#94a3b8;">Aucune dépense à déclarer</p>`
                    : expensesSelected > 0
                        ? badge(`${expensesSelected} type(s)`, '#059669') + `<ul style="margin:.5rem 0 0;padding-left:1.25rem;list-style:disc;display:flex;flex-direction:column;gap:.25rem;">
                              ${summary.expenses.filter(v => v !== 'aucune').map(v => `<li style="font-size:.8125rem;color:#475569;">${expenseLabels[v] || v}</li>`).join('')}
                          </ul>`
                        : `<p style="margin:.5rem 0 0;font-size:.8125rem;color:#94a3b8;">Aucune dépense sélectionnée</p>`
                }
            </div>`;
        } else {
            html += `<div></div>`;
        }

        html += gridClose;

        // Dépenses enfants pleine largeur (si conjoint ET enfants)
        if (summary.fiscal.jointDeclaration && summary.fiscal.hasChildren) {
            html += `<div style="${S.card};margin-top:.75rem;">
                <div style="${S.header}">
                    <p style="${S.title}">Dépenses — Enfants à charge</p>
                    ${editBtn(7)}
                </div>
                ${noExpenses
                    ? `<p style="margin:.5rem 0 0;font-size:.8125rem;color:#94a3b8;">Aucune dépense à déclarer</p>`
                    : expensesSelected > 0
                        ? badge(`${expensesSelected} type(s)`, '#059669') + `<ul style="margin:.5rem 0 0;padding-left:1.25rem;list-style:disc;columns:2;gap:1rem;">
                              ${summary.expenses.filter(v => v !== 'aucune').map(v => `<li style="font-size:.8125rem;color:#475569;break-inside:avoid;">${expenseLabels[v] || v}</li>`).join('')}
                          </ul>`
                        : `<p style="margin:.5rem 0 0;font-size:.8125rem;color:#94a3b8;">Aucune dépense sélectionnée</p>`
                }
            </div>`;
        }

        // ══════════════════════════════════════════════
        // SECTION 5 — FICHIERS TÉLÉVERSÉS
        // ══════════════════════════════════════════════
        html += sectionTitle('📁', 'Fichiers téléversés');

        const totalDocsChecked = clientDocsSelected + spouseDocsSelected;
        const filesUploaded    = this.uploadedFiles.length;
        const mismatch         = totalDocsChecked > 0 && filesUploaded === 0;
        const matchColor       = mismatch ? '#dc2626' : filesUploaded >= totalDocsChecked ? '#059669' : '#d97706';
        const matchIcon        = mismatch ? '⚠️' : filesUploaded >= totalDocsChecked ? '✅' : '⚠️';

        html += `<div style="${S.card}">
            <div style="${S.header}">
                <p style="${S.title}">Documents joints</p>
                ${editBtn(8)}
            </div>

            <div style="display:flex;align-items:center;gap:.625rem;margin-bottom:.75rem;padding:.5rem .75rem;
                        background:${matchColor}0f;border:1px solid ${matchColor}33;border-radius:.5rem;">
                <span>${matchIcon}</span>
                <p style="margin:0;font-size:.8125rem;color:${matchColor};font-weight:600;">
                    ${filesUploaded} fichier(s) téléversé(s) pour ${totalDocsChecked} type(s) de document(s) coché(s)
                    ${mismatch ? ' — Pensez à joindre vos documents !' : ''}
                </p>
            </div>

            ${filesUploaded > 0
                ? `<ul style="margin:0;padding-left:1.25rem;list-style:disc;display:flex;flex-direction:column;gap:.3rem;">
                       ${this.uploadedFiles.map(f => `<li style="font-size:.8125rem;color:#475569;">${f.file ? f.file.name : f.name}</li>`).join('')}
                   </ul>`
                : `<p style="font-size:.8125rem;color:#94a3b8;">Aucun fichier téléversé</p>`
            }
        </div>`;

        // ══════════════════════════════════════════════
        // BANNER ESTIMATION DU TARIF
        // ══════════════════════════════════════════════
        html += `
            <div style="margin-top:1.25rem;padding:1rem 1.25rem;
                        background:linear-gradient(135deg,#f0f9ff,#e0f2fe);
                        border:1px solid #bae6fd;border-radius:.625rem;
                        display:flex;align-items:flex-start;gap:.875rem;">
                <div style="width:2.5rem;height:2.5rem;flex-shrink:0;
                            background:#0284c7;border-radius:50%;
                            display:flex;align-items:center;justify-content:center;">
                    <i class="fas fa-calculator" style="color:#fff;font-size:.875rem;"></i>
                </div>
                <div style="flex:1;">
                    <p style="margin:0;font-weight:700;color:#075985;font-size:1rem;">
                        Estimation du service : <span style="color:#0ea5e9;">${estimated.min} $</span>
                    </p>
                    <p style="margin:.2rem 0 .4rem;font-size:.8125rem;color:#0369a1;font-style:italic;">
                        ${estimated.label}
                    </p>
                    <p style="margin:0;font-size:.75rem;color:#0369a1;">
                        Le montant final est confirmé par votre comptable après analyse de vos documents.
                        Ce tarif est fourni à titre indicatif.
                    </p>
                </div>
            </div>
        `;

        html += `</div></div>`; // ferme padding + wrapper principal

        this.elements.summaryContainer.innerHTML = html;
    }

    collectFormData() {
    const clientDocs = this.elements.clientDocs ? Array.from(this.elements.clientDocs) : [];
    const spouseDocs = this.elements.spouseDocs ? Array.from(this.elements.spouseDocs) : [];
    const childrenExpenses = this.elements.childrenExpenses ? Array.from(this.elements.childrenExpenses) : [];

    const data = {
        personal: {
            firstName: this.elements.firstName?.value || '',
            lastName: this.elements.lastName?.value || '',
            dob: this.elements.dob?.value || '',
            nas: this.elements.nas?.value || '',
            phone: this.elements.phone?.value || '',
            email: this.elements.email?.value || '',
            maritalStatus: this.elements.maritalStatus?.value || '',
            address: this.elements.address?.value || '',
            city: this.elements.city?.value || '',
            province: this.elements.province?.value || '',
            postalCode: this.elements.postalCode?.value || ''
        },
        fiscal: {
            canadaStatus:     this.elements.canadaStatus?.value    || '',
            firstDeclaration: this.elements.firstDeclaration?.value || 'no',
            fiscalProfile:    this.elements.fiscalProfile?.value   || '',
            hasChildren:      this.elements.hasChildren?.value === 'yes',
            jointDeclaration: this.elements.jointDeclaration?.checked || false
        },
        spouse: {
            firstName: this.elements.spouseFirstName?.value || '',
            lastName: this.elements.spouseLastName?.value || '',
            dob: this.elements.spouseDob?.value || '',
            nas: this.elements.spouseNas?.value || '',
            phone: this.elements.spousePhone?.value || '',
            email: this.elements.spouseEmail?.value || '',
            sameAddress: this.elements.spouseSameAddress?.value === 'yes',
            address: document.querySelector('input[name="spouse_address"]')?.value || '',
            city: document.querySelector('input[name="spouse_city"]')?.value || '',
            province: document.querySelector('select[name="spouse_province"]')?.value || '',
            postalCode: document.querySelector('input[name="spouse_postal_code"]')?.value || ''
        },
        children: [],
        incomes: {
            client: clientDocs.filter(doc => doc && doc.checked).map(doc => doc.value),
            spouse: spouseDocs.filter(doc => doc && doc.checked).map(doc => doc.value)
        },
        expenses: childrenExpenses.filter(exp => exp && exp.checked).map(exp => exp.value),
        documents: this.uploadedFiles.map(f => ({
            name: f.file.name,
            size: f.size,
            mimeType: f.type,
            documentType: this.getSelectedDocumentTypeForFile(f.file.name) || 'autre'
        })),
        feuilletsCount: this.countUploadedFeuillets()
    };

        data.documents = data.documents.map(doc => ({
            ...doc,
            documentType: doc.documentType || 'autre'
        }));

        if (data.fiscal.hasChildren) {
            const childEntries = this.elements.childrenList.querySelectorAll('.child-entry');
            childEntries.forEach(entry => {
                const childData = {
                    firstName: entry.querySelector('.child-first-name')?.value || '',
                    lastName: entry.querySelector('.child-last-name')?.value || '',
                    dob: entry.querySelector('.child-dob')?.value || '',
                    nas: entry.querySelector('.child-nas')?.value || ''
                };
                
                if (childData.firstName || childData.lastName) {
                    data.children.push(childData);
                }
            });
        }

        return data;
    }

    countUploadedFeuillets() {
        const feuilletTypes = ['t4', 't4a', 't5', 't2202', 'releve1', 'releve3', 'releve8', 'rl-8', 't5007', 't3'];
        
        return this.uploadedFiles.filter(file => {
            const fileName = file.name.toLowerCase();
            const docType = file.documentType || '';
            
            return feuilletTypes.some(type => 
                fileName.includes(type) || docType.includes(type)
            );
        }).length;
    }

    getSelectedDocumentTypeForFile(filename) {
        const clientDocs = Array.from(this.elements.clientDocs)
            .filter(d => d.checked)
            .map(d => d.value);

        const spouseDocs = Array.from(this.elements.spouseDocs)
            .filter(d => d.checked)
            .map(d => d.value);

        const allDocs = [...clientDocs, ...spouseDocs];

        if (allDocs.length === 1) {
            return allDocs[0];
        }
        
        if (allDocs.length > 1) {
            const lowerFilename = filename.toLowerCase();
            if (lowerFilename.includes('t4') || lowerFilename.includes('releve1')) {
                return 't4';
            } else if (lowerFilename.includes('t5') || lowerFilename.includes('releve3')) {
                return 't5';
            } else if (lowerFilename.includes('t2202')) {
                return 't2202';
            } else if (lowerFilename.includes('releve8')) {
                return 'releve8';
            }
        }

        return 'autre';
    }

    getMaritalStatusLabel(code) {
        const labels = {
            'single': 'Célibataire',
            'married': 'Marié(e)',
            'common_law': 'Conjoint(e) de fait',
            'separated': 'Séparé(e)',
            'divorced': 'Divorcé(e)',
            'widowed': 'Veuf/Veuve'
        };
        return labels[code] || code;
    }

    getCanadaStatusLabel(code) {
        const labels = {
            'citizen':            'Citoyen canadien',
            'permanent_resident': 'Résident permanent',
            'temporary_resident': 'Résident temporaire',
            'non_resident':       'Non-résident',
            'protected_person':   'Personne protégée'
        };
        return labels[code] || code;
    }

    getFiscalProfileLabel(code) {
        const labels = {
            'simple':     'Particulier simple (salarié)',
            'student':    'Étudiant(e)',
            'retired':    'Retraité(e)',
            'rental':     'Propriétaire avec revenu locatif',
            'succession': 'Déclaration de succession'
        };
        return labels[code] || (code || '—');
    }

    async handleSubmit(e) {
        e.preventDefault();
        
        if (this.isSubmitting) return;
        
        if (!this.validateFinalStep()) {
            return;
        }
        
        this.isSubmitting = true;
        
        const submitText = document.getElementById('submit-text');
        const submitLoading = document.getElementById('submit-loading');
        if (submitText && submitLoading) {
            submitText.classList.add('hidden');
            submitLoading.classList.remove('hidden');
        }
        
        this.showAlert('Soumission en cours...', 'info');
        
        try {
            const formData = new FormData();
            const data = this.collectFormData();

            formData.append('data', JSON.stringify(data));

            this.uploadedFiles.forEach(fileData => {
                formData.append('documents', fileData.file);
            });

            const response = await fetch('/api/taxes/particuliers/submit', {
                method: 'POST',
                credentials: 'include',
                body: formData
            });

            if (!response.ok) {
                let errorMessage = `Erreur serveur: ${response.status}`;
                try {
                    const errorData = await response.json();
                    errorMessage = errorData.message || errorMessage;
                } catch { /* réponse non-JSON */ }
                throw new Error(errorMessage);
            }

            const result = await response.json();

            if (result.success) {
                sessionStorage.setItem('declaration_submission', JSON.stringify({
                    firstName: data.personal.firstName,
                    lastName: data.personal.lastName,
                    email: data.personal.email,
                    submissionId: result.data.taxId,
                    clientId: result.data.clientId,
                    fiscalYear: new Date().getFullYear() - 1,
                    trackingUrl: result.data.trackingUrl || '/espace-client'
                }));

                this.showAlert('Déclaration soumise avec succès ! Redirection…', 'success');

                setTimeout(() => {
                    window.location.href = '/espace-client/merci.html';
                }, 2000);

            } else {
                throw new Error(result.message || 'Erreur lors de la soumission');
            }

        } catch (error) {
            console.error('[DeclarationForm] Erreur soumission:', error.message);

            if (error.message.includes('401')) {
                this.showAlert('Session expirée. Veuillez vous reconnecter.', 'error');
                setTimeout(() => window.location.href = '/auth/login.html', 2000);
            } else if (error.message.includes('413')) {
                this.showAlert('Fichiers trop volumineux. Réduisez leur taille et réessayez.', 'error');
            } else {
                this.showAlert(`Erreur : ${error.message}`, 'error');
            }

            // Réactiver le bouton de soumission
            this.isSubmitting = false;
            if (submitText && submitLoading) {
                submitText.classList.remove('hidden');
                submitLoading.classList.add('hidden');
            }
        }
    }

    calculateEstimatedAmount() {
        const data       = this.collectFormData();
        const hasChildren = data.fiscal.hasChildren;
        const joint       = data.fiscal.jointDeclaration;
        const profile     = data.fiscal.fiscalProfile || 'simple';
        const clientDocs  = data.incomes.client;
        const spouseDocs  = data.incomes.spouse;

        // Nombre de feuillets = checkboxes cochées dans les étapes 5 et 6
        const feuillets   = clientDocs.length + (joint ? spouseDocs.length : 0);

        // Comparaison docs cochés vs fichiers téléversés (pour info dans le résumé)
        this._feuilletCount = feuillets;
        this._uploadedCount = this.uploadedFiles.length;

        /* ── Grille tarifaire (image des tarifs, avril 2026) ──────────────── */

        // Succession — 180 $
        if (profile === 'succession') {
            return { min: 180, max: 180, label: 'Déclaration de succession' };
        }

        // Étudiant(e) — 55 $ ou 75 $ (T2202 + feuillets multiples)
        if (profile === 'student') {
            const hasMultiple = clientDocs.filter(d => d !== 't2202').length > 0;
            return hasMultiple
                ? { min: 75,  max: 75,  label: 'Étudiant(e) — crédit scolarité + feuillets multiples' }
                : { min: 55,  max: 55,  label: 'Étudiant(e) — profil simple' };
        }

        // Retraité(e) — 100 $ ou 145 $ (FERR/REER/OAS + revenus multiples)
        if (profile === 'retired') {
            const hasComplex = clientDocs.some(d => ['t4rif','t4rsp','t4aoas'].includes(d)) && feuillets > 2;
            return hasComplex
                ? { min: 145, max: 145, label: 'Retraité(e) — FERR/REER/OAS + revenus multiples' }
                : { min: 100, max: 100, label: 'Retraité(e) — RRQ/RPC + pension simple' };
        }

        // Propriétaire avec revenu locatif
        if (profile === 'rental') {
            const base = joint ? 180 : 135;
            return { min: base, max: base, label: 'Propriétaire — revenu locatif' };
        }

        // Couple avec enfants — 175 $ ou 215 $ (gains en capital / placements)
        if (joint && hasChildren) {
            const hasGains = [...clientDocs, ...spouseDocs].some(d => ['t5','t3','t4rsp','t4rif'].includes(d));
            return hasGains
                ? { min: 215, max: 215, label: 'Couple avec enfants — gains en capital / placements' }
                : { min: 175, max: 175, label: 'Couple avec enfants à charge' };
        }

        // Couple sans enfants — 130 $ ou 165 $ (>6 feuillets)
        if (joint && !hasChildren) {
            return feuillets > 6
                ? { min: 165, max: 165, label: 'Couple (sans enfants) — plus de 6 feuillets' }
                : { min: 130, max: 130, label: 'Couple (sans enfants)' };
        }

        // Famille monoparentale — 100 $ ou 135 $ (>4 feuillets)
        if (!joint && hasChildren) {
            return feuillets > 4
                ? { min: 135, max: 135, label: 'Famille monoparentale — plus de 4 feuillets' }
                : { min: 100, max: 100, label: 'Famille monoparentale' };
        }

        // Déclaration individuelle — 75 $ ou 110 $ (>4 feuillets)
        return feuillets > 4
            ? { min: 110, max: 110, label: 'Déclaration individuelle — plus de 4 feuillets' }
            : { min: 75,  max: 75,  label: 'Déclaration individuelle' };
    }

    saveDraft() {
        const data = this.collectFormData();

        // Exclure les données sensibles du brouillon local
        const safPersonal = { ...data.personal };
        delete safPersonal.nas;

        const safeSpouse = { ...data.spouse };
        delete safeSpouse.nas;

        const draft = {
            version: 3,
            currentStep: this.currentStep,
            currentChildIndex: this.currentChildIndex,
            totalChildren: this.totalChildren,
            uploadedFilesMeta: this.uploadedFiles.map(f => ({
                id: f.id,
                name: f.file.name,
                size: f.file.size,
                type: f.file.type
            })),
            formState: {
                maritalStatus:   this.elements.maritalStatus?.value   || '',
                jointDeclaration: this.elements.jointDeclaration?.checked || false,
                hasChildren:     this.elements.hasChildren?.value     || 'no',
                childrenCount:   this.elements.childrenCount?.value   || 0,
                fiscalProfile:   this.elements.fiscalProfile?.value   || ''
            },
            data: { ...data, personal: safPersonal, spouse: safeSpouse },
            savedAt: new Date().toISOString()
        };

        localStorage.setItem('taxDeclarationDraft', JSON.stringify(draft));
    }


    loadDraft() {

        const draftRaw = localStorage.getItem('taxDeclarationDraft');
        if (!draftRaw) return false;

        try {

            const draft = JSON.parse(draftRaw);

            // Ignorer les brouillons d'anciennes versions (v1/v2 stockaient le NAS)
            if (!draft.version || draft.version < 3) {
                localStorage.removeItem('taxDeclarationDraft');
                return false;
            }

            const data = draft.data || {};

            /* ========================
            RESTAURATION PERSONNEL
            ======================== */

            Object.entries(data.personal || {}).forEach(([key, value]) => {
                const field = document.querySelector(`[name="${this.mapPersonalField(key)}"]`);
                if (field) field.value = value;
            });

            /* ========================
            RESTAURATION FISCAL
            ======================== */

            if (this.elements.maritalStatus) {
                this.elements.maritalStatus.value = draft.formState.maritalStatus;
                this.toggleJointDeclaration();
            }

            if (this.elements.jointDeclaration) {
                this.elements.jointDeclaration.checked = draft.formState.jointDeclaration;
            }

            if (this.elements.hasChildren) {
                this.elements.hasChildren.value = draft.formState.hasChildren;
                this.toggleChildrenFields();
            }

            if (this.elements.childrenCount) {
                this.elements.childrenCount.value = draft.formState.childrenCount;
                this.prepareChildrenForms();
            }

            if (this.elements.fiscalProfile && draft.formState.fiscalProfile) {
                this.elements.fiscalProfile.value = draft.formState.fiscalProfile;
            }

            // Restaurer canada_status et first_declaration depuis les données sauvegardées
            if (this.elements.canadaStatus && data.fiscal?.canadaStatus) {
                this.elements.canadaStatus.value = data.fiscal.canadaStatus;
            }
            if (this.elements.firstDeclaration && data.fiscal?.firstDeclaration) {
                this.elements.firstDeclaration.value = data.fiscal.firstDeclaration;
            }

            /* ========================
            RESTAURATION ENFANTS
            ======================== */

            if (data.children && data.children.length > 0) {
                const childEntries = this.elements.childrenList.querySelectorAll('.child-entry');
                data.children.forEach((child, index) => {
                    const entry = childEntries[index];
                    if (!entry) return;

                    entry.querySelector('.child-first-name').value = child.firstName || '';
                    entry.querySelector('.child-last-name').value = child.lastName || '';
                    entry.querySelector('.child-dob').value = child.dob || '';
                });
            }

            /* ========================
            RESTAURATION NAVIGATION
            ======================== */

            this.currentStep = draft.currentStep || 1;
            this.currentChildIndex = draft.currentChildIndex || 0;
            this.totalChildren = draft.totalChildren || 0;

            this.showStep(this.currentStep);

            this.showAlert('Brouillon restauré avec succès.', 'success');

            return true;

        } catch (e) {
            console.error('[DeclarationForm] Erreur restauration brouillon:', e);
            return false;
        }
    }

    mapPersonalField(key) {
        const map = {
            firstName: 'first_name',
            lastName: 'last_name',
            dob: 'date_of_birth',
            nas: 'nas',
            phone: 'phone',
            email: 'email',
            address: 'address_line1',
            city: 'city',
            province: 'province',
            postalCode: 'postal_code'
        };
        return map[key];
    }

    showStep(step) {
        this.elements.steps.forEach((s, index) => {
            if (index + 1 === step) {
                s.classList.add('active');
            } else {
                s.classList.remove('active');
            }
        });
        
        this.updateNavigationButtons();
        
        if (step === 8) {
            this.generateSummary();
        }
    }

    goToStep(step) {

        if (step < 1 || step > this.totalSteps) return;

        // Masquer toutes les étapes
        this.elements.steps.forEach(s => s.classList.remove('active'));

        // Mettre à jour étape courante
        this.currentStep = step;

        // Afficher étape demandée
        this.elements.steps[step - 1].classList.add('active');

        this.updateNavigationButtons();

        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    }
}

// ─── Bannière de restauration de brouillon (non-bloquante) ───────────────────
function showDraftBanner(onRestore, onIgnore) {
    const banner = document.createElement('div');
    banner.id = 'draft-banner';
    banner.setAttribute('style',
        'position:fixed;bottom:1.5rem;left:50%;transform:translateX(-50%);' +
        'z-index:9998;background:#1e293b;color:#f1f5f9;' +
        'padding:.875rem 1.25rem;border-radius:.625rem;' +
        'box-shadow:0 4px 20px rgba(0,0,0,.3);' +
        'display:flex;align-items:center;gap:1rem;max-width:30rem;width:calc(100% - 2rem);'
    );
    banner.innerHTML = `
        <i class="fas fa-history" style="color:#60a5fa;font-size:1.125rem;flex-shrink:0;"></i>
        <span style="flex:1;font-size:.875rem;line-height:1.4;">
            Vous avez un brouillon non terminé. Voulez-vous le reprendre ?
        </span>
        <button id="draft-restore-btn" style="
            background:#3b82f6;color:#fff;border:none;border-radius:.375rem;
            padding:.375rem .75rem;font-size:.8125rem;cursor:pointer;white-space:nowrap;">
            Reprendre
        </button>
        <button id="draft-ignore-btn" style="
            background:transparent;color:#94a3b8;border:none;
            font-size:1rem;cursor:pointer;padding:.25rem .375rem;">
            <i class="fas fa-times"></i>
        </button>
    `;
    document.body.appendChild(banner);

    document.getElementById('draft-restore-btn').onclick = () => {
        banner.remove();
        onRestore();
    };
    document.getElementById('draft-ignore-btn').onclick = () => {
        banner.remove();
        localStorage.removeItem('taxDeclarationDraft');
        onIgnore();
    };
}

// ─── Initialisation ───────────────────────────────────────────────────────────
let declarationForm;

document.addEventListener('DOMContentLoaded', () => {
    declarationForm = new DeclarationForm();

    // Exposer globalement pour les appels depuis HTML (goToStep, removeFile…)
    window.declarationForm = declarationForm;

    // ── 1. Pré-remplir nom, prénom et email depuis la session (NAS jamais pré-rempli) ──
    fetch('/api/client/espace-client/me', { credentials: 'include' })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
            if (!data) return;
            declarationForm.prefillWithClientData({
                firstName: data.first_name || data.firstName || '',
                lastName:  data.last_name  || data.lastName  || '',
                email:     data.email      || ''
                // NAS volontairement absent — jamais pré-rempli pour sécurité
            });
        })
        .catch(() => { /* session non disponible — le guard a déjà géré */ });

    // ── 2. Sauvegarde automatique du brouillon ──────────────────────────────
    let saveTimeout;
    const saveDraftDebounced = () => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => declarationForm.saveDraft(), 2000);
    };

    document.querySelectorAll('input, select, textarea').forEach(el => {
        el.addEventListener('change', saveDraftDebounced);
        el.addEventListener('input',  saveDraftDebounced);
    });

    // ── 3. Proposer la restauration du brouillon (bannière non-bloquante) ───
    const hasDraft = localStorage.getItem('taxDeclarationDraft');
    if (hasDraft) {
        showDraftBanner(
            () => declarationForm.loadDraft(),
            () => { /* brouillon ignoré et supprimé */ }
        );
    }
});

// Extension pour pré-remplir avec les données client
DeclarationForm.prototype.prefillWithClientData = function(clientData) {
    if (!clientData) return;
    
    // Informations personnelles
    if (clientData.firstName && this.elements.firstName) {
        this.elements.firstName.value = clientData.firstName;
    }
    if (clientData.lastName && this.elements.lastName) {
        this.elements.lastName.value = clientData.lastName;
    }
    if (clientData.email && this.elements.email) {
        this.elements.email.value = clientData.email;
    }
    if (clientData.phone && this.elements.phone) {
        this.elements.phone.value = clientData.phone;
    }
    if (clientData.dateOfBirth && this.elements.dob) {
        this.elements.dob.value = clientData.dateOfBirth;
    }
    if (clientData.address && this.elements.address) {
        this.elements.address.value = clientData.address;
    }
    if (clientData.city && this.elements.city) {
        this.elements.city.value = clientData.city;
    }
    if (clientData.province && this.elements.province) {
        this.elements.province.value = clientData.province;
    }
    if (clientData.postalCode && this.elements.postalCode) {
        this.elements.postalCode.value = clientData.postalCode;
    }
    
    // Statut fiscal
    if (clientData.canadaStatus && this.elements.canadaStatus) {
        this.elements.canadaStatus.value = clientData.canadaStatus;
    }
    if (clientData.maritalStatus && this.elements.maritalStatus) {
        this.elements.maritalStatus.value = clientData.maritalStatus;
        this.toggleJointDeclaration(); 
    }
};