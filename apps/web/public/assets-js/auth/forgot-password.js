'use strict';

(function () {
  // ====================================
  // ÉLÉMENTS DOM
  // ====================================
  const elements = {
    form: document.getElementById('forgotForm'),
    emailInput: document.getElementById('email'),
    alertBox: document.getElementById('forgotAlert'),
    submitBtn: document.getElementById('forgotSubmit'),
    submitText: document.getElementById('submitText'),
    submitSpinner: document.getElementById('submitSpinner')
  };

  // ====================================
  // UTILITAIRES
  // ====================================
  function showAlert(message, type = 'info') {
    if (!elements.alertBox) return;
    
    const icons = {
      success: 'fa-circle-check',
      error: 'fa-circle-exclamation',
      warning: 'fa-triangle-exclamation',
      info: 'fa-circle-info'
    };
    
    const colors = {
      success: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      error: 'bg-red-50 text-red-800 border-red-200',
      warning: 'bg-amber-50 text-amber-800 border-amber-200',
      info: 'bg-blue-50 text-blue-800 border-blue-200'
    };
    
    elements.alertBox.innerHTML = `
      <div class="flex items-center gap-3">
        <i class="fas ${icons[type]} text-lg"></i>
        <span>${escapeHtml(message)}</span>
      </div>
    `;
    
    elements.alertBox.className = `auth-alert ${colors[type]} p-4 rounded-xl mb-6 flex items-center gap-3 animate-fadeIn`;
    elements.alertBox.classList.remove('hidden');
  }

  function hideAlert() {
    if (elements.alertBox) {
      elements.alertBox.classList.add('hidden');
    }
  }

  function escapeHtml(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function setLoading(isLoading) {
    if (!elements.submitBtn) return;
    
    elements.submitBtn.disabled = isLoading;
    
    if (isLoading) {
      elements.submitBtn.innerHTML = `
        <i class="fas fa-spinner fa-spin mr-2"></i>
        Envoi en cours...
      `;
    } else {
      elements.submitBtn.innerHTML = `
        <i class="fas fa-paper-plane mr-2"></i>
        Envoyer le lien
      `;
    }
  }

  function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  }

  // ====================================
  // SOUMISSION DU FORMULAIRE
  // ====================================
  async function handleSubmit(e) {
    e.preventDefault();
    hideAlert();

    const email = elements.emailInput?.value?.trim() || '';

    // Validation
    if (!email) {
      showAlert('Veuillez saisir votre adresse courriel', 'error');
      elements.emailInput?.focus();
      return;
    }

    if (!validateEmail(email)) {
      showAlert('Adresse courriel invalide', 'error');
      elements.emailInput?.focus();
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/client/forgot-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ email })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Erreur lors de la demande');
      }

      // Succès - même si le compte n'existe pas (sécurité)
      showAlert(
        '✅ Si un compte correspond à cet email, vous recevrez un lien de réinitialisation dans quelques instants. Vérifiez vos spams.',
        'success'
      );
      
      // Réinitialiser le formulaire
      if (elements.emailInput) elements.emailInput.value = '';

    } catch (error) {
      console.error('Erreur forgot-password:', error);
      
      // Message générique pour la sécurité (ne pas révéler si l'email existe)
      showAlert(
        '❌ Une erreur est survenue. Veuillez réessayer plus tard.',
        'error'
      );
    } finally {
      setLoading(false);
    }
  }

  // ====================================
  // INITIALISATION
  // ====================================
  function init() {
    if (!elements.form) {
      console.error('Formulaire forgot-password non trouvé');
      return;
    }

    elements.form.addEventListener('submit', handleSubmit);

    // Focus sur le champ email
    if (elements.emailInput) {
      elements.emailInput.focus();
    }

    console.log('✅ Forgot password page initialized');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();