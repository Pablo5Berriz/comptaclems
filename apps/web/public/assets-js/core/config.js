'use strict';

/**
 * Configuration globale ComptaClems
 * Toutes les constantes partagées entre les modules JS.
 */
(function () {
  window.CC_CONFIG = {
    // Base de l'API backend (relative : fonctionne avec le proxy Express)
    API_BASE: '',

    // Endpoints d'authentification
    AUTH: {
      LOGIN:    '/api/auth/login',
      LOGOUT:   '/api/auth/logout',
      REGISTER: '/api/auth/register',
      ME:       '/api/auth/me',
    },

    // Endpoints espace client
    CLIENT: {
      ME:                '/api/client/espace-client/me',
      DECLARATIONS:      '/api/client/espace-client/declarations',
      DOCUMENTS:         '/api/client/espace-client/documents',
      DOCUMENTS_STATS:   '/api/client/espace-client/documents/stats',
      DOCUMENTS_COUNT:   '/api/client/espace-client/documents/count',
      GOV_DOCS:          '/api/client/espace-client/gouvernemental-documents',
      GOV_DOCS_STATS:    '/api/client/espace-client/gouvernemental-documents/stats',
      ACTIVITY:          '/api/client/espace-client/activity/recent',
      PREFERENCES:       '/api/client/espace-client/preferences',
      PASSWORD:          '/api/client/espace-client/password',
      SESSION:           '/api/client/espace-client/session',
      FORGOT_PASSWORD:   '/api/client/forgot-password',
      RESET_PASSWORD:    '/api/client/reset-password',
    },

    // Endpoints publics
    PUBLIC: {
      BANNER:       '/api/public/banner',
      TESTIMONIALS: '/api/public/testimonials',
      INTEREST:     '/api/interest/register',
    },

    // Clés de stockage local
    STORAGE: {
      THEME:  'cc_theme',
      MOTION: 'cc_reduce_motion',
      NOISE:  'cc_reduce_noise',
    },

    // Routes HTML
    ROUTES: {
      HOME:           '/index.html',
      LOGIN:          '/auth/login.html',
      REGISTER:       '/auth/register.html',
      FORGOT:         '/auth/forgot-password.html',
      RESET:          '/auth/reset-password.html',
      PROFIL:         '/espace-client/profil.html',
      DECLARATION:    '/espace-client/declaration.html',
      DOCUMENTS:      '/espace-client/documents.html',
      GOV_DOCS:       '/espace-client/document-gouvernemental.html',
      SUIVI:          '/espace-client/suivi-declaration.html',
      PARAMETRES:     '/espace-client/parametres.html',
      MERCI:          '/espace-client/merci.html',
      ADMIN_LOGIN:    '/admin/adminLogin.html',
    },
  };
})();
