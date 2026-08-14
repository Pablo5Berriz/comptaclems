'use strict';

document.addEventListener('DOMContentLoaded', () => {
  initContactForm();
});

/* =========================
 * Contact form (API driven)
 * ========================= */
function initContactForm() {
  const form = document.getElementById('contactForm');
  if (!form) return;

  const alertBox = document.getElementById('contactAlert');
  const submitBtn = document.getElementById('contactSubmit');

  const showAlert = (msg, type = 'info') => {
    if (!alertBox) return;

    const styles = {
      success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      error: 'bg-red-50 text-red-700 border-red-200',
      info: 'bg-blue-50 text-blue-700 border-blue-200',
    };

    alertBox.className = `mb-6 p-4 rounded-xl text-sm border ${styles[type]}`;
    alertBox.textContent = msg;
    alertBox.classList.remove('hidden');
  };

  const setLoading = (on) => {
    submitBtn.disabled = on;
    submitBtn.innerHTML = on
      ? 'Envoi en cours...'
      : '<i class="fas fa-paper-plane mr-2"></i> Envoyer mon message';
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    alertBox?.classList.add('hidden');

    const payload = buildPayload(form);

    if (!payload.full_name || !payload.email || !payload.message) {
      showAlert('Merci de remplir les champs obligatoires.', 'error');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/public/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        showAlert(json.error || 'Erreur lors de l’envoi.', 'error');
        return;
      }

      if (json.mail_sent === false) {
        showAlert(
          'Message enregistré. Email non envoyé. Nous traiterons ta demande rapidement.',
          'info'
        );
        form.reset();
        return;
      }

      showAlert('Message envoyé. Réponse sous 24h.', 'success');
      form.reset();
    } catch (err) {
      console.error(err);
      showAlert('Erreur réseau. Réessaie plus tard.', 'error');
    } finally {
      setLoading(false);
    }
  });
}

/* =========================
 * Helpers
 * ========================= */
function buildPayload(form) {
  const fd = new FormData(form);
  const v = (k) => String(fd.get(k) || '').trim();

  return {
    full_name: `${v('first_name')} ${v('last_name')}`.trim(),
    email: v('email'),
    phone: v('phone'),
    subject: v('subject'),
    message: v('message'),
    source_page: v('source_page') || 'contact',
    website: v('website'),
  };
}
