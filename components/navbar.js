/* ============================================================
   navbar.js — Shared Navbar Component
   Included on every page. Reads Firebase auth state and
   shows the correct links for the current user.
   ============================================================ */

(function () {
  // ── Inject Navbar HTML ──────────────────────────────────────
  function renderNavbar(user) {
    const isLanding = window.location.pathname === '/' ||
                      window.location.pathname.endsWith('index.html');

    const navLinks = isLanding
      ? `<a href="#features" class="nav__link">Features</a>`
      : '';

    const authSection = user
      ? `<div class="nav__user">
           <span class="nav__user-name">👤 ${user.displayName || user.email}</span>
           <button id="nav-logout-btn" class="btn btn--outline btn--sm">Sign Out</button>
         </div>`
      : `<div class="nav__auth">
           <a href="login.html"    class="btn btn--outline btn--sm">Sign In</a>
           <a href="register.html" class="btn btn--primary btn--sm">Get Started</a>
         </div>`;

    const html = `
      <nav class="navbar" role="navigation" aria-label="Main navigation">
        <div class="navbar__inner">
          <a href="index.html" class="navbar__brand" aria-label="Stokvel Home">
            <span class="navbar__logo">🌿</span>
            <span class="navbar__brand-name">Stokvel</span>
          </a>
          <div class="navbar__links">
            ${navLinks}
          </div>
          ${authSection}
          <button class="navbar__mobile-toggle" id="nav-toggle" aria-label="Toggle menu" aria-expanded="false">
            <span></span><span></span><span></span>
          </button>
        </div>
        <div class="navbar__mobile-menu" id="nav-mobile-menu" aria-hidden="true">
          ${navLinks}
          ${user
            ? `<span class="nav__user-name">${user.displayName || user.email}</span>
               <button id="nav-logout-mobile" class="btn btn--outline btn--sm">Sign Out</button>`
            : `<a href="login.html"    class="btn btn--outline btn--sm">Sign In</a>
               <a href="register.html" class="btn btn--primary btn--sm">Get Started</a>`
          }
        </div>
      </nav>
      <style>
        .navbar {
          position: sticky;
          top: 0;
          z-index: 500;
          background: rgba(246,251,247,0.92);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border-bottom: 1px solid var(--color-border);
        }
        .navbar__inner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          max-width: 1120px;
          margin: 0 auto;
          padding: 0 var(--space-6);
          height: 64px;
        }
        .navbar__brand {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          font-family: var(--font-display);
          font-size: 1.3rem;
          color: var(--color-primary);
          text-decoration: none;
        }
        .navbar__logo { font-size: 1.5rem; }
        .navbar__brand-name { font-weight: 700; }
        .navbar__links { display: flex; gap: var(--space-6); }
        .nav__link {
          font-size: 0.92rem;
          font-weight: 500;
          color: var(--color-text-secondary);
          text-decoration: none;
          transition: color var(--transition);
        }
        .nav__link:hover { color: var(--color-primary); }
        .nav__auth, .nav__user { display: flex; align-items: center; gap: var(--space-3); }
        .nav__user-name { font-size: 0.88rem; color: var(--color-text-secondary); }
        .navbar__mobile-toggle {
          display: none;
          flex-direction: column;
          gap: 5px;
          background: none;
          border: none;
          cursor: pointer;
          padding: var(--space-2);
        }
        .navbar__mobile-toggle span {
          display: block;
          width: 22px;
          height: 2px;
          background: var(--color-text-primary);
          border-radius: 2px;
          transition: all 0.2s;
        }
        .navbar__mobile-menu {
          display: none;
          flex-direction: column;
          gap: var(--space-3);
          padding: var(--space-4) var(--space-6);
          border-top: 1px solid var(--color-border);
          background: var(--color-surface);
        }
        .navbar__mobile-menu.is-open { display: flex; }
        @media (max-width: 640px) {
          .navbar__links, .nav__auth, .nav__user { display: none; }
          .navbar__mobile-toggle { display: flex; }
        }
      </style>
    `;

    const root = document.getElementById('navbar-root');
    if (root) root.innerHTML = html;

    // Logout handlers
    function handleLogout() {
      if (typeof firebase !== 'undefined' && firebase.auth) {
        firebase.auth().signOut().then(() => {
          window.location.href = 'login.html';
        }).catch(console.error);
      } else {
        window.location.href = 'login.html';
      }
    }

    const logoutBtn = document.getElementById('nav-logout-btn');
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

    const logoutMobile = document.getElementById('nav-logout-mobile');
    if (logoutMobile) logoutMobile.addEventListener('click', handleLogout);

    // Mobile toggle
    const toggle = document.getElementById('nav-toggle');
    const mobileMenu = document.getElementById('nav-mobile-menu');
    if (toggle && mobileMenu) {
      toggle.addEventListener('click', () => {
        const isOpen = mobileMenu.classList.toggle('is-open');
        toggle.setAttribute('aria-expanded', isOpen);
        mobileMenu.setAttribute('aria-hidden', !isOpen);
      });
    }
  }

  // ── Init: wait for Firebase auth state ───────────────────
  function init() {
    if (typeof firebase !== 'undefined' && firebase.auth) {
      firebase.auth().onAuthStateChanged(function (user) {
        renderNavbar(user);
      });
    } else {
      // Firebase not loaded — render logged-out state
      renderNavbar(null);
    }
  }

  // Run after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
