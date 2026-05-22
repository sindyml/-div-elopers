/* ============================================================
   navbar.js — Shared Navbar Component
   
   Renders immediately in logged-out state so the navbar
   always appears even if Firebase is slow or fails.
   Then updates quietly if Firebase confirms a logged-in user.
   ============================================================ */

(function () {

  function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, m => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[m]));
  }

  // ── Build the navbar HTML ─────────────────────────────────
  function buildNavbar(user) {
    const path = window.location.pathname;
    const isLanding = path === '/' || path.endsWith('/index.html') || path.endsWith('/index') || path === '';

    const backButtonHTML = !isLanding
      ? `<button type="button" class="nav__back-btn" id="nav-back-btn" aria-label="Go back">
           <span aria-hidden="true">←</span> Back
         </button>`
      : '';

    let authHTML = '';
    if (user) {
      const displayName = escapeHTML(user.displayName || user.email);
      authHTML = `
        <div class="nav__user">
          <span class="nav__user-name">👤 ${displayName}</span>
          <button id="nav-logout-btn" class="btn btn--outline btn--sm">Sign Out</button>
        </div>`;
    } else if (isLanding) {
      authHTML = `
        <nav class="nav__auth" aria-label="Account actions">
          <a href="login.html"    class="btn btn--outline btn--sm">Sign In</a>
          <a href="register.html" class="btn btn--primary btn--sm">Get Started</a>
        </nav>`;
    }

    const mobileMenuContent = `
      ${!isLanding ? `<button type="button" class="nav__link nav__back-btn--mobile" id="nav-back-mobile">← Back</button>` : ''}
      ${isLanding
        ? `<a href="#features"    class="nav__link">Features</a>
           <a href="#how-it-works" class="nav__link">How It Works</a>
           <a href="#cta"         class="nav__link">Get Started</a>`
        : ''}
      ${user
        ? `<span class="nav__user-name">👤 ${escapeHTML(user.displayName || user.email)}</span>
           <button id="nav-logout-mobile" class="btn btn--outline btn--sm">Sign Out</button>`
        : (isLanding ? `<a href="login.html"    class="btn btn--outline btn--sm">Sign In</a>
           <a href="register.html" class="btn btn--primary btn--sm">Get Started</a>` : '')
      }
    `;

    return `
      <nav class="navbar" role="navigation" aria-label="Main navigation">
        <div class="navbar__inner">

          ${backButtonHTML}

          <a href="index.html" class="navbar__brand" aria-label="StokPal home">
            <span aria-hidden="true">🌿</span>
            <span class="navbar__brand-name">StokPal</span>
          </a>

          ${isLanding
            ? `<ul class="navbar__links" role="list">
                 <li><a href="#features"   class="nav__link">Features</a></li>
                 <li><a href="#how-it-works" class="nav__link">How It Works</a></li>
                 <li><a href="#cta"        class="nav__link">Get Started</a></li>
               </ul>`
            : ''}

          ${authHTML}

          <button class="navbar__mobile-toggle"
                  id="nav-toggle"
                  aria-label="Toggle menu"
                  aria-expanded="false"
                  aria-controls="nav-mobile-menu">
            <span aria-hidden="true"></span>
            <span aria-hidden="true"></span>
            <span aria-hidden="true"></span>
          </button>

        </div>

        <div class="navbar__mobile-menu" id="nav-mobile-menu" aria-hidden="true">
          ${mobileMenuContent}
        </div>
      </nav>`;
  }

  // ── Inject into DOM ───────────────────────────────────────
  function injectNavbar(user) {
    const root = document.getElementById('navbar-root');
    if (!root) return;
    root.innerHTML = buildNavbar(user);
    wireEvents();
  }

  // ── Logout + mobile toggle ────────────────────────────────
  function wireEvents() {
    function handleLogout() {
      if (typeof firebase !== 'undefined' && firebase.auth) {
        firebase.auth().signOut()
          .then(() => { window.location.href = 'login.html'; })
          .catch(() => { window.location.href = 'login.html'; });
      } else {
        window.location.href = 'login.html';
      }
    }

    const logoutBtn    = document.getElementById('nav-logout-btn');
    const logoutMobile = document.getElementById('nav-logout-mobile');
    if (logoutBtn)    logoutBtn.addEventListener('click', handleLogout);
    if (logoutMobile) logoutMobile.addEventListener('click', handleLogout);

    const backBtn = document.getElementById('nav-back-btn');
    const backMobile = document.getElementById('nav-back-mobile');
    if (backBtn) backBtn.addEventListener('click', () => window.history.back());
    if (backMobile) backMobile.addEventListener('click', () => window.history.back());

    const toggle     = document.getElementById('nav-toggle');
    const mobileMenu = document.getElementById('nav-mobile-menu');
    if (toggle && mobileMenu) {
      toggle.addEventListener('click', () => {
        const isOpen = mobileMenu.classList.toggle('is-open');
        toggle.setAttribute('aria-expanded', String(isOpen));
        mobileMenu.setAttribute('aria-hidden', String(!isOpen));
      });
    }
  }

  // ── Styles ───────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('navbar-styles')) return;
    const style = document.createElement('style');
    style.id = 'navbar-styles';
    style.textContent = `
      .navbar {
        position: sticky;
        top: 0;
        z-index: 500;
        background: rgba(246,251,247,0.95);
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
        gap: var(--space-4);
      }
      .navbar__brand {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        font-size: 1.3rem;
        color: var(--color-primary);
        text-decoration: none;
        flex-shrink: 0;
        margin-right: auto;
      }
      .nav__back-btn {
        background: none;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        padding: 0.35rem 0.75rem;
        font-size: 0.85rem;
        font-weight: 500;
        color: var(--color-text-secondary);
        cursor: pointer;
        transition: all var(--transition);
        display: flex;
        align-items: center;
        gap: var(--space-2);
      }
      .nav__back-btn:hover {
        background: var(--color-surface-2);
        color: var(--color-primary);
        border-color: var(--color-primary);
      }
      .navbar__brand-name {
        font-family: var(--font-display);
        font-weight: 700;
        font-size: 1.25rem;
      }
      .navbar__links {
        display: flex;
        gap: var(--space-4);
        list-style: none;
        padding: 0;
        margin: 0;
      }
      .nav__link {
        font-size: 0.88rem;
        font-weight: 500;
        color: var(--color-text-secondary);
        text-decoration: none;
        transition: color var(--transition);
        white-space: nowrap;
      }
      .nav__link:hover { color: var(--color-primary); }
      .nav__auth, .nav__user {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        flex-shrink: 0;
      }
      .nav__user-name {
        font-size: 0.88rem;
        color: var(--color-text-secondary);
      }
      .navbar__mobile-toggle {
        display: none;
        flex-direction: column;
        gap: 5px;
        background: none;
        border: none;
        cursor: pointer;
        padding: var(--space-2);
        flex-shrink: 0;
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
      .nav__back-btn--mobile {
        text-align: left;
        background: none;
        border: none;
        padding: 0;
        font-weight: 600;
        color: var(--color-primary) !important;
        cursor: pointer;
      }
      @media (max-width: 768px) {
        .navbar__links, .nav__auth, .nav__user { display: none; }
        .navbar__mobile-toggle { display: flex; }
        .nav__back-btn { display: none; }
      }
    `;
    document.head.appendChild(style);
  }

  // ── Init ─────────────────────────────────────────────────
  function init() {
    injectStyles();

    // 1. Render immediately in logged-out state — navbar always visible
    injectNavbar(null);

    // 2. If Firebase is available, update quietly once auth resolves
    const fb = window.firebase || (typeof firebase !== 'undefined' ? firebase : null);
    if (fb && fb.auth) {
      fb.auth().onAuthStateChanged(function (user) {
        injectNavbar(user);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
