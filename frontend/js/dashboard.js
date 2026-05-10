// js/dashboard.js
import { auth, db } from "./firebase-config.js";
import { SA_DATA_DEFAULTS } from "./constants.js";
import { mountNotificationsWidget } from './dashboard-widgets.js';
 
import {
  collection, query, where, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
 
import { COLLECTIONS } from "./constants.js";
 
(function () {
  const SA_STATIC = SA_DATA_DEFAULTS;
 
  const FRANKFURTER_URL = 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=ZAR';
  const AZURE_FALLBACK  = '/api/getSAData';
  const CACHE_KEY       = 'stokpal_usd_zar';
  const CACHE_DURATION  = 4 * 60 * 60 * 1000;
 
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
 
  async function fetchUSDZAR() {
    const cached = readCache();
    if (cached) return { zarPerUsd: cached.value, fromCache: true, live: false };
 
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(FRANKFURTER_URL, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const zarPerUsd = data.rates?.ZAR ?? 18.5;
      writeCache(zarPerUsd);
      return { zarPerUsd, fromCache: false, live: true };
    } catch (err) {
      console.warn('[SA Data] Frankfurter failed:', err.message);
    }
 
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
 
    return { zarPerUsd: 18.50, fromCache: false, live: false };
  }
 
  async function renderSAWidget(groupBalance = 0, forceRefresh = false) {
    const container = document.getElementById('sa-widget-container');
    if (!container) return;
 
    if (forceRefresh) {
      try { localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
    }
 
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
 
    const monthlyInterest = groupBalance * (SA_STATIC.primeRate / 100) / 12;
    const annualGrowth    = groupBalance * (SA_STATIC.primeRate / 100);
    const projectedYear   = groupBalance + annualGrowth;
 
    let sourceLabel;
    if (live)           sourceLabel = `Live · Frankfurter API · ${elapsed}ms`;
    else if (fromCache) sourceLabel = `Cached · Frankfurter API`;
    else                sourceLabel = `⚠️ Offline — showing last known values`;
 
    const isFallback = !live && !fromCache;
 
    container.innerHTML = `
      <div class="sa-widget">
        ${isFallback ? `<div class="sa-widget--fallback">⚠️ Could not reach exchange rate API — showing static values.</div>` : ''}
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
 
  let refreshButtonWired = false;
  function wireRefreshButton(groupBalance) {
    const btn = document.getElementById('sa-refresh-btn');
    if (!btn || refreshButtonWired) return;
    btn.onclick = async () => {
      btn.classList.add('spinning');
      btn.disabled = true;
      await renderSAWidget(groupBalance, true);
      btn.classList.remove('spinning');
      btn.disabled = false;
    };
    refreshButtonWired = true;
  }
 
  async function loadDashboardData(user) {
    // Set display name
    const nameEl = document.getElementById('user-display-name');
    if (nameEl) {
      nameEl.textContent = user.displayName
        ? user.displayName.split(' ')[0]
        : user.email;
    }
 
    let groupBalance = 0;
 
    try {
      // Look up membership
      const memSnap = await getDocs(
        query(
          collection(db, COLLECTIONS.MEMBERSHIPS),
          where('uid', '==', user.uid)
        )
      );
 
      if (memSnap.empty) {
        // No membership — send to onboarding
        window.location.href = 'onboarding.html';
        return groupBalance;
      }
 
      const groupId = memSnap.docs[0].data().groupId;
      const userRole = memSnap.docs[0].data().role;
 
      // Load group doc directly from groups collection
      const groupSnap = await getDocs(
        query(
          collection(db, COLLECTIONS.GROUPS),
          where('__name__', '==', groupId)
        )
      );
 
      // Use compat SDK path since dashboard.js mixes compat + modular
      const groupDoc = await db.collection('groups').doc(groupId).get();
 
      if (groupDoc.exists) {
        const group = groupDoc.data();
        groupBalance = group.totalBalance || 0;
 
        const badgeEl = document.getElementById('group-name-badge');
        if (badgeEl) {
          badgeEl.textContent = '🌿 ' + (group.name || 'My Stokvel');
          // Show admin badge if applicable
          if (userRole === 'Admin') {
            badgeEl.innerHTML += ' <span style="font-size:0.7rem;background:#dcfce7;color:#166534;padding:0.1rem 0.5rem;border-radius:999px;font-weight:600;">Admin</span>';
          }
        }
 
        const balanceEl = document.getElementById('stat-balance');
        if (balanceEl) balanceEl.textContent = 'R ' + groupBalance.toLocaleString('en-ZA');
 
        const membersEl = document.getElementById('stat-members');
        if (membersEl) {
          const membersSnap = await db
            .collection('groups')
            .doc(groupId)
            .collection('members')
            .get();
          membersEl.textContent = membersSnap.size ?? '—';
        }
      } else {
        // Stale membership — group was deleted
        const badgeEl = document.getElementById('group-name-badge');
        if (badgeEl) badgeEl.textContent = '🌿 No group yet';
      }
 
    } catch (err) {
      console.warn('[Dashboard] Could not load group data:', err.message);
    }
 
    return groupBalance;
  }
 
  window.loadDashboardData  = loadDashboardData;
  window.renderSAWidget     = renderSAWidget;
  window.wireRefreshButton  = wireRefreshButton;
 
  function init() {
    auth.onAuthStateChanged(async (user) => {
      if (!user) {
        window.location.href = 'login.html';
        return;
      }
 
      // Mount notifications widget
      const notifContainer = document.getElementById('notifications-container');
      if (notifContainer) mountNotificationsWidget(notifContainer, user.uid);
 
      // loadDashboardData handles the onboarding redirect if no membership
      const groupBalance = await loadDashboardData(user);
      await renderSAWidget(groupBalance);
      wireRefreshButton(groupBalance);
    });
  }
 
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
 












