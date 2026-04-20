/* ============================================================
   dashboard.js — Dashboard Page Controller
   
   Responsibilities (P6):
   - Auth guard: redirect to login if not signed in
   - Load user display name and group info from Firestore
   - Render the SA Data savings projection widget
   - Wire up the refresh button
   
   Other teams wire in their own sections:
   - P3 → #members-container, #group-name-badge
   - P4 → #contributions-container, #payout-container, stat cards
   - P5 → #meetings-container, #notification-root
   ============================================================ */

(function () {

  // ── Firestore reference (compat SDK) ─────────────────────
  const db = typeof firebase !== 'undefined' && firebase.firestore
    ? firebase.firestore()
    : null;

  // ── SA Data config (updated each sprint) ─────────────────
  // Current as of Sprint 1 (April 2026)
  // Source: SARB MPC decision March 26 2026 — rate held at 6.75% repo
  const SA_STATIC = {
    primeRate:     10.25,   // Prime = repo (6.75%) + 3.5%
    inflationRate:  4.0,    // SARB Q2 2026 forecast
    repoRate:       6.75,
    lastUpdated:   'March 2026',
  };

  // ── Frankfurter API — no key, no CORS issues ─────────────
  // Returns ZAR per 1 USD
  const FRANKFURTER_URL = 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=ZAR';
  const AZURE_FALLBACK  = '/api/getSAData';
  const CACHE_KEY        = 'stokpal_usd_zar';
  const CACHE_DURATION   = 4 * 60 * 60 * 1000; // 4 hours

  // ── Helpers ───────────────────────────────────────────────

  function fmt(num, decimals = 2) {
    return 'R ' + Number(num).toLocaleString('en-ZA', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  function readCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const { value, timestamp } = JSON.parse(raw);
      if (Date.now() - timestamp < CACHE_DURATION) return { value, fromCache: true };
    } catch { /* ignore */ }
    return null;
  }

  function writeCache(value) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ value, timestamp: Date.now() }));
    } catch { /* ignore */ }
  }

  // ── Fetch live USD/ZAR from Frankfurter ──────────────────
  async function fetchUSDZAR() {
    const cached = readCache();
    if (cached) return { zarPerUsd: cached.value, fromCache: true, live: false };

    // 1. Try Frankfurter API directly
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res  = await fetch(FRANKFURTER_URL, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // Frankfurter v1 response: { amount:1, base:"USD", date:"...", rates:{ ZAR:18.xx } }
      const zarPerUsd = data.rates?.ZAR ?? 18.5;
      writeCache(zarPerUsd);
      return { zarPerUsd, fromCache: false, live: true };
    } catch (err) {
      console.warn('[SA Data] Frankfurter API failed:', err.message);
    }

    // 2. Fallback: Azure Function proxy (avoids CORS)
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(AZURE_FALLBACK, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`Proxy HTTP ${res.status}`);
      const data = await res.json();
      const zarPerUsd = data.usdZar ?? data.rates?.ZAR ?? 18.5;
      writeCache(zarPerUsd);
      return { zarPerUsd, fromCache: false, live: true };
    } catch (err) {
      console.warn('[SA Data] Azure proxy failed:', err.message);
    }

    // 3. Static fallback
    return { zarPerUsd: 18.50, fromCache: false, live: false };
  }

  // ── Render the SA Widget ──────────────────────────────────
  async function renderSAWidget(groupBalance = 0, forceRefresh = false) {
    const container = document.getElementById('sa-widget-container');
    if (!container) return;

    if (forceRefresh) {
      try { localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
    }

    // Show skeleton while loading
    container.innerHTML = `
      <div class="sa-widget-skeleton">
        <div class="skeleton-block skeleton-block--wide"></div>
        <div class="skeleton-row">
          <div class="skeleton-block skeleton-block--stat"></div>
          <div class="skeleton-block skeleton-block--stat"></div>
          <div class="skeleton-block skeleton-block--stat"></div>
        </div>
        <div class="skeleton-block skeleton-block--wide skeleton-block--short"></div>
      </div>`;

    const start = Date.now();
    const { zarPerUsd, fromCache, live } = await fetchUSDZAR();
    const elapsed = Date.now() - start;

    // Savings projection
    const monthlyInterest = groupBalance * (SA_STATIC.primeRate / 100) / 12;
    const annualGrowth    = groupBalance * (SA_STATIC.primeRate / 100);
    const projectedYear   = groupBalance + annualGrowth;

    // Source label
    let sourceLabel;
    if (live)           sourceLabel = `Live · Frankfurter API · ${elapsed}ms`;
    else if (fromCache) sourceLabel = `Cached · Frankfurter API`;
    else                sourceLabel = `⚠️ Offline — showing last known values`;

    const isFallback = !live && !fromCache;

    container.innerHTML = `
      <div class="sa-widget">
        ${isFallback ? `<div class="sa-widget--fallback">⚠️ Could not reach exchange rate API — showing static values. Check your internet connection.</div>` : ''}
        
        <div class="sa-widget__stats">
          <div class="sa-widget__stat">
            <div class="sa-widget__stat-value">${SA_STATIC.primeRate}%</div>
            <div class="sa-widget__stat-label">Prime Rate</div>
          </div>
          <div class="sa-widget__stat">
            <div class="sa-widget__stat-value">${SA_STATIC.inflationRate}%</div>
            <div class="sa-widget__stat-label">CPI Inflation</div>
          </div>
          <div class="sa-widget__stat">
            <div class="sa-widget__stat-value">R${zarPerUsd.toFixed(2)}</div>
            <div class="sa-widget__stat-label">USD / ZAR</div>
          </div>
        </div>

        <div class="sa-widget__divider"></div>

        ${groupBalance > 0 ? `
        <div class="sa-widget__projection">
          <p class="sa-widget__proj-title">💡 Savings Projection — ${SA_STATIC.primeRate}% Prime Rate</p>
          <div class="sa-widget__proj-grid">
            <div class="sa-widget__proj-item">
              <span class="sa-widget__proj-label">Monthly interest earned</span>
              <span class="sa-widget__proj-value">${fmt(monthlyInterest)}</span>
            </div>
            <div class="sa-widget__proj-item">
              <span class="sa-widget__proj-label">Annual interest earned</span>
              <span class="sa-widget__proj-value">${fmt(annualGrowth)}</span>
            </div>
            <div class="sa-widget__proj-item">
              <span class="sa-widget__proj-label">Current balance</span>
              <span class="sa-widget__proj-value">${fmt(groupBalance)}</span>
            </div>
            <div class="sa-widget__proj-item">
              <span class="sa-widget__proj-label">Projected in 12 months</span>
              <span class="sa-widget__proj-value">${fmt(projectedYear)}</span>
            </div>
          </div>
        </div>
        ` : `
        <div class="sa-widget__projection">
          <p class="sa-widget__proj-title">💡 Savings Projection</p>
          <p style="font-size:0.85rem;color:var(--color-text-muted);">
            Your group balance will appear here once contributions are recorded.
          </p>
        </div>
        `}

        <p class="sa-widget__updated">
          SARB data: ${SA_STATIC.lastUpdated} &nbsp;·&nbsp; ${sourceLabel}
        </p>
      </div>`;
  }

  // ── Wire refresh button ───────────────────────────────────
  function wireRefreshButton(groupBalance) {
    const btn = document.getElementById('sa-refresh-btn');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      btn.classList.add('spinning');
      btn.disabled = true;
      await renderSAWidget(groupBalance, true);
      btn.classList.remove('spinning');
      btn.disabled = false;
    });
  }

  // ── Load user & group data from Firestore ────────────────
  async function loadDashboardData(user, groupId = null) {
    // Set display name
    const nameEl = document.getElementById('user-display-name');
    if (nameEl) {
      nameEl.textContent = user.displayName
        ? user.displayName.split(' ')[0]   // first name only
        : user.email;
    }

    let groupBalance = 0;

    // Try to load group data (P3 will flesh this out)
    try {
      let targetGroupId = groupId;

      if (!targetGroupId) {
        const membershipSnap = await db
          .collection('memberships')
          .where('uid', '==', user.uid)
          .limit(1)
          .get();
        if (!membershipSnap.empty) {
          targetGroupId = membershipSnap.docs[0].data().groupId;
        }
      }

      if (targetGroupId) {
        const groupDoc = await db.collection('groups').doc(targetGroupId).get();

        if (groupDoc.exists) {
          const group = groupDoc.data();
          groupBalance = group.totalBalance || 0;

          const badgeEl = document.getElementById('group-name-badge');
          if (badgeEl) badgeEl.textContent = '🌿 ' + (group.name || 'My Stokvel');

          const balanceEl = document.getElementById('stat-balance');
          if (balanceEl) balanceEl.textContent = 'R ' + groupBalance.toLocaleString('en-ZA');

          const membersEl = document.getElementById('stat-members');
          if (membersEl) {
            const membersSnap = await db.collection('groups').doc(groupDoc.id).collection('members').get();
            membersEl.textContent = membersSnap.size || '—';
          }
        }
      } else {
        const badgeEl = document.getElementById('group-name-badge');
        if (badgeEl) badgeEl.textContent = '🌿 No group yet';
      }
    } catch (err) {
      console.warn('[Dashboard] Could not load group data:', err.message);
      const badgeEl = document.getElementById('group-name-badge');
      if (badgeEl) badgeEl.textContent = '🌿 My Stokvel';
    }

    return groupBalance;
  }

  // Expose to window so other scripts can trigger a refresh
  window.loadDashboardData = loadDashboardData;
  window.renderSAWidget     = renderSAWidget;
  window.wireRefreshButton = wireRefreshButton;

  // ── Auth guard + init ─────────────────────────────────────
  function init() {
    if (typeof firebase === 'undefined' || !firebase.auth) {
      console.error('[Dashboard] Firebase not loaded');
      return;
    }

    firebase.auth().onAuthStateChanged(async (user) => {
      if (!user) {
        // Not logged in — redirect to login
        window.location.href = 'login.html';
        return;
      }

      // Logged in — load data then render widget
      const groupBalance = await loadDashboardData(user);
      await renderSAWidget(groupBalance);
      wireRefreshButton(groupBalance);
    });
  }

  // Run after DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();