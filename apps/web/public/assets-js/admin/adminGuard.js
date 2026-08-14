// apps/web/public/assets-js/admin/adminGuard.js
(function () {
  const key = 'cc_admin_auth';
  const raw = localStorage.getItem(key);

  function redirectToLogin() {
    const redirect = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/admin/adminLogin.html?redirect=${redirect}`;
  }

  if (!raw) {
    redirectToLogin();
    return;
  }

  let token = null;

  try {
    const parsed = JSON.parse(raw);
    token = parsed?.token || null;
  } catch {
    localStorage.removeItem(key);
    redirectToLogin();
    return;
  }

  if (!token) {
    localStorage.removeItem(key);
    redirectToLogin();
    return;
  }

  // VÃ©rifie token via API
  fetch('/api/admin/dashboard/me', {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then((r) => {
      if (!r.ok) throw new Error('unauthorized');
      return r.json().catch(() => ({}));
    })
    .catch(() => {
      localStorage.removeItem(key);
      redirectToLogin();
    });
})();
