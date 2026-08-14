(function () {
        // Configuration
        const API_ME = '/api/client/espace-client/me';
        const LOGIN_URL = '/auth/login.html';
        const PROFILE_URL = '/espace-client/profil.html';

        let cachedAuth = null;

        /**
         * Vérifie si l'utilisateur est authentifié
         * @returns {Promise<boolean>}
         */
        async function isAuthed() {
          // Retourner le cache si disponible
          if (cachedAuth !== null) return cachedAuth;

          try {
            const res = await fetch(API_ME, {
              method: 'GET',
              credentials: 'include',
              cache: 'no-store',
              headers: { 
                'Accept': 'application/json',
                'Cache-Control': 'no-cache'
              },
            });

            // Si 401, non authentifié
            if (res.status === 401) {
              cachedAuth = false;
              return false;
            }

            const json = await res.json().catch(() => null);
            
            // Vérifier la structure de la réponse
            const isAuthenticated = !!(res.ok && json && json.success === true);
            cachedAuth = isAuthenticated;
            
            return isAuthenticated;
          } catch (error) {
            console.error('Erreur vérification authentification:', error);
            cachedAuth = false;
            return false;
          }
        }

        /**
         * Gestionnaire de clic pour le bouton d'accès à l'espace
         */
        async function handleAccessEspaceClick(e) {
          e.preventDefault();
          
          const btn = e.currentTarget;
          const originalHtml = btn.innerHTML;
          
          // Afficher un indicateur de chargement
          btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-3"></i> Vérification...';
          btn.disabled = true;

          try {
            const authenticated = await isAuthed();
            
            if (authenticated) {
              // Utilisateur connecté → redirection vers le profil
              window.location.href = PROFILE_URL;
            } else {
              // Utilisateur non connecté → redirection vers login avec redirect vers profil
              const redirectUrl = `${LOGIN_URL}?redirect=${encodeURIComponent(PROFILE_URL)}`;
              window.location.href = redirectUrl;
            }
          } catch (error) {
            console.error('Erreur lors de la vérification:', error);
            // En cas d'erreur, rediriger vers login par sécurité
            window.location.href = `${LOGIN_URL}?redirect=${encodeURIComponent(PROFILE_URL)}`;
          } finally {
            // Restaurer le bouton (ne s'exécutera probablement pas à cause de la redirection)
            btn.innerHTML = originalHtml;
            btn.disabled = false;
          }
        }

        /**
         * Gestionnaire pour les boutons de service (déclaration, etc.)
         */
        async function handleServiceActionClick(e) {
          const btn = e.currentTarget;
          const target = btn.dataset.target || btn.getAttribute('href');
          if (!target) return;

          // Vérifier si l'utilisateur est authentifié
          const authenticated = await isAuthed();
          
          if (authenticated) {
            // Utilisateur connecté : laisser le lien normal
            return;
          }

          // Utilisateur non connecté : intercepter et rediriger vers login
          e.preventDefault();
          e.stopPropagation();

          try {
            // Sauvegarder la destination pour redirection post-login
            localStorage.setItem(
              'cc_post_login_redirect',
              JSON.stringify({
                url: target,
                savedAt: new Date().toISOString(),
              })
            );
          } catch (err) {
            console.error('Erreur sauvegarde redirect:', err);
          }

          // Rediriger vers login avec redirect
          window.location.href = `${LOGIN_URL}?redirect=${encodeURIComponent(target)}`;
        }

        /**
         * Initialisation de tous les écouteurs d'événements
         */
        function initEventListeners() {
          // Bouton principal "Accéder à mon espace"
          const accessBtn = document.getElementById('btnAccessEspace');
          if (accessBtn) {
            accessBtn.addEventListener('click', handleAccessEspaceClick);
          }

          // Boutons de service (déclaration, etc.)
          document.querySelectorAll('.service-action').forEach((btn) => {
            btn.addEventListener('click', handleServiceActionClick);
          });

          // Écouter l'événement d'authentification globale si disponible
          window.addEventListener('auth-change', (e) => {
            // Mettre à jour le cache quand l'état d'auth change
            if (e.detail && typeof e.detail.isAuthenticated !== 'undefined') {
              cachedAuth = e.detail.isAuthenticated;
            }
          });
        }

        /**
         * Initialise les animations reveal via IntersectionObserver.
         * Ajoute `.is-visible` aux éléments `.reveal` quand ils entrent
         * dans le viewport, déclenchant la transition CSS opacity/transform.
         */
        function initReveal() {
          const revealEls = document.querySelectorAll('.reveal');
          if (!revealEls.length) return;

          // Navigateur sans support IntersectionObserver → tout afficher d'un coup
          if (!('IntersectionObserver' in window)) {
            revealEls.forEach((el) => el.classList.add('is-visible'));
            return;
          }

          const observer = new IntersectionObserver(
            (entries) => {
              entries.forEach((entry) => {
                if (entry.isIntersecting) {
                  entry.target.classList.add('is-visible');
                  observer.unobserve(entry.target); // animation jouée une seule fois
                }
              });
            },
            {
              threshold: 0.1,
              rootMargin: '0px 0px -40px 0px'
            }
          );

          revealEls.forEach((el) => observer.observe(el));
        }

        /**
         * Initialisation au chargement du DOM
         */
        function init() {
          // Lancer les animations reveal
          initReveal();

          // Pré-charger l'état d'authentification
          isAuthed().catch(() => {});

          // Initialiser les écouteurs
          initEventListeners();
        }

        // Démarrer l'initialisation
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', init);
        } else {
          init();
        }
      })();