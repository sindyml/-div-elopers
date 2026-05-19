// js/dashboard.js
import { auth, db } from "./firebase-config.js";
import { SA_DATA_DEFAULTS, COLLECTIONS } from "./constants.js";
import { mountNotificationsWidget } from './dashboard-widgets.js';
// Import SA data rendering from the dedicated module
import { renderSADataWidget } from './sa-data.js';

import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import {

  checkPendingInvites,
  acceptInvite,
  declineInvite

} from "./groupService.js";

(function () {
  const SA_STATIC = SA_DATA_DEFAULTS;

  /* ══════════════════════════════════════════════════════════
     UTILITIES
     ══════════════════════════════════════════════════════════ */
  function fmt(num, decimals = 2) {
    return 'R ' + Number(num).toLocaleString('en-ZA', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  /* ══════════════════════════════════════════════════════════
     REFRESH BUTTON — triggers renderSADataWidget with cache clear
     ══════════════════════════════════════════════════════════ */
  let refreshButtonWired = false;
  function wireRefreshButton(groupBalance) {
    const btn = document.getElementById('sa-refresh-btn');
    if (!btn || refreshButtonWired) return;
    btn.onclick = async () => {
      btn.classList.add('spinning');
      btn.disabled = true;
      const container = document.getElementById('sa-widget-container');
      if (container) {
        await renderSADataWidget(container, groupBalance, true);
      }
      btn.classList.remove('spinning');
      btn.disabled = false;
    };
    refreshButtonWired = true;
  }

  /* ══════════════════════════════════════════════════════════
     DASHBOARD DATA LOADER — modular Firestore only
     ══════════════════════════════════════════════════════════ */
  async function loadDashboardData(user, specificGroupId = null) {
    // Set display name
    const nameEl = document.getElementById('user-display-name');
    if (nameEl) {
      nameEl.textContent = user.displayName
        ? user.displayName.split(' ')[0]
        : user.email;
    }

    let groupBalance = 0;

    try {
      // ✅ Modular: collection() + query() + where() + getDocs()
      const membershipsRef = collection(db, COLLECTIONS.MEMBERSHIPS);
      const qMemberships   = query(membershipsRef, where('uid', '==', user.uid));
      const membershipsSnap = await getDocs(qMemberships);
      console.log("Membership count:", membershipsSnap.size);

      // Prevent premature redirect while Firestore loads
      if (membershipsSnap.empty) {
        console.warn("[Dashboard] No memberships found for user:", user.uid);

        // First, check if there are pending invites. If yes, stay on dashboard.
        // We check for user.email as checkPendingInvites relies on it.
        if (user.email) {
          try {
            const pendingInvites = await checkPendingInvites(user);
            if (pendingInvites && pendingInvites.length > 0) {
              console.log("[Dashboard] Pending invites found, staying on dashboard.");
              return groupBalance;
            }
          } catch (inviteErr) {
            console.warn("[Dashboard] Failed to check invites during initial load:", inviteErr.message);
          }
        }

        // Wait longer (3s) before final decision to redirect.
        // This accounts for Firestore eventual consistency and slow network.
        setTimeout(async () => {
          const retrySnap = await getDocs(qMemberships);

          if (!retrySnap.empty) {
            console.log("[Dashboard] Memberships found on retry. Reloading to re-initialize all dashboard components.");
            window.location.reload();
            return;
          }

          // Final check for invites before redirecting
          if (user.email) {
            try {
              const retryInvites = await checkPendingInvites(user);
              if (retryInvites.length === 0) {
                console.warn("[Dashboard] Redirecting to onboarding (no memberships or invites confirmed)");
                window.location.href = 'onboarding.html';
              } else {
                console.log("[Dashboard] Pending invites found on retry, staying on dashboard.");
              }
            } catch (retryInviteErr) {
              // If even checking invites fails, and memberships are empty, redirect
              window.location.href = 'onboarding.html';
            }
          } else {
            // If no email to check invites and memberships still empty, redirect
            window.location.href = 'onboarding.html';
          }
        }, 3000);

        return groupBalance;
      }

      let groupId;
      let userRole = 'member';

      if (specificGroupId) {
        groupId = specificGroupId;
        const membershipDoc = membershipsSnap.docs.find(d => d.data().groupId === groupId);
        userRole = membershipDoc?.data().role || 'member';
      } else {
        groupId  = membershipsSnap.docs[0].data().groupId;
        userRole = membershipsSnap.docs[0].data().role;
      }

      // ✅ Modular: doc() + getDoc()
      const groupRef  = doc(db, COLLECTIONS.GROUPS, groupId);
      const groupSnap = await getDoc(groupRef);

      if (groupSnap.exists()) {
        const group = groupSnap.data();
        groupBalance = group.totalBalance || 0;

        /* ═══════════════════════════════════════════
   ADMIN CONTROLS
   ═══════════════════════════════════════════ */

const adminActions =
  document.getElementById(
    "group-admin-actions"
  );

const editLink =
  document.getElementById(
    "edit-group-link"
  );

const settingsLink =
  document.getElementById(
    "group-settings-link"
  );

if (
  userRole === "admin" &&
  adminActions
) {

  adminActions.style.display =
    "flex";

  editLink.href =
    `group-edit.html?groupId=${groupId}`;

  settingsLink.href =
    `group-settings.html?groupId=${groupId}`;
}

        const badgeEl = document.getElementById('group-name-badge');
        if (badgeEl) {
          badgeEl.textContent = '🌿 ' + (group.name || 'My Stokvel');
          if (userRole === 'Admin') {
            badgeEl.innerHTML += ' <span style="font-size:0.7rem;background:#dcfce7;color:#166534;padding:0.1rem 0.5rem;border-radius:999px;font-weight:600;">Admin</span>';
          }
        }

        const balanceEl = document.getElementById('stat-balance');
        if (balanceEl) balanceEl.textContent = 'R ' + groupBalance.toLocaleString('en-ZA');

        // Show Admin/Treasurer buttons if applicable
        const manageBtn = document.getElementById('manageContributionsBtn');
        const analyticsBtn = document.getElementById('analyticsBtn');
        const roleLower = userRole?.toLowerCase();
        if (roleLower === 'admin' || roleLower === 'treasurer') {
          if (manageBtn) manageBtn.style.display = 'inline-flex';
          if (analyticsBtn) analyticsBtn.style.display = 'inline-flex';
        } else {
          if (manageBtn) manageBtn.style.display = 'none';
          if (analyticsBtn) analyticsBtn.style.display = 'none';
        }

        const membersEl = document.getElementById('stat-members');
        if (membersEl) {
          // ✅ Modular: collection() + getDocs() for subcollection
          const membersRef  = collection(db, `groups/${groupId}/members`);
          const membersSnap = await getDocs(membersRef);
          membersEl.textContent = membersSnap.size ?? '—';
        }
      } else {
        const badgeEl = document.getElementById('group-name-badge');
        if (badgeEl) badgeEl.textContent = '🌿 No group yet';
      }
    } catch (err) {
      console.warn('[Dashboard] Could not load group data:', err.message);
    }

    return groupBalance;
  }

  /* ══════════════════════════════════════════════════════════
     EXPOSE TO WINDOW (for dashboard-widgets.js callbacks)
     ══════════════════════════════════════════════════════════ */
  window.loadDashboardData = loadDashboardData;
  window.renderSADataWidget = renderSADataWidget;
  window.wireRefreshButton = wireRefreshButton;

  /* ══════════════════════════════════════════════════════════
   INVITE LOADER
   ══════════════════════════════════════════════════════════ */
async function loadPendingInvites(user) {

  const inviteSection =
    document.getElementById("inviteSection");

  if (!inviteSection) return;

  inviteSection.innerHTML = "";

  try {

    const invites =
      await checkPendingInvites(user);

    if (!invites.length) {

      inviteSection.innerHTML = `
        <p>No pending invites</p>
      `;

      return;
    }

    invites.forEach(invite => {

   const inviteCard =
  document.createElement("div");

inviteCard.className =
  "invite-card";

inviteCard.innerHTML = `

  <div class="invite-card__title">
    📨 Group Invitation
  </div>

  <div class="invite-card__text">
    You were invited to join
    <strong>
      ${invite.groupName || "Stokvel Group"}
    </strong>
  </div>

  <div class="invite-card__actions">

      <button
        class="invite-btn-accept"
      >
        Accept
      </button>

      <button
        class="invite-btn-decline"
      >
        Decline
      </button>

  </div>
`;

const acceptBtn =
  inviteCard.querySelector(
    ".invite-btn-accept"
  );

const declineBtn =
  inviteCard.querySelector(
    ".invite-btn-decline"
  );

// ======================================
// ACCEPT
// ======================================

acceptBtn.onclick =
  async () => {

    try {

      await acceptInvite(
        invite.id,
        user
      );

      inviteCard.innerHTML = `
        <p>✅ Invite accepted</p>
      `;

      // Refresh dashboard stats
      await loadDashboardData(user);

    } catch (err) {

      console.error(err);

      alert(
        "Could not accept invite"
      );
    }
  };

// ======================================
// DECLINE
// ======================================

declineBtn.onclick =
  async () => {

    try {

      await declineInvite(
        invite.id
      );

      inviteCard.innerHTML = `
        <p>❌ Invite declined</p>
      `;

    } catch (err) {

      console.error(err);

      alert(
        "Could not decline invite"
      );
    }
  };

inviteSection.appendChild(
  inviteCard
);
    });

  } catch (err) {

    console.warn(
      "[Dashboard] Failed loading invites:",
      err.message
    );
  }
}

  /* ══════════════════════════════════════════════════════════
     INIT
     ══════════════════════════════════════════════════════════ */
  function init() {
    auth.onAuthStateChanged(async (user) => {
      if (!user) {
        window.location.href = 'login.html';
        return;
      }

      // Mount notifications widget
      const notifContainer = document.getElementById('notifications-container');
      if (notifContainer) mountNotificationsWidget(notifContainer, user.uid);

      // Load dashboard data and render SA widget
      const groupBalance = await loadDashboardData(user);
      const saContainer = document.getElementById('sa-widget-container');
      if (saContainer) {
        await renderSADataWidget(saContainer, groupBalance);
      }
      wireRefreshButton(groupBalance);
            // Load pending invites
      await loadPendingInvites(user);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
 












