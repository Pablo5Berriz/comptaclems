/**
 * clientAuthGuard.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Guard d'authentification côté client.
 * À charger SANS defer/async dans le <head> de chaque page protégée.
 *
 * Comportement :
 *  1. Cache immédiatement le contenu de la page (visibility:hidden) pour éviter
 *     tout flash de contenu non autorisé.
 *  2. Vérifie la session via /api/client/espace-client/me (cookie HTTP-only).
 *  3. Si authentifié → affiche la page normalement.
 *  4. Si non authentifié → redirige vers /auth/login.html?redirect=<url_actuelle>
 *     pour revenir automatiquement ici après connexion réussie.
 * ─────────────────────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  var API_ME     = '/api/client/espace-client/me';
  var LOGIN_URL  = '/auth/login.html';
  var TIMEOUT_MS = 8000; // délai max avant de considérer la session expirée

  // ── 1. Cacher la page immédiatement pour éviter le flash ──────────────────
  document.documentElement.style.visibility = 'hidden';

  // ── 2. Helpers ────────────────────────────────────────────────────────────

  function showPage() {
    document.documentElement.style.visibility = '';
  }

  function redirectToLogin() {
    var current = window.location.pathname + window.location.search;
    var url = LOGIN_URL + '?redirect=' + encodeURIComponent(current);
    window.location.replace(url);
  }

  // ── 3. Vérification de session avec timeout ───────────────────────────────

  var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  var timeoutId  = null;

  if (controller) {
    timeoutId = setTimeout(function () {
      controller.abort();
    }, TIMEOUT_MS);
  }

  fetch(API_ME, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
    headers: { 'Accept': 'application/json' },
    signal: controller ? controller.signal : undefined
  })
  .then(function (res) {
    if (timeoutId) clearTimeout(timeoutId);

    // 401 = session absente ou expirée
    if (res.status === 401 || res.status === 403) {
      redirectToLogin();
      return null;
    }

    return res.json().catch(function () { return null; });
  })
  .then(function (data) {
    if (data === null) return; // déjà redirigé ou erreur JSON

    // Vérifier la structure de la réponse
    if (!data || data.success !== true || !data.data) {
      redirectToLogin();
      return;
    }

    // ✅ Authentifié — afficher la page
    showPage();
  })
  .catch(function (err) {
    if (timeoutId) clearTimeout(timeoutId);

    // En cas d'erreur réseau ou timeout, ne pas bloquer l'utilisateur
    // mais rester prudent : rediriger vers login
    if (err && err.name === 'AbortError') {
      console.warn('[AuthGuard] Timeout de vérification de session.');
    } else {
      console.warn('[AuthGuard] Erreur réseau :', err);
    }

    redirectToLogin();
  });

})();
