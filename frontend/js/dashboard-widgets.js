import { auth, db } from "./firebase-config.js";

import {
  getUserGroups,
  getUserRoleInGroup,
  checkPendingInvites,
  checkAndAcceptInvites,
  acceptInvite,
  declineInvite,
  sendInvite,
  getGroupDetails
} from "./groupService.js";

import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  getDocs,
  addDoc,
  serverTimestamp,
  updateDoc,
  doc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { COLLECTIONS, ROLES } from "./constants.js";


/* =========================================================
   DOM REFERENCES
========================================================= */

const grouplist              = document.getElementById("grouplist");
const memberlist             = document.getElementById("memberlist");
const membersBlock           = document.getElementById("members-list-block");
const currentGroupNameEl     = document.getElementById("current-group-name");

const inviteForm             = document.getElementById("invite-form");
const inviteMessage          = document.getElementById("inviteMessage");

const meetingsContainer      = document.getElementById("meetings-container");
const contributionsContainer = document.getElementById("contributions-container");
const payoutContainer        = document.getElementById("payout-container");

const statMyContributions    = document.getElementById("stat-my-contributions");
const statBalance            = document.getElementById("stat-balance");
const statPayout             = document.getElementById("stat-payout");
const statPayoutName         = document.getElementById("stat-payout-name");

let selectedGroupId = null;
let userRole        = null;
let currentUser     = null;

let unsubMeetings      = null;
let unsubContributions = null;


/* =========================================================
   TOASTS
========================================================= */

function getToastRoot() {
  let root = document.getElementById("toast-root");
  if (!root) {
    root = document.createElement("div");
    root.id = "toast-root";
    document.body.appendChild(root);
  }
  return root;
}

function showToast({ type = "info", title = "", message = "", duration = 4000 }) {
  const icons = { success: "✅", error: "❌", warning: "⚠️", info: "📩" };
  const root  = getToastRoot();
  const toast = document.createElement("div");

  toast.className = `toast toast--${type}`;
  toast.innerHTML = `
    <span class="toast__icon">${icons[type] || "ℹ️"}</span>
    <div class="toast__body">
      <p class="toast__title">${title}</p>
      ${message ? `<p class="toast__msg">${message}</p>` : ""}
    </div>
  `;

  root.appendChild(toast);

  const dismiss = () => {
    toast.classList.add("toast--exit");
    toast.addEventListener("animationend", () => toast.remove(), { once: true });
  };

  setTimeout(dismiss, duration);
  toast.addEventListener("click", dismiss);
}


/* =========================================================
   HELPERS
========================================================= */

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
}

function fmtRand(amount) {
  return "R " + Number(amount || 0).toLocaleString("en-ZA");
}

function fmtTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hr = parseInt(h, 10);
  return `${(hr % 12) || 12}:${m} ${hr >= 12 ? "PM" : "AM"}`;
}

function timeAgo(date) {
  const diff = Math.floor((Date.now() - date) / 1000);
  if (diff < 60)    return "Just now";
  if (diff < 3600)  return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
  return date.toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}


/* =========================================================
   NOTIFICATIONS
========================================================= */

export async function createNotification(opts) {
  try {
    await addDoc(
      collection(db, COLLECTIONS.NOTIFICATIONS || "notifications"),
      {
        userID:    opts.userId,
        type:      opts.type    || "system",
        message:   opts.message || "",
        html:      opts.html    || null,
        groupName: opts.groupName || null,
        inviteId:  opts.inviteId  || null,
        status:    opts.status    || null,
        read:      false,
        createdAt: serverTimestamp()
      }
    );
  } catch (err) {
    console.error("[Notifications]", err);
  }
}

window.createNotification = createNotification;

async function markNotifRead(notifId) {
  try {
    await updateDoc(
      doc(db, COLLECTIONS.NOTIFICATIONS || "notifications", notifId),
      { read: true }
    );
  } catch (err) {
    console.error("[Notifications] markRead", err);
  }
}

function buildNotifItem(notif) {
  const isUnread = !notif.read;
  const isInvite = notif.type === "invite" && notif.inviteId && notif.status === "pending";

  const li = document.createElement("li");
  li.className       = "notif-item" + (isUnread ? " notif-item--unread" : "");
  li.dataset.notifId = notif.id;

  const actionButtons = isInvite ? `
    <div class="notif-item__actions">
      <button class="btn-accept" data-invite-id="${notif.inviteId}" data-notif-id="${notif.id}">
        ✅ Accept
      </button>
      <button class="btn-decline" data-invite-id="${notif.inviteId}" data-notif-id="${notif.id}">
        ❌ Decline
      </button>
    </div>
  ` : "";

  li.innerHTML = `
    <div class="notif-item__body">
      <p class="notif-item__text">
        ${notif.html || escapeHtml(notif.message)}
      </p>
      <small class="notif-item__meta">
        ${notif.createdAt?.toDate ? timeAgo(notif.createdAt.toDate()) : ""}
      </small>
      ${actionButtons}
    </div>
  `;

  if (isInvite) {
    li.querySelector(".btn-accept").addEventListener("click", async (e) => {
      const { inviteId, notifId } = e.currentTarget.dataset;
      try {
        await acceptInvite(inviteId, currentUser);
        await updateDoc(
          doc(db, COLLECTIONS.NOTIFICATIONS || "notifications", notifId),
          { read: true, status: "invite accepted" }
        );
        showToast({ type: "success", title: "Joined!", message: "You've joined the group." });
      } catch (err) {
        console.error(err);
        showToast({ type: "error", title: "Failed", message: err.message });
      }
    });

    li.querySelector(".btn-decline").addEventListener("click", async (e) => {
      const { inviteId, notifId } = e.currentTarget.dataset;
      try {
        await declineInvite(inviteId);
        await updateDoc(
          doc(db, COLLECTIONS.NOTIFICATIONS || "notifications", notifId),
          { read: true, status: "declined" }
        );
        showToast({ type: "info", title: "Declined", message: "Invite declined." });
      } catch (err) {
        console.error(err);
        showToast({ type: "error", title: "Failed", message: err.message });
      }
    });
  }

  if (isUnread) {
    li.addEventListener("click", () => markNotifRead(notif.id), { once: true });
  }

  return li;
}

export function mountNotificationsWidget(container, uid) {
  if (!container) return;

  container.innerHTML = `
    <div class="notif-widget">
      <div class="notif-widget__header">
        <h3 class="notif-widget__title">🔔 Notifications</h3>
        <button id="notif-mark-all">Mark all read</button>
      </div>
      <ul id="notif-list" class="notif-widget__list">
        <li class="notif-widget__empty">Loading...</li>
      </ul>
    </div>
  `;

  const listEl = container.querySelector("#notif-list");

  container.querySelector("#notif-mark-all").addEventListener("click", async () => {
    const unread = listEl.querySelectorAll(".notif-item--unread");
    await Promise.all([...unread].map(el => markNotifRead(el.dataset.notifId)));
  });

  const q = query(
    collection(db, COLLECTIONS.NOTIFICATIONS || "notifications"),
    where("userID", "==", uid),
    orderBy("createdAt", "desc"),
    limit(20)
  );

  onSnapshot(q, (snapshot) => {
    const notifications = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    listEl.innerHTML = "";

    if (!notifications.length) {
      listEl.innerHTML = `<li class="notif-widget__empty">No notifications</li>`;
      return;
    }

    notifications.forEach(notif => listEl.appendChild(buildNotifItem(notif)));
  });
}


/* =========================================================
   MEMBERS
========================================================= */

async function loadMembers(groupId, groupName) {
  if (!memberlist) return;

  memberlist.innerHTML = "<li>Loading...</li>";
  membersBlock.style.display = "block";
  currentGroupNameEl.textContent = groupName;

  try {
    const snap = await getDocs(collection(db, `groups/${groupId}/members`));
    memberlist.innerHTML = "";

    snap.forEach(docSnap => {
      const data = docSnap.data();
      const li   = document.createElement("li");
      li.innerHTML = `
        <span>${data.displayName || docSnap.id}</span>
        <small class="badge">${data.role}</small>
      `;
      memberlist.appendChild(li);
    });
  } catch (err) {
    console.error(err);
    memberlist.innerHTML = "<li>Error loading members</li>";
  }
}


/* =========================================================
   GROUPS
========================================================= */

async function loadGroups(uid) {
  if (!grouplist) return [];

  const groups = await getUserGroups(uid);
  grouplist.innerHTML = "";

  groups.forEach(group => {
    const li     = document.createElement("li");
    const button = document.createElement("button");

    button.textContent = group.name;
    button.onclick = async () => {
      selectedGroupId = group.id;
      userRole = await getUserRoleInGroup(group.id, uid);
      await loadMembers(group.id, group.name);
      startMeetingListener([group.id]);
      await loadPayoutWidget(uid, [group.id]);
    };

    li.appendChild(button);
    grouplist.appendChild(li);
  });

  return groups.map(g => g.id);
}


/* =========================================================
   INVITES
========================================================= */

async function showInviteNotifications(user) {
  try {
    const invites = await checkPendingInvites(user);

    for (const invite of invites) {
      const existing = await getDocs(
        query(
          collection(db, COLLECTIONS.NOTIFICATIONS || "notifications"),
          where("userID",   "==", user.uid),
          where("inviteId", "==", invite.id),
          where("status",   "==", "pending")
        )
      );

      if (existing.empty) {
        await createNotification({
          userId:    user.uid,
          type:      "invite",
          message:   `You've been invited to join ${invite.groupName}`,
          html:      `📩 You've been invited to join <strong>${invite.groupName}</strong>`,
          groupName: invite.groupName,
          inviteId:  invite.id,
          status:    "pending"
        });
      }
    }
  } catch (err) {
    console.error("[showInviteNotifications]", err);
  }
}

if (inviteForm) {
  inviteForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = document.getElementById("inviteEmail").value.trim();

    if (!selectedGroupId) return alert("Select a group first");

    if (userRole?.toLowerCase() !== ROLES.ADMIN.toLowerCase()) {
      return alert("Only admins can invite");
    }

    try {
      const result = await sendInvite(selectedGroupId, email, auth.currentUser.uid);

      if (result?.targetUserId) {
        const groupDetails = await getGroupDetails(selectedGroupId);

        await createNotification({
          userId:    result.targetUserId,
          type:      "invite",
          message:   `You've been invited to join ${groupDetails.name}`,
          html:      `📩 You've been invited to join <strong>${groupDetails.name}</strong>`,
          groupName: groupDetails.name,
          inviteId:  result.inviteId,
          status:    "pending"
        });
      }

      inviteMessage.textContent = "✅ Invite sent";
      showToast({ type: "success", title: "Invite sent!", message: `Invited ${email}` });

    } catch (err) {
      console.error(err);
      inviteMessage.textContent = "❌ Failed to send invite";
      showToast({ type: "error", title: "Failed", message: err.message });
    }
  });
}


/* =========================================================
   MEETINGS
========================================================= */

function buildMeetingWidget(meeting) {
  const li = document.createElement("li");
  li.className = "meeting-widget-item";
  li.innerHTML = `
    <div class="meeting-widget-info">
      <p class="meeting-widget-title">${meeting.title || "Untitled"}</p>
      <small class="meeting-widget-meta">
        ${fmtDate(meeting.date)}${meeting.time ? " · " + fmtTime(meeting.time) : ""}
      </small>
    </div>
  `;
  return li;
}

function startMeetingListener(groupIds) {
  if (unsubMeetings) unsubMeetings();
  if (!groupIds.length) return;

  const today = new Date().toISOString().slice(0, 10);

  const q = query(
    collection(db, COLLECTIONS.MEETINGS),
    where("groupId", "in", groupIds.slice(0, 10)),
    where("date", ">=", today),
    orderBy("date", "asc"),
    limit(5)
  );

  unsubMeetings = onSnapshot(q, snapshot => {
    const meetings = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    meetingsContainer.innerHTML = "";

    if (!meetings.length) {
      meetingsContainer.innerHTML = "<p>No meetings</p>";
      return;
    }

    const ul = document.createElement("ul");
    meetings.forEach(meeting => ul.appendChild(buildMeetingWidget(meeting)));
    meetingsContainer.appendChild(ul);
  });
}


/* =========================================================
   CONTRIBUTIONS
========================================================= */

function startContributionListener(uid, groupMap) {
  if (unsubContributions) unsubContributions();

  const q = query(
    collection(db, COLLECTIONS.CONTRIBUTIONS),
    where("userId", "==", uid),
    orderBy("date", "desc"),
    limit(10)
  );

  unsubContributions = onSnapshot(q, snapshot => {
    const contributions = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    contributionsContainer.innerHTML = "";

    if (!contributions.length) {
      contributionsContainer.innerHTML = "<p>No contributions</p>";
      return;
    }

    const ul = document.createElement("ul");
    contributions.slice(0, 5).forEach(c => {
      const li = document.createElement("li");
      li.innerHTML = `
        <strong>${fmtRand(c.amount)}</strong>
        <small>${groupMap[c.groupId] || "Group"} · ${fmtDate(c.date)}</small>
      `;
      ul.appendChild(li);
    });
    contributionsContainer.appendChild(ul);

    const total = contributions
      .filter(c => c.status === "confirmed")
      .reduce((sum, c) => sum + Number(c.amount || 0), 0);

    if (statMyContributions) statMyContributions.textContent = fmtRand(total);
  });
}


/* =========================================================
   PAYOUTS
========================================================= */

async function loadPayoutWidget(uid, groupIds) {
  if (!groupIds.length) return;

  try {
    const snap = await getDocs(
      query(
        collection(db, COLLECTIONS.PAYOUTS),
        where("groupId", "==", groupIds[0]),
        orderBy("order", "asc")
      )
    );

    const payouts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    payoutContainer.innerHTML = "";

    if (!payouts.length) {
      payoutContainer.innerHTML = "<p>No payout schedule</p>";
      return;
    }

    const ul = document.createElement("ul");
    payouts.forEach(payout => {
      const li = document.createElement("li");
      li.innerHTML = `
        <strong>#${payout.order}</strong>
        <span>${payout.userDisplayName}</span>
        <small>${fmtDate(payout.payoutDate)}</small>
      `;
      ul.appendChild(li);
    });
    payoutContainer.appendChild(ul);

  } catch (err) {
    console.error(err);
  }
}


/* =========================================================
   AUTH
========================================================= */

auth.onAuthStateChanged(async (user) => {
  if (!user) return;

  currentUser = user;

  await checkAndAcceptInvites(user);
  await showInviteNotifications(user);

  const groupIds = await loadGroups(user.uid);

  const groupDetails = await Promise.all(groupIds.map(id => getGroupDetails(id)));

  const groupMap = {};
  groupIds.forEach((id, i) => {
    if (groupDetails[i]) groupMap[id] = groupDetails[i].name;
  });

  startMeetingListener(groupIds);
  startContributionListener(user.uid, groupMap);
  await loadPayoutWidget(user.uid, groupIds);

  mountNotificationsWidget(
    document.getElementById("notifications-widget"),
    user.uid
  );
});