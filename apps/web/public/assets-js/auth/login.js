'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  const alertBox = document.getElementById('loginAlert');
  const submitBtn = document.getElementById('loginSubmit');

  if (!form) return;

  const showAlert = (msg, type = 'error') => {
    if (!alertBox) return;

    alertBox.classList.remove('hidden', 'is-error', 'is-success');
    alertBox.classList.add(type === 'success' ? 'is-success' : 'is-error');
    alertBox.textContent = msg;
  };

  const hideAlert = () => {
    alertBox?.classList.add('hidden');
  };

  const setLoading = (on) => {
    submitBtn.disabled = on;
    submitBtn.innerHTML = on
      ? '<i class="fas fa-circle-notch fa-spin mr-3"></i>Connexion...'
      : '<i class="fas fa-sign-in-alt mr-3"></i>Se connecter';
  };

  const getRedirect = () => {
    const params = new URLSearchParams(window.location.search);
    const redirect = params.get('redirect');
    if (redirect && redirect.startsWith('/')) return redirect;
    return '/index.html';
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();

    const email = form.email.value.trim();
    const password = form.password.value.trim();
    const rememberMe = !!form.remember.checked;

    if (!email || !password) {
      showAlert('E-mail et mot de passe requis.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ email, password, rememberMe }),
      });

      const json = await res.json();

      if (!res.ok) {
        showAlert(json.error || 'Identifiants invalides.');
        return;
      }

      showAlert('Connexion réussie. Redirection...', 'success');
      window.location.assign(getRedirect());
    } catch (err) {
      console.error(err);
      showAlert('Erreur serveur. Réessaie plus tard.');
    } finally {
      setLoading(false);
    }
  });
});
