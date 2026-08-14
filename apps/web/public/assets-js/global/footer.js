'use strict';

document.write(`
  <footer class="cc-footer">
    <div class="cc-footer__inner">

      <div class="cc-footer__grid">

        <!-- Brand -->
        <div class="cc-footer__brand">
          <a href="/index.html" class="cc-footer__logo" aria-label="ComptaClems">
            <img src="/assets/logo/Comptaclems.png" alt="ComptaClems" loading="lazy" />
          </a>
          <p class="cc-footer__tagline">
            Service professionnel de déclaration d'impôts et de comptabilité
            pour particuliers, travailleurs autonomes et petites entreprises au Québec.
          </p>
          <div class="cc-footer__socials">
            <a href="#" class="cc-footer__social" aria-label="Facebook">
              <i class="fab fa-facebook-f" aria-hidden="true"></i>
            </a>
            <a href="#" class="cc-footer__social" aria-label="LinkedIn">
              <i class="fab fa-linkedin-in" aria-hidden="true"></i>
            </a>
            <a href="mailto:comptaclems@gmail.com" class="cc-footer__social" aria-label="Courriel">
              <i class="fas fa-envelope" aria-hidden="true"></i>
            </a>
          </div>
        </div>

        <!-- Services -->
        <div class="cc-footer__col">
          <h4 class="cc-footer__col-title">Services</h4>
          <ul class="cc-footer__links">
            <li>
              <a href="/espace-client/declaration.html" class="cc-footer__link requires-auth">
                Déclaration pour particuliers
              </a>
            </li>
            <li>
              <a href="/espace-client/autonome.html" class="cc-footer__link requires-auth">
                Travailleurs autonomes
              </a>
            </li>
            <li>
              <a href="/espace-client/pme.html" class="cc-footer__link requires-auth">
                Comptabilité PME
              </a>
            </li>
            <li>
              <a href="/services/index.html" class="cc-footer__link">
                Planification fiscale
              </a>
            </li>
          </ul>
        </div>

        <!-- Liens utiles -->
        <div class="cc-footer__col">
          <h4 class="cc-footer__col-title">Liens utiles</h4>
          <ul class="cc-footer__links">
            <li>
              <a href="https://www.revenuquebec.ca/fr/" class="cc-footer__link" target="_blank" rel="noopener noreferrer">
                Revenu Québec
                <i class="fas fa-external-link-alt cc-footer__link-ext" aria-hidden="true"></i>
              </a>
            </li>
            <li>
              <a href="https://www.canada.ca/fr/agence-revenu.html" class="cc-footer__link" target="_blank" rel="noopener noreferrer">
                Agence du revenu du Canada
                <i class="fas fa-external-link-alt cc-footer__link-ext" aria-hidden="true"></i>
              </a>
            </li>
            <li>
              <a href="/legal/politique-confidentialite.html" class="cc-footer__link">
                Politique de confidentialité
              </a>
            </li>
            <li>
              <a href="/legal/mentions-legales.html" class="cc-footer__link">
                Mentions légales
              </a>
            </li>
          </ul>
        </div>

        <!-- Contact -->
        <div class="cc-footer__col">
          <h4 class="cc-footer__col-title">Contact</h4>
          <ul class="cc-footer__contact">
            <li>
              <i class="fas fa-map-marker-alt" aria-hidden="true"></i>
              <span>164 Rue Principale, Saint-Louis de Gonzague, QC J0S 1T0</span>
            </li>
            <li>
              <i class="fas fa-phone-alt" aria-hidden="true"></i>
              <a href="tel:+15062521410" class="cc-footer__link">506-252-1410</a>
            </li>
            <li>
              <i class="fas fa-envelope" aria-hidden="true"></i>
              <a href="mailto:comptaclems@gmail.com" class="cc-footer__link">comptaclems@gmail.com</a>
            </li>
            <li>
              <i class="fas fa-clock" aria-hidden="true"></i>
              <span>Lun–Ven : 9h – 17h</span>
            </li>
          </ul>
        </div>

      </div>

      <!-- Bottom bar -->
      <div class="cc-footer__bottom">
        <p class="cc-footer__copy">
          &copy; <span id="cc-footer-year"></span> ComptaClems. Tous droits réservés.
        </p>
        <p class="cc-footer__copy">
          Conçu et développé par <a href="https://www.solutionsinformatiques.com/" class="cc-footer__link" target="_blank" rel="noopener noreferrer">Solutions informatiques</a>.
        </p>
        <div class="cc-footer__status">
          <span class="cc-footer__status-dot"></span>
          Service en ligne 24h/24
        </div>
      </div>

    </div>
  </footer>

  <style>
    .cc-footer {
      background: linear-gradient(180deg, #071526 0%, #040D18 100%);
      color: rgba(255,255,255,0.65);
      font-family: var(--font-body, 'DM Sans', sans-serif);
    }

    .cc-footer__inner {
      width: 100%;
      padding: 0 clamp(1.25rem, 2.5vw, 2.5rem);
    }

    /* GRID PREMIUM */
    .cc-footer__grid {
      display: grid;
      grid-template-columns: 1.3fr repeat(3, 1fr);
      column-gap: clamp(2rem, 4vw, 3rem);
      row-gap: 2.75rem;

      padding-top: clamp(4rem, 8vw, 6rem);
      padding-bottom: clamp(3.5rem, 6vw, 5rem);

      border-bottom: 1px solid rgba(255,255,255,0.07);
      align-items: start;
    }

    .cc-footer__col {
      display: flex;
      flex-direction: column;
    }

    /* BRAND */
    .cc-footer__brand {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
      max-width: 300px;
    }

    .cc-footer__logo img {
      height: 50px;
      opacity: 0.85;
      transition: opacity 0.2s;
    }

    .cc-footer__logo:hover img {
      opacity: 1;
    }

    .cc-footer__tagline {
      font-size: 0.9375rem;
      line-height: 1.6;
      color: rgba(255,255,255,0.5);
    }

    .cc-footer__socials {
      display: flex;
      gap: 0.5rem;
    }

    .cc-footer__social {
      width: 34px;
      height: 34px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.09);
      color: rgba(255,255,255,0.55);
      font-size: 0.8rem;
      transition: all 0.15s ease;
    }

    .cc-footer__social:hover {
      background: rgba(212,175,55,0.15);
      border-color: rgba(212,175,55,0.3);
      color: #D4AF37;
      transform: translateY(-2px);
    }

    /* TITRES ALIGNÉS */
    .cc-footer__col-title {
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: rgba(255,255,255,0.4);

      margin-bottom: 1.25rem;
      height: 14px;
      display: flex;
      align-items: center;
    }

    /* LISTES */
    .cc-footer__links,
    .cc-footer__contact {
      display: flex;
      flex-direction: column;
      gap: 0.85rem;
      list-style: none;
      padding: 0;
      margin: 0;
    }

    .cc-footer__link {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.9375rem;
      color: rgba(255,255,255,0.62);
      text-decoration: none;
      line-height: 1.35;
      transition: color 0.15s ease;
    }

    .cc-footer__link:hover {
      color: rgba(255,255,255,0.9);
    }

    .cc-footer__link-ext {
      font-size: 0.65rem;
      opacity: 0.5;
    }

    /* CONTACT ALIGNÉ */
    .cc-footer__contact li {
      display: grid;
      grid-template-columns: 18px 1fr;
      gap: 0.6rem;
      align-items: start;
      font-size: 0.9375rem;
      color: rgba(255,255,255,0.62);
    }

    .cc-footer__contact i {
      color: #D4AF37;
      font-size: 0.875rem;
      margin-top: 0.2rem;
      text-align: center;
    }

    /* BOTTOM */
    .cc-footer__bottom {
      display: flex;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 1rem;
      padding: 1.25rem 0;
    }

    .cc-footer__copy {
      font-size: 0.875rem;
      color: rgba(255,255,255,0.35);
      margin: 0;
    }

    .cc-footer__status {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.875rem;
      color: rgba(255,255,255,0.35);
    }

    .cc-footer__status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #10B981;
      animation: cc-pulse 2s infinite;
    }

    @keyframes cc-pulse {
      0%,100% { box-shadow: 0 0 0 0 rgba(16,185,129,0.35); }
      50% { box-shadow: 0 0 0 5px rgba(16,185,129,0); }
    }

    /* TABLETTE */
    @media (max-width: 1024px) {
      .cc-footer__grid {
        grid-template-columns: repeat(2, 1fr);
        column-gap: 2rem;
      }

      .cc-footer__brand {
        grid-column: 1 / -1;
        max-width: 480px;
      }
    }

    /* MOBILE */
    @media (max-width: 640px) {
      .cc-footer__grid {
        grid-template-columns: 1fr;
        row-gap: 2rem;
      }

      .cc-footer__bottom {
        flex-direction: column;
        align-items: flex-start;
      }
    }
  </style>
`);

/* Année dynamique */
(function () {
  function setYear() {
    var el = document.getElementById('cc-footer-year');
    if (el) el.textContent = new Date().getFullYear();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setYear);
  } else {
    setYear();
  }
})();