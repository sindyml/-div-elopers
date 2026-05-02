/* ============================================================
   footer.js — Shared Footer Component
   Included on every page via <footer id="footer-root"></footer>
   ============================================================ */

(function () {
  function renderFooter() {
    const year = new Date().getFullYear();

    const html = `
        <div class="footer__inner">
          <div class="footer__brand">
            <span class="footer__logo">🌿</span>
            <span class="footer__brand-name">Stokvel</span>
            <p class="footer__tagline">Save together. Grow together.</p>
          </div>
          <div class="footer__links">
            <div class="footer__col">
              <h4>Platform</h4>
              <a href="index.html">Home</a>
              <a href="login.html">Sign In</a>
              <a href="register.html">Register</a>
            </div>
            <div class="footer__col">
              <h4>Built With</h4>
              <span>Firebase Auth</span>
              <span>Cloud Firestore</span>
              <span>Azure Static Web Apps</span>
              <span>GitHub Actions</span>
            </div>
          </div>
        </div>
        <div class="footer__bottom">
          <p>© ${year} Stokvel Management Platform — Software Design 2026</p>
        </div>
      <style>
        .footer {
          background: var(--color-text-primary);
          color: rgba(255,255,255,0.75);
          margin-top: auto;
        }
        .footer__inner {
          display: flex;
          justify-content: space-between;
          gap: var(--space-12);
          max-width: 1120px;
          margin: 0 auto;
          padding: var(--space-12) var(--space-6);
          flex-wrap: wrap;
        }
        .footer__brand {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }
        .footer__logo { font-size: 1.6rem; }
        .footer__brand-name {
          font-family: var(--font-display);
          font-size: 1.4rem;
          color: white;
        }
        .footer__tagline {
          font-size: 0.85rem;
          color: rgba(255,255,255,0.5);
          font-style: italic;
        }
        .footer__links {
          display: flex;
          gap: var(--space-12);
          flex-wrap: wrap;
        }
        .footer__col {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
          min-width: 120px;
        }
        .footer__col h4 {
          font-family: var(--font-body);
          font-size: 0.75rem;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.4);
          margin-bottom: var(--space-1);
        }
        .footer__col a, .footer__col span {
          font-size: 0.88rem;
          color: rgba(255,255,255,0.65);
          text-decoration: none;
          transition: color 0.2s;
          display: block;
        }
        .footer__col a:hover { color: white; }
        .footer__bottom {
          border-top: 1px solid rgba(255,255,255,0.1);
          text-align: center;
          padding: var(--space-4) var(--space-6);
          font-size: 0.8rem;
          color: rgba(255,255,255,0.35);
        }
        @media (max-width: 640px) {
          .footer__inner { flex-direction: column; gap: var(--space-8); }
          .footer__links { gap: var(--space-8); }
        }
      </style>
    `;

    const root = document.getElementById('footer-root');
    if (root) {
      root.classList.add('footer');
      root.innerHTML = html;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderFooter);
  } else {
    renderFooter();
  }
})();
