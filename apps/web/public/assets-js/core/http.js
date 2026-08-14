'use strict';

(function () {
  const DEFAULT_TIMEOUT_MS = 15000;

  function isObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  function buildUrl(url, params) {
    if (!params || !isObject(params) || Object.keys(params).length === 0) return url;
    const u = new URL(url, window.location.origin);
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      u.searchParams.set(k, String(v));
    }
    return u.pathname + u.search;
  }

  async function parseJsonSafe(res) {
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (!ct.includes('application/json')) return null;
    try {
      return await res.json();
    } catch {
      return null;
    }
  }

  function normalizeErrorMessage(res, data) {
    if (data && typeof data.error === 'string' && data.error.trim()) return data.error.trim();
    if (data && typeof data.message === 'string' && data.message.trim()) return data.message.trim();
    if (res.status === 401) return 'Non autorisé';
    if (res.status === 403) return 'Accès interdit';
    if (res.status === 404) return 'Ressource introuvable';
    if (res.status === 429) return 'Trop de requêtes';
    if (res.status >= 500) return 'Erreur serveur';
    return 'Erreur';
  }

  async function request(method, url, { params, body, headers, timeoutMs } = {}) {
    const finalUrl = buildUrl(url, params);
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), Number(timeoutMs || DEFAULT_TIMEOUT_MS));

    const h = Object.assign({ Accept: 'application/json' }, headers || {});
    const opts = {
      method,
      credentials: 'include',
      cache: 'no-store',
      headers: h,
      signal: controller.signal,
    };

    if (body !== undefined) {
      if (body instanceof FormData) {
        opts.body = body;
      } else {
        h['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
      }
    }

    try {
      const res = await fetch(finalUrl, opts);
      const data = await parseJsonSafe(res);

      if (!res.ok) {
        const msg = normalizeErrorMessage(res, data);
        const err = new Error(msg);
        err.status = res.status;
        err.data = data;
        throw err;
      }

      return data;
    } catch (e) {
      if (e && e.name === 'AbortError') {
        const err = new Error('Délai dépassé');
        err.status = 0;
        throw err;
      }
      throw e;
    } finally {
      clearTimeout(t);
    }
  }

  window.http = {
    request,
    get(url, params, options) {
      return request('GET', url, Object.assign({}, options || {}, { params }));
    },
    post(url, body, options) {
      return request('POST', url, Object.assign({}, options || {}, { body }));
    },
    put(url, body, options) {
      return request('PUT', url, Object.assign({}, options || {}, { body }));
    },
    patch(url, body, options) {
      return request('PATCH', url, Object.assign({}, options || {}, { body }));
    },
    del(url, body, options) {
      return request('DELETE', url, Object.assign({}, options || {}, { body }));
    },
  };
})();
