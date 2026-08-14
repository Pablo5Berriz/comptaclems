'use strict';

(function () {
  // ====================================
  // ÉLÉMENTS DOM
  // ====================================
  const els = {
    alert: document.getElementById('pageAlert'),
    successLine: document.getElementById('successLine'),
    fiscalYearLine: document.getElementById('fiscalYearLine'),
    submissionId: document.getElementById('submissionId'),
    copyBtn: document.getElementById('copyBtn'),
    countdown: document.getElementById('countdown'),
    goNowBtn: document.getElementById('goNowBtn'),
    confettiBg: document.getElementById('confettiBg'),
  };

  // ====================================
  // CONFIGURATION
  // ====================================
  const CONFIG = {
    COUNTDOWN_SECONDS: 5,
    SESSION_KEY: 'declaration_submission',
    REDIRECT_URL: '/espace-client/profil.html',
    TOAST_DURATION: 5000,
  };

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

  function showAlert(message, type = 'info') {
    if (!els.alert) return;

    const colorMap = {
      success: { bg: '#f0fdf4', border: '#86efac', text: '#166534' },
      error: { bg: '#fef2f2', border: '#fca5a5', text: '#991b1b' },
      info: { bg: '#eff6ff', border: '#93c5fd', text: '#1e40af' },
      warning: { bg: '#fffbeb', border: '#fcd34d', text: '#92400e' }
    };

    const icons = {
      error: 'fa-circle-exclamation',
      success: 'fa-circle-check',
      info: 'fa-circle-info',
      warning: 'fa-triangle-exclamation',
    };

    const colors = colorMap[type] || colorMap.info;

    els.alert.style.cssText = `position:fixed;top:1rem;left:50%;transform:translateX(-50%);z-index:9999;max-width:36rem;width:calc(100% - 2rem);border-radius:0.875rem;border:1px solid ${colors.border};padding:1rem 1.25rem;font-size:0.875rem;display:flex;align-items:flex-start;gap:0.75rem;box-shadow:0 20px 60px rgba(0,0,0,0.15);background:${colors.bg};color:${colors.text};`;
    els.alert.classList.remove('hidden');
    els.alert.innerHTML = `
      <i class="fas ${icons[type] || 'fa-circle-info'} text-lg mt-0.5"></i>
      <div style="flex:1;font-weight:500;">${escapeHtml(message)}</div>
      <button type="button" style="background:none;border:none;cursor:pointer;color:inherit;opacity:0.7;transition:opacity 0.2s;" aria-label="Fermer" data-alert-close="1">
        <i class="fas fa-times"></i>
      </button>
    `;

    els.alert.querySelector('[data-alert-close="1"]')?.addEventListener('click', () => {
      els.alert.classList.add('hidden');
      els.alert.innerHTML = '';
    });

    setTimeout(() => {
      els.alert.classList.add('hidden');
      els.alert.innerHTML = '';
    }, CONFIG.TOAST_DURATION);
  }

  function showToast(message, type = 'info') {
    // Utilise showAlert car c'est le même style
    showAlert(message, type);
  }

  // ====================================
  // GESTION DES DONNÉES DE SESSION
  // ====================================
  function getSessionData() {
    try {
      const submissionData = sessionStorage.getItem(CONFIG.SESSION_KEY);
      if (!submissionData) {
        console.warn('Aucune donnée de déclaration trouvée en session');
        return {};
      }
      return JSON.parse(submissionData) || {};
    } catch (_) {
      console.error('Erreur lors de la lecture des données de session');
      return {};
    }
  }

  function clearSessionData() {
    try {
      sessionStorage.removeItem(CONFIG.SESSION_KEY);
    } catch (e) {
      console.error('Erreur lors du nettoyage de la session', e);
    }
  }

  // ====================================
  // COPIE DU CODE
  // ====================================
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      showAlert('✅ Code copié dans le presse-papiers.', 'success');
      return true;
    } catch (_) {
      // Fallback pour les navigateurs plus anciens
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', 'true');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        showAlert('✅ Code copié dans le presse-papiers.', 'success');
        return true;
      } catch (e) {
        showAlert('❌ Impossible de copier automatiquement. Veuillez sélectionner le code manuellement.', 'error');
        return false;
      }
    }
  }

  // ====================================
  // CONFETTI ANIMATION
  // ====================================
  function createConfetti() {
    if (!els.confettiBg) return;
    
    const colors = ['#4f46e5', '#6366f1', '#10b981', '#f59e0b'];
    const confettiCount = 30;
    
    for (let i = 0; i < confettiCount; i++) {
      setTimeout(() => {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        confetti.style.left = Math.random() * 100 + '%';
        confetti.style.background = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.animationDelay = Math.random() * 0.5 + 's';
        confetti.style.width = Math.random() * 8 + 4 + 'px';
        confetti.style.height = confetti.style.width;
        els.confettiBg?.appendChild(confetti);
        
        setTimeout(() => {
          confetti.remove();
        }, 3000);
      }, i * 100);
    }
  }

  // ====================================
  // INITIALISATION
  // ====================================
  function boot() {
    // Lancer les confettis
    createConfetti();

    const sessionData = getSessionData();

    const firstName = sessionData.firstName || '';
    const lastName = sessionData.lastName || '';
    const email = sessionData.email || '';
    const submissionId = sessionData.submissionId || '';
    const fiscalYear = sessionData.fiscalYear || new Date().getFullYear() - 1;
    const clientId = sessionData.clientId || '';
    const fullName = `${firstName} ${lastName}`.trim();

    // Message de remerciement personnalisé
    if (els.successLine) {
      els.successLine.textContent = fullName
        ? `Merci ${fullName}. Votre déclaration a été reçue avec succès.`
        : `Merci. Votre déclaration a été reçue avec succès.`;
    }

    // Code de soumission
    if (els.submissionId) {
      const displayId = submissionId || `DEC-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
      els.submissionId.value = displayId;
      
      // Si pas de submissionId, on le sauvegarde pour le client
      if (!submissionId && sessionData) {
        sessionData.submissionId = displayId;
        try {
          sessionStorage.setItem(CONFIG.SESSION_KEY, JSON.stringify(sessionData));
        } catch (e) {}
      }
    }
    
    // Année fiscale
    if (els.fiscalYearLine) {
      els.fiscalYearLine.textContent = fiscalYear ? `Année fiscale: ${fiscalYear}` : '';
    }

    // Copie du code
    els.copyBtn?.addEventListener('click', () => {
      const code = (els.submissionId?.value || '').trim();
      if (!code) {
        showAlert('Aucun code à copier.', 'error');
        return;
      }
      copyText(code);
    });

    // Countdown
    let seconds = CONFIG.COUNTDOWN_SECONDS;
    if (els.countdown) els.countdown.textContent = String(seconds);

    // Construction de l'URL de redirection
    let targetHref = CONFIG.REDIRECT_URL;
    const params = new URLSearchParams();
    
    if (clientId) {
      params.append('clientId', clientId);
    }
    if (submissionId) {
      params.append('submissionId', submissionId);
    }
    if (fiscalYear) {
      params.append('year', fiscalYear);
    }
    
    const queryString = params.toString();
    if (queryString) {
      targetHref += `?${queryString}`;
    }
    
    if (els.goNowBtn) {
      els.goNowBtn.href = targetHref;
    }

    // Timer de redirection
    const interval = window.setInterval(() => {
      seconds -= 1;
      if (els.countdown) els.countdown.textContent = String(Math.max(0, seconds));

      if (seconds <= 0) {
        window.clearInterval(interval);
        
        // Ajouter une petite animation avant la redirection
        if (els.goNowBtn) {
          els.goNowBtn.classList.add('animate-pulse');
        }
        
        setTimeout(() => {
          window.location.href = targetHref;
        }, 200);
      }
    }, 1000);
    
    // Nettoyer les données de session après 5 minutes
    setTimeout(() => {
      clearSessionData();
    }, 5 * 60 * 1000);
  }

  document.addEventListener('DOMContentLoaded', boot);
})();