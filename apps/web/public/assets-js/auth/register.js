'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('registerForm');
  const alertBox = document.getElementById('registerAlert');
  const submitBtn = document.getElementById('registerSubmit');

  if (!form) return;

  const showAlert = (msg, type = 'error') => {
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
      ? '<i class="fas fa-spinner fa-spin mr-3"></i>Création en cours...'
      : '<i class="fas fa-user-plus mr-3"></i>Créer mon compte';
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

    const payload = {
      first_name: form.first_name.value.trim(),
      last_name: form.last_name.value.trim(),
      email: form.email.value.trim(),
      phone: form.phone.value.trim(),
      password: form.password.value,
    };

    if (!payload.first_name || !payload.last_name || !payload.email || !payload.phone || !payload.password) {
      showAlert('Tous les champs sont requis.');
      return;
    }

    if (form.password.value !== document.getElementById('confirm_password').value) {
      showAlert('Les mots de passe ne correspondent pas.');
      return;
    }

    if (!document.getElementById('cgu').checked) {
      showAlert('Tu dois accepter les conditions.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok) {
        showAlert(json.error || 'Inscription impossible.');
        return;
      }

      showAlert('Compte créé avec succès. Redirection...', 'success');

      const redirect = encodeURIComponent(getRedirect());
      window.location.assign(`/auth/login.html?redirect=${redirect}`);
    } catch (err) {
      console.error(err);
      showAlert('Erreur serveur. Réessaie plus tard.');
    } finally {
      setLoading(false);
    }
  });
});
