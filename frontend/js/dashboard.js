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

      if (membershipsSnap.empty) {
        window.location.href = 'onboarding.html';
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

        const badgeEl = document.getElementById('group-name-badge');
        if (badgeEl) {
          badgeEl.textContent = '🌿 ' + (group.name || 'My Stokvel');
          if (userRole === 'Admin') {
            badgeEl.innerHTML += ' <span style="font-size:0.7rem;background:#dcfce7;color:#166534;padding:0.1rem 0.5rem;border-radius:999px;font-weight:600;">Admin</span>';
          }
        }

        const balanceEl = document.getElementById('stat-balance');
        if (balanceEl) balanceEl.textContent = 'R ' + groupBalance.toLocaleString('en-ZA');

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

      const wrapper =
        document.createElement("article");

      wrapper.className =
        "members-widget__invite-item";

      // Group name
      const text =
        document.createElement("p");

      text.innerHTML = `
        <strong>${invite.groupName || "Stokvel Group"}</strong>
      `;

      // Buttons container
      const btnRow =
        document.createElement("div");

      btnRow.style.display = "flex";
      btnRow.style.gap = "0.5rem";
      btnRow.style.marginTop = "0.5rem";

      // ACCEPT BUTTON
      const acceptBtn =
        document.createElement("button");

      acceptBtn.className =
        "btn btn--primary btn--sm";

      acceptBtn.textContent = "Accept";

      acceptBtn.onclick = async () => {

        try {

          await acceptInvite(
            invite.id,
            user
          );

          wrapper.innerHTML = `
            <p>✅ Invite accepted</p>
          `;

          // refresh dashboard stats
          await loadDashboardData(user);

        } catch (err) {

          console.error(err);

          alert("Could not accept invite");
        }
      };

      // DECLINE BUTTON
      const declineBtn =
        document.createElement("button");

      declineBtn.className =
        "btn btn--outline btn--sm";

      declineBtn.textContent = "Decline";

      declineBtn.onclick = async () => {

        try {

          await declineInvite(invite.id);

          wrapper.innerHTML = `
            <p>❌ Invite declined</p>
          `;

        } catch (err) {

          console.error(err);

          alert("Could not decline invite");
        }
      };

      btnRow.appendChild(acceptBtn);
      btnRow.appendChild(declineBtn);

      wrapper.appendChild(text);
      wrapper.appendChild(btnRow);

      inviteSection.appendChild(wrapper);
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
 












