// public/assets-js/admin/adminLogin.js
'use strict';

document.addEventListener('DOMContentLoaded', () => {

  const form          = document.getElementById('adminLoginForm');
  const alertBox      = document.getElementById('adminLoginAlert');
  const submitBtn     = document.getElementById('adminLoginSubmit');
  const emailInput    = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const togglePassword = document.getElementById('togglePassword');

  if (!form || !alertBox || !submitBtn || !emailInput || !passwordInput) {
    console.error('Éléments du formulaire manquants');
    return;
  }

  const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 jours

  // ── Affichage/masquage du mot de passe ───────────────────────────────────────
  if (togglePassword) {
    togglePassword.addEventListener('click', function () {
      const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
      passwordInput.setAttribute('type', type);
      const icon = this.querySelector('i');
      if (icon) icon.className = type === 'password' ? 'fa-regular fa-eye' : 'fa-regular fa-eye-slash';
    });
  }

  /* ─── UI Helpers ─────────────────────────────────────────────────────────── */

  function showAlert(message, type = 'error') {
    alertBox.className = 'auth-alert';
    if (type === 'success') {
      alertBox.classList.add('bg-emerald-900/50', 'text-emerald-100', 'border-emerald-700/80');
    } else {
      alertBox.classList.add('bg-red-900/60', 'text-red-200', 'border-red-700/80');
    }
    alertBox.textContent = String(message || '');
    alertBox.classList.remove('hidden');
  }

  function hideAlert() {
    alertBox.classList.add('hidden');
    alertBox.textContent = '';
  }

  function setLoading(isLoading, btn = submitBtn) {
    btn.disabled = isLoading;
    btn.classList.toggle('opacity-70', isLoading);
    btn.classList.toggle('cursor-not-allowed', isLoading);
    btn.innerHTML = isLoading
      ? '<span class="flex items-center justify-center"><i class="fas fa-spinner fa-spin mr-3"></i>Connexion…</span>'
      : btn.dataset.defaultLabel || '<span class="flex items-center justify-center"><i class="fas fa-right-to-bracket mr-3 text-lg"></i>Connexion</span>';
  }

  /* ─── Security Helpers ───────────────────────────────────────────────────── */

  function safeInternalPath(raw) {
    const s = String(raw || '').trim();
    if (!s) return null;
    if (!s.startsWith('/')) return null;
    if (s.startsWith('//')) return null;
    if (s.includes('\\')) return null;
    if (s.toLowerCase().startsWith('javascript:')) return null;
    if (s.startsWith('http://') || s.startsWith('https://')) return null;
    return s;
  }

  function getRedirectUrl() {
    const params = new URLSearchParams(window.location.search);
    const redirectParam = safeInternalPath(params.get('redirect'));
    return redirectParam || '/admin/adminDashboard.html';
  }

  function storeSession(token, admin) {
    localStorage.setItem(
      'cc_admin_auth',
      JSON.stringify({
        token,
        admin,
        stored_at: Date.now(),
        expires_at: Date.now() + SESSION_DURATION
      })
    );
  }

  function checkExistingSession() {
    const auth = localStorage.getItem('cc_admin_auth');
    if (auth) {
      try {
        const authData = JSON.parse(auth);
        if (authData.token && authData.expires_at > Date.now()) {
          window.location.href = '/admin/adminDashboard.html';
        } else if (authData.expires_at <= Date.now()) {
          localStorage.removeItem('cc_admin_auth');
        }
      } catch {
        localStorage.removeItem('cc_admin_auth');
      }
    }
  }

  /* ─── Étape 2FA ──────────────────────────────────────────────────────────── */

  let pendingToken = null; // stocké en mémoire seulement (pas localStorage)

  function injectTotpStep() {
    // Si le bloc 2FA existe déjà, juste le montrer
    let block = document.getElementById('totpBlock');
    if (!block) {
      block = document.createElement('div');
      block.id = 'totpBlock';
      block.innerHTML = `
        <div class="mt-6 p-5 rounded-2xl border border-yellow-500/40 bg-yellow-900/20">
          <div class="flex items-center gap-3 mb-4">
            <div class="w-10 h-10 rounded-xl bg-yellow-500/20 flex items-center justify-center text-yellow-400">
              <i class="fas fa-shield-halved text-lg"></i>
            </div>
            <div>
              <p class="font-semibold text-white text-sm">Vérification en deux étapes</p>
              <p class="text-xs text-slate-400">Saisissez le code à 6 chiffres de votre application TOTP</p>
            </div>
          </div>
          <div class="flex gap-3">
            <input
              id="totpCode"
              type="text"
              inputmode="numeric"
              autocomplete="one-time-code"
              maxlength="6"
              pattern="[0-9]{6}"
              placeholder="000 000"
              class="flex-1 text-center text-2xl tracking-widest font-mono px-4 py-3 bg-slate-800 border border-slate-600 rounded-xl text-white focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/20 outline-none transition"
            />
            <button
              id="totpSubmitBtn"
              type="button"
              data-default-label='<span class="flex items-center gap-2"><i class="fas fa-check-circle"></i> Valider</span>'
              class="px-5 py-3 bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold rounded-xl transition text-sm whitespace-nowrap"
            >
              <span class="flex items-center gap-2"><i class="fas fa-check-circle"></i> Valider</span>
            </button>
          </div>
          <p class="mt-3 text-xs text-slate-500 text-center">
            Le code expire dans 30 secondes. Ouvrez votre application d'authentification (Google Authenticator, Authy, etc.)
          </p>
        </div>
      `;
      form.appendChild(block);

      // Masquer les champs email/password et bouton principal
      document.getElementById('email')?.closest('.form-group, div')?.closest('div[class]')?.classList.add('hidden');
      document.querySelectorAll('#adminLoginForm .form-group, #adminLoginForm .field-group').forEach(el => el.classList.add('hidden'));
      submitBtn.classList.add('hidden');

      // Lier le bouton de validation TOTP
      document.getElementById('totpSubmitBtn').addEventListener('click', submitTotp);

      // Valider aussi sur Entrée dans le champ TOTP
      document.getElementById('totpCode').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); submitTotp(); }
      });

      // Focus automatique
      setTimeout(() => document.getElementById('totpCode')?.focus(), 100);
    }

    block.classList.remove('hidden');
  }

  async function submitTotp() {
    const totpCode    = String(document.getElementById('totpCode')?.value || '').trim().replace(/\s/g, '');
    const totpBtn     = document.getElementById('totpSubmitBtn');

    if (!/^\d{6}$/.test(totpCode)) {
      showAlert('Le code TOTP doit comporter exactement 6 chiffres.');
      return;
    }

    if (!pendingToken) {
      showAlert('Session expirée — veuillez vous reconnecter.');
      location.reload();
      return;
    }

    setLoading(true, totpBtn);
    hideAlert();

    try {
      const response = await fetch('/api/admin/2fa/validate-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pending_token: pendingToken, totp_code: totpCode })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        showAlert(data.error || 'Code TOTP invalide ou expiré.');
        document.getElementById('totpCode').value = '';
        document.getElementById('totpCode').focus();
        return;
      }

      if (!data.token || !data.admin) {
        showAlert('Réponse serveur invalide.');
        return;
      }

      storeSession(data.token, data.admin);
      showAlert('Connexion réussie. Redirection…', 'success');
      pendingToken = null; // nettoyage mémoire

      setTimeout(() => window.location.assign(getRedirectUrl()), 900);

    } catch (err) {
      console.error('[2FA] Erreur:', err);
      showAlert('Erreur de connexion au serveur. Vérifiez votre connexion.');
    } finally {
      setLoading(false, totpBtn);
    }
  }

  /* ─── Login Handler (étape 1 : email + mot de passe) ─────────────────────── */

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();

    const email    = String(emailInput.value || '').trim().toLowerCase();
    const password = String(passwordInput.value || '');

    if (!email || !password) {
      showAlert('E-mail et mot de passe requis.');
      return;
    }

    setLoading(true);

    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ email, password }),
        signal: controller.signal
      });

      clearTimeout(timeout);

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        showAlert(data.error || data.message || 'Identifiants invalides.');
        return;
      }

      // ── Cas 2FA requise ──────────────────────────────────────────────────────
      if (data.requires_2fa) {
        pendingToken = data.pending_token;
        injectTotpStep();
        showAlert('Identifiants corrects. Veuillez saisir votre code TOTP.', 'success');
        return;
      }

      // ── Connexion directe sans 2FA ───────────────────────────────────────────
      if (!data.token || !data.admin) {
        showAlert('Réponse serveur invalide.');
        return;
      }

      storeSession(data.token, data.admin);
      showAlert('Connexion réussie. Redirection…', 'success');

      setTimeout(() => window.location.assign(getRedirectUrl()), 1000);

    } catch (error) {
      clearTimeout(timeout);
      if (error.name === 'AbortError') {
        showAlert('Temps de réponse dépassé. Réessayez.');
      } else {
        console.error('Erreur login admin:', error);
        showAlert('Erreur de connexion au serveur. Vérifiez votre connexion.');
      }
    } finally {
      setLoading(false);
    }
  });

  // Vérifier la session existante au chargement
  checkExistingSession();
});
