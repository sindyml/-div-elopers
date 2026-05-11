// js/dashboard.js
import { auth, db } from "./firebase-config.js";
import { getUserGroups } from "./dashboardService.js";

import {
  sendInvite,
  acceptInvite,
  declineInvite,
  resendInvite
} from "./groupService.js";

import {
  getPendingInvites
} from "./auth.js";

import { SA_DATA_DEFAULTS } from "./constants.js";

(function () {
  
  let selectedGroupId = null;
  let selectedGroupName = null;
  // SA Data config
  const SA_STATIC = SA_DATA_DEFAULTS;

  const FRANKFURTER_URL = 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=ZAR';
  const AZURE_FALLBACK  = '/api/getSAData';
  const CACHE_KEY        = 'stokpal_usd_zar';
  const CACHE_DURATION   = 4 * 60 * 60 * 1000; // 4 hours

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
      const res  = await fetch(FRANKFURTER_URL, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const zarPerUsd = data.rates?.ZAR ?? 18.5;
      writeCache(zarPerUsd);
      return { zarPerUsd, fromCache: false, live: true };
    } catch (err) {
      console.warn('[SA Data] Frankfurter API failed:', err.message);
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

    // ── Load user groups ───────────────────────────────────
  async function loadUserGroups(user) {

    const grouplist = document.getElementById("grouplist");

    if (!grouplist) return;

    grouplist.innerHTML = "";

    try {

      const groups = await getUserGroups();

      if (groups.length === 0) {
        grouplist.innerHTML = "<li>No groups yet</li>";
        return;
      }

      groups.forEach(group => {

        const li = document.createElement("li");

        li.textContent = group.name || "Unnamed Group";

        // IMPORTANT
        li.dataset.groupId = group.id;

        li.onclick = async () => {

          selectedGroupId = group.id;
          selectedGroupName = group.name;

          // highlight selected
          document.querySelectorAll("#grouplist li")
            .forEach(el => el.classList.remove("active"));

          li.classList.add("active");

          // reload dashboard data
          const balance =
            await loadDashboardData(user, group.id);

          await renderSAWidget(balance);
        };

        grouplist.appendChild(li);
      });

    } catch (err) {

      console.warn(
        "[Dashboard] Failed loading groups:",
        err.message
      );
    }
  }

    // ── Load pending invites ───────────────────────────────
  async function loadInvites(user) {

    const inviteSection =
      document.getElementById("inviteSection");

    if (!inviteSection) return;

    inviteSection.innerHTML = `
      <h3 class="members-widget__heading">
        Pending Invites
      </h3>
    `;

    try {

      const invites =
        await getPendingInvites(user);

      if (invites.length === 0) {

        inviteSection.innerHTML += `
          <p>No pending invites</p>
        `;

        return;
      }

      invites.forEach(invite => {

        const wrapper =
          document.createElement("section");

        const text =
          document.createElement("p");

        text.textContent =
          `Invite to join group ${invite.groupId}`;

        wrapper.appendChild(text);

        // expiration
        if (invite.expiresAt) {

          const expiry =
            document.createElement("small");

          const expiryDate =
            new Date(invite.expiresAt.seconds * 1000);

          expiry.textContent =
            `Expires: ${expiryDate.toLocaleDateString()}`;

          wrapper.appendChild(expiry);
        }

        // ACCEPT
        const acceptBtn =
          document.createElement("button");

        acceptBtn.textContent = "Accept";

        acceptBtn.onclick = async () => {

          try {

            await acceptInvite(invite, user);

            location.reload();

          } catch (err) {

            console.error(err);

            alert("Error accepting invite");
          }
        };

        wrapper.appendChild(acceptBtn);

        // DECLINE
        const declineBtn =
          document.createElement("button");

        declineBtn.textContent = "Decline";

        declineBtn.onclick = async () => {

          try {

            await declineInvite(invite.id);

            location.reload();

          } catch (err) {

            console.error(err);

            alert("Error declining invite");
          }
        };

        wrapper.appendChild(declineBtn);

        // RESEND (expired only)
        if (invite.status === "expired") {

          const resendBtn =
            document.createElement("button");

          resendBtn.textContent = "Resend";

          resendBtn.onclick = async () => {

            try {

              await resendInvite(
                invite.email,
                invite.groupId
              );

              location.reload();

            } catch (err) {

              console.error(err);

              alert("Error resending invite");
            }
          };

          wrapper.appendChild(resendBtn);
        }

        inviteSection.appendChild(wrapper);

      });

    } catch (err) {

      console.warn(
        "[Dashboard] Failed loading invites:",
        err.message
      );
    }
  }

    // ── Invite member form ─────────────────────────────────
  function wireInviteForm() {

    const form =
      document.getElementById("invite-form");

    if (!form) return;

    form.addEventListener("submit", async (e) => {

      e.preventDefault();

      const inviteMessage =
        document.getElementById("inviteMessage");

      const email =
        document.getElementById("inviteEmail").value;

      if (!selectedGroupId) {

        inviteMessage.textContent =
          "Please select a group first";

        return;
      }

      try {

        await sendInvite(
          email,
          selectedGroupId
        );

        inviteMessage.textContent =
          " Invite sent successfully";

        form.reset();

      } catch (err) {

        console.error(err);

        inviteMessage.textContent =
          " Error sending invite";
      }
    });
  }

  // ── Load user & group data from Firestore ────────────────
  async function loadDashboardData(user, groupId = null) {
    // Set display name
    const nameEl = document.getElementById('user-display-name');
    if (nameEl) {
      nameEl.textContent = user.displayName ? user.displayName.split(' ')[0] : user.email;
    }

    let groupBalance = 0;
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
          if (badgeEl) badgeEl.textContent = ' ' + (group.name || 'My Stokvel');

          const balanceEl = document.getElementById('stat-balance');
          if (balanceEl) balanceEl.textContent = 'R ' + groupBalance.toLocaleString('en-ZA');

          const membersEl = document.getElementById('stat-members');
          if (membersEl) {
            const membersSnap = await db.collection('groups').doc(groupDoc.id).collection('members').get();
            membersEl.textContent = membersSnap.size ?? '—';
          }
        } else {
          // Handle non-existent group (stale membership)
          const badgeEl = document.getElementById('group-name-badge');
          if (badgeEl) badgeEl.textContent = ' No group yet';

          const balanceEl = document.getElementById('stat-balance');
          if (balanceEl) balanceEl.textContent = 'R 0';

          const membersEl = document.getElementById('stat-members');
          if (membersEl) membersEl.textContent = '—';
        }
      } else {
        const badgeEl = document.getElementById('group-name-badge');
        if (badgeEl) badgeEl.textContent = ' No group yet';
      }
    } catch (err) {
      console.warn('[Dashboard] Could not load group data:', err.message);
    }
    return groupBalance;
  }

  // Expose to window so other scripts can trigger a refresh
  window.loadDashboardData = loadDashboardData;
  window.renderSAWidget     = renderSAWidget;
  window.wireRefreshButton = wireRefreshButton;

  // ── Auth guard + init ─────────────────────────────────────
  function init() {
    auth.onAuthStateChanged(async (user) => {
      if (!user) {
        window.location.href = 'login.html';
        return;
      }
            // load groups
      await loadUserGroups(user);

      // load invites
      await loadInvites(user);

      // load dashboard
      const groupBalance =
        await loadDashboardData(user);

      await renderSAWidget(groupBalance);

      wireRefreshButton(groupBalance);

      // wire invite form
      wireInviteForm();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
