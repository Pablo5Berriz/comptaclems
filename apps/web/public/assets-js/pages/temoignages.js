// /public/assets-js/pages/temoignages.js
'use strict';

(function () {
  const API_BASE = '/api/public/testimonials';

  const els = {
    grid: document.getElementById('testimonialsList') || document.getElementById('testimonialsGrid'),
    pagination: document.getElementById('pagination'),
    prevBtn: document.getElementById('prevPage'),
    nextBtn: document.getElementById('nextPage'),
    pageInfo: document.getElementById('pageInfo'),

    openBtn: document.getElementById('openTestimonialForm'),
    formContainer: document.getElementById('testimonialFormContainer'),
    closeBtn: document.getElementById('closeTestimonialForm'),
    cancelBtn: document.getElementById('cancelTestimonialForm'),
    form: document.getElementById('testimonialForm'),

    ratingInput: document.getElementById('rating'),
    ratingValue: document.getElementById('ratingValue'),
    ratingStars: document.getElementById('ratingStars'),

    submitBtn: document.getElementById('submitTestimonialButton'),
    submitText: document.getElementById('submitText'),
    submitSpinner: document.getElementById('submitSpinner'),

    nameInput: document.getElementById('client_name'),
    emailInput: document.getElementById('email'),
    contentTextarea: document.getElementById('content'),
  };

  const isHome =
    window.location.pathname === '/' ||
    window.location.pathname === '/index.html';

  const state = {
    page: 1,
    pages: 1,
    limit: isHome ? 3 : 9,
    total: 0,
    compact: isHome,
  };

  function esc(s) {
    return String(s ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  async function fetchClientMe() {
    try {
      const res = await fetch('/api/client/espace-client/me', {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
      });

      if (!res.ok) return { authenticated: false, client: null };

      const json = await res.json().catch(() => null);
      const data = json?.data || null;

      if (!json?.success || !data) return { authenticated: false, client: null };

      return {
        authenticated: true,
        client: {
          first_name: data.firstName || '',
          last_name: data.lastName || '',
          email: data.email || '',
        },
      };
    } catch {
      return { authenticated: false, client: null };
    }
  }

  async function fetchTestimonials(page = 1, limit = 9) {
    const url = `${API_BASE}?page=${encodeURIComponent(page)}&limit=${encodeURIComponent(limit)}`;

    try {
      const res = await fetch(url, { cache: 'no-store' });
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        console.error('GET temoignages HTTP', res.status, json);
        return { testimonials: [], total: 0, page: 1, pages: 1, limit };
      }

      const testimonials = Array.isArray(json?.testimonials)
        ? json.testimonials
        : Array.isArray(json?.rows)
          ? json.rows
          : Array.isArray(json)
            ? json
            : [];

      return {
        testimonials,
        total: Number(json?.total ?? testimonials.length ?? 0),
        page: Number(json?.page ?? page),
        pages: Number(json?.pages ?? 1),
        limit: Number(json?.limit ?? limit),
      };
    } catch (e) {
      console.error('Erreur réseau GET temoignages', e);
      return { testimonials: [], total: 0, page: 1, pages: 1, limit };
    }
  }

  function renderStars(rating) {
    const max = 5;
    const r = Math.min(5, Math.max(1, Number(rating || 5)));
    let html = '';
    for (let i = 1; i <= max; i += 1) {
      const full = i <= r;
      html += `<i class="fas fa-star ${full ? 'text-yellow-400' : 'text-slate-300'} text-sm mr-1"></i>`;
    }
    return html;
  }

  function renderCard(t) {
    const clientNameRaw = String(t?.client_name || t?.display_name || 'Client anonyme');
    const clientName = esc(clientNameRaw);

    const initials = clientNameRaw
      .split(' ')
      .filter(Boolean)
      .map((p) => p[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

    const createdAt = t?.created_at || null;
    const date = createdAt
      ? new Date(createdAt).toLocaleDateString('fr-CA', { year: 'numeric', month: 'short', day: 'numeric' })
      : '';

    const contentRaw = String(t?.content || t?.short_quote || t?.full_text || '');
    const content = esc(contentRaw);

    return `
      <article class="bg-white rounded-2xl shadow-sm p-6 flex flex-col h-full hover:shadow-md transition-shadow duration-300">
        <div class="flex items-center mb-4">
          <div class="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mr-3">
            <span class="font-semibold text-primary">${esc(initials)}</span>
          </div>
          <div>
            <h3 class="font-semibold text-slate-900">${clientName}</h3>
            ${date ? `<p class="text-sm text-slate-500">${esc(date)}</p>` : ''}
          </div>
        </div>
        <div class="flex items-center mb-3">
          ${renderStars(t?.rating || 5)}
        </div>
        <p class="text-slate-700 mb-3 italic">"${content}"</p>
      </article>
    `;
  }

  function setPaginationUi() {
    if (!els.pagination || !els.prevBtn || !els.nextBtn || !els.pageInfo) return;

    if (state.compact) {
      els.pagination.classList.add('hidden');
      return;
    }

    const show = state.pages > 1;
    els.pagination.classList.toggle('hidden', !show);
    if (!show) return;

    els.pageInfo.textContent = `Page ${state.page} / ${state.pages}`;
    els.prevBtn.disabled = state.page <= 1;
    els.nextBtn.disabled = state.page >= state.pages;
  }

  async function loadTestimonials(page = 1) {
    if (!els.grid) return;

    els.grid.innerHTML = `
      <div class="col-span-full text-center py-12">
        <i class="fas fa-spinner fa-spin text-slate-300 text-3xl mb-4"></i>
        <p class="text-slate-500">Chargement…</p>
      </div>
    `;

    const data = await fetchTestimonials(page, state.limit);

    state.page = Math.max(1, Number(data.page || 1));
    state.pages = Math.max(1, Number(data.pages || 1));
    state.total = Math.max(0, Number(data.total || 0));
    state.limit = Math.max(1, Number(data.limit || state.limit));

    const list = data.testimonials || [];
    if (list.length) {
      els.grid.innerHTML = list.map(renderCard).join('');
    } else {
      els.grid.innerHTML = `
        <div class="col-span-full text-center py-12">
          <i class="fas fa-comments text-slate-300 text-4xl mb-4"></i>
          <p class="text-slate-500">Aucun témoignage pour le moment.</p>
        </div>
      `;
    }

    setPaginationUi();
  }

  function initPaginationEvents() {
    els.prevBtn?.addEventListener('click', () => {
      if (state.page <= 1) return;
      loadTestimonials(state.page - 1);
    });

    els.nextBtn?.addEventListener('click', () => {
      if (state.page >= state.pages) return;
      loadTestimonials(state.page + 1);
    });
  }

  function initRatingStars() {
    if (!els.ratingStars || !els.ratingInput) return;

    const update = () => {
      const value = parseInt(els.ratingInput.value, 10) || 5;
      if (els.ratingValue) els.ratingValue.textContent = `${value}/5`;

      const stars = els.ratingStars.children;
      for (let i = 0; i < stars.length; i += 1) {
        stars[i].className = i < value ? 'cursor-pointer text-yellow-400' : 'cursor-pointer text-slate-300';
      }
    };

    els.ratingStars.innerHTML = '';
    for (let i = 1; i <= 5; i += 1) {
      const star = document.createElement('div');
      star.className = `cursor-pointer ${i <= Number(els.ratingInput.value) ? 'text-yellow-400' : 'text-slate-300'}`;
      star.innerHTML = '<i class="fas fa-star text-xl"></i>';
      star.dataset.value = String(i);
      star.addEventListener('click', () => {
        els.ratingInput.value = String(i);
        update();
      });
      els.ratingStars.appendChild(star);
    }

    els.ratingInput.addEventListener('input', update);
    update();
  }

  function showForm() {
    if (!els.formContainer) return;
    els.formContainer.classList.remove('hidden');
    els.openBtn?.classList.add('hidden');
    els.formContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
    els.nameInput?.focus();
  }

  function hideForm() {
    if (!els.formContainer || !els.form) return;
    els.formContainer.classList.add('hidden');
    els.openBtn?.classList.remove('hidden');

    els.form.reset();
    if (els.ratingInput) els.ratingInput.value = '5';
    initRatingStars();
  }

  async function handleOpenClick() {
    const me = await fetchClientMe();

    if (!me.authenticated) {
      localStorage.setItem(
        'cc_post_login_redirect',
        JSON.stringify({
          url: window.location.pathname + window.location.search + window.location.hash,
          openTestimonialForm: true,
        })
      );
      window.location.href = '/auth/login.html';
      return;
    }

    if (els.nameInput && !els.nameInput.value.trim()) {
      els.nameInput.value = `${me.client.first_name} ${me.client.last_name}`.trim();
    }
    if (els.emailInput && !els.emailInput.value.trim() && me.client.email) {
      els.emailInput.value = me.client.email;
    }

    showForm();
  }

  async function submitTestimonial(e) {
    e.preventDefault();

    const me = await fetchClientMe();
    if (!me.authenticated) {
      await handleOpenClick();
      return;
    }

    const fd = new FormData(els.form);
    const payload = {
      client_name: String(fd.get('client_name') || '').trim(),
      email: String(fd.get('email') || '').trim() || null,
      rating: parseInt(String(fd.get('rating') || '5'), 10) || 5,
      content: String(fd.get('content') || '').trim(),
    };

    if (!payload.client_name || !payload.content) {
      alert('Veuillez remplir tous les champs obligatoires.');
      return;
    }
    if (payload.content.length < 50) {
      alert('Votre témoignage doit contenir au moins 50 caractères.');
      els.contentTextarea?.focus();
      return;
    }
    if (payload.rating < 1 || payload.rating > 5) {
      alert('La note doit être comprise entre 1 et 5.');
      return;
    }

    if (els.submitText) els.submitText.textContent = 'Envoi en cours...';
    els.submitSpinner?.classList.remove('hidden');
    if (els.submitBtn) els.submitBtn.disabled = true;

    try {
      const res = await fetch(API_BASE, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));

      if (res.ok && json?.success) {
        alert('Merci pour votre témoignage ! Il sera publié après modération.');
        
        setTimeout(() => {
          window.location.href = '/index.html';
        }, 1000); 
      } else {
        alert(json?.error || 'Une erreur est survenue. Réessaie.');
      }
    } catch (err) {
      console.error('POST temoignage error', err);
      alert('Erreur réseau. Vérifie ta connexion.');
    } finally {
      if (els.submitText) els.submitText.textContent = 'Envoyer mon témoignage';
      els.submitSpinner?.classList.add('hidden');
      if (els.submitBtn) els.submitBtn.disabled = false;
    }
  }

  function initForm() {
    if (state.compact) return;

    if (!els.formContainer || !els.form) return;

    els.openBtn?.addEventListener('click', handleOpenClick);
    els.closeBtn?.addEventListener('click', hideForm);
    els.cancelBtn?.addEventListener('click', hideForm);
    els.form.addEventListener('submit', submitTestimonial);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !els.formContainer.classList.contains('hidden')) hideForm();
    });

    initRatingStars();

    const redirectRaw = localStorage.getItem('cc_post_login_redirect');
    if (redirectRaw) {
      try {
        const info = JSON.parse(redirectRaw);
        if (info?.openTestimonialForm) handleOpenClick();
      } catch {}
      localStorage.removeItem('cc_post_login_redirect');
    }
  }

  async function boot() {
    initPaginationEvents();
    await loadTestimonials(1);
    initForm();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();