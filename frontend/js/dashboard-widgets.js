// js/dashboard-widgets.js
import { auth, db } from "./firebase-config.js";
import {
  getUserGroups,
  getUserRoleInGroup,
  checkPendingInvites,
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
  doc,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { COLLECTIONS, ROLES } from "./constants.js";

/* ══════════════════════════════════════════════════════════
   MODULE-LEVEL STATE
   ══════════════════════════════════════════════════════════ */
let selectedGroupId       = null;
let allGroupIds           = [];
let userRole              = null;
let currentUser           = null;
let unsubMeetings         = null;
let unsubContributions    = null;
let unsubMeetingRequests  = null;   // ← new: listener for meetingRequests

/* ══════════════════════════════════════════════════════════
   DOM REFERENCES
   ══════════════════════════════════════════════════════════ */
function el(id) { return document.getElementById(id); }

/* ══════════════════════════════════════════════════════════
   TOAST SYSTEM
   ══════════════════════════════════════════════════════════ */
function getToastRoot() {
  let root = document.getElementById('toast-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'toast-root';
    document.body.appendChild(root);
  }
  return root;
}

function showToast({ type = 'info', title = '', message = '', duration = 4000 }) {
  const ICONS = { success: '✅', error: '❌', info: '📩', warning: '⚠️' };
  const root  = getToastRoot();
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.innerHTML = `
    <span class="toast__icon" aria-hidden="true">${ICONS[type] ?? 'ℹ️'}</span>
    <div class="toast__body">
      <p class="toast__title">${title}</p>
      ${message ? `<p class="toast__msg">${message}</p>` : ''}
    </div>`;
  root.appendChild(toast);
  const dismiss = () => {
    toast.classList.add('toast--exit');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  };
  if (duration > 0) setTimeout(dismiss, duration);
  toast.addEventListener('click', dismiss);
  return dismiss;
}

/* ══════════════════════════════════════════════════════════
   HELPERS
   ══════════════════════════════════════════════════════════ */
function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
}

function fmtRand(amount) {
  return 'R ' + Number(amount || 0).toLocaleString('en-ZA');
}

function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':');
  const hr = parseInt(h, 10);
  return `${(hr % 12) || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
}

function timeAgo(date) {
  const diff = Math.floor((Date.now() - date) / 1000);
  if (diff < 60)     return 'Just now';
  if (diff < 3600)   return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)} hr ago`;
  if (diff < 172800) return 'Yesterday';
  return date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ══════════════════════════════════════════════════════════
   NOTIFICATION HELPERS
   ══════════════════════════════════════════════════════════ */
export async function createNotification(opts) {
  try {
    await addDoc(collection(db, COLLECTIONS.NOTIFICATIONS || 'notifications'), {
      userId:    opts.userId,
      type:      opts.type    || 'system',
      message:   opts.message || '',
      html:      opts.html    || null,
      groupName: opts.groupName || null,
      inviteId:  opts.inviteId  || null,
      status:    opts.status    || null,
      read:      false,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.error('[Notif] createNotification error:', err);
  }
}
window.createNotification = createNotification;

async function markNotificationRead(notifId) {
  try {
    await updateDoc(
      doc(db, COLLECTIONS.NOTIFICATIONS || 'notifications', notifId),
      { read: true }
    );
  } catch (err) {
    console.error('[Notif] mark read error:', err);
  }
}

/* ══════════════════════════════════════════════════════════
   NOTIFICATIONS WIDGET
   ══════════════════════════════════════════════════════════ */
export function mountNotificationsWidget(container, uid) {
  if (!container) return;

  container.innerHTML = `
    <div class="notif-widget">
      <div class="notif-widget__header">
        <h3 class="notif-widget__title">
          🔔 Notifications
          <span class="notif-widget__badge notif-widget__badge--hidden" id="notif-unread-badge">0</span>
        </h3>
        <div class="notif-widget__header-actions">
          <a href="group-chat.html" target="_blank" class="notif-widget__chat-btn" title="Open Group Chat">💬 Group Chat</a>
          <button class="notif-widget__mark-all" id="notif-mark-all">Mark all read</button>
        </div>
      </div>
      <ul class="notif-widget__list" id="notif-list">
        <li class="notif-widget__empty">Loading…</li>
      </ul>
    </div>`;

  const listEl    = container.querySelector('#notif-list');
  const badgeEl   = container.querySelector('#notif-unread-badge');
  const markAllEl = container.querySelector('#notif-mark-all');

  const q = query(
    collection(db, COLLECTIONS.NOTIFICATIONS || 'notifications'),
    where('userId', '==', uid),
    orderBy('createdAt', 'desc'),
    limit(30)
  );

  const unsub = onSnapshot(q, (snapshot) => {
    const notifications = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    const unreadCount   = notifications.filter(n => !n.read).length;

    if (unreadCount > 0) {
      badgeEl.textContent = unreadCount > 99 ? '99+' : unreadCount;
      badgeEl.classList.remove('notif-widget__badge--hidden');
    } else {
      badgeEl.classList.add('notif-widget__badge--hidden');
    }

    listEl.innerHTML = '';
    if (!notifications.length) {
      listEl.innerHTML = `
        <li class="notif-widget__empty-state">
          <div class="notif-empty__icon" aria-hidden="true">🌿</div>
          <p class="notif-empty__title">You're all caught up</p>
          <p class="notif-empty__sub">No new notifications. Invites and updates will appear here.</p>
          <a href="group-chat.html" target="_blank" class="notif-empty__chat-link">💬 Open Group Chat</a>
        </li>`;
      return;
    }
    notifications.forEach(notif => listEl.appendChild(buildNotifItem(notif)));
  });

  markAllEl.addEventListener('click', async () => {
    const unreadItems = listEl.querySelectorAll('.notif-item--unread');
    await Promise.all(Array.from(unreadItems).map(async (el) => {
      const notifId = el.dataset.notifId;
      if (notifId) await markNotificationRead(notifId);
    }));
  });

  return unsub;
}

function buildNotifItem(notif) {
  const type = notif.type || (notif.contributionId ? 'contribution' : 'system');

  const TYPE_META = {
    invite:       { icon: '📩', iconClass: 'notif-item__icon--invite'   },
    admin:        { icon: '📢', iconClass: 'notif-item__icon--admin'    },
    payout:       { icon: '💰', iconClass: 'notif-item__icon--payout'   },
    meeting:      { icon: '📅', iconClass: 'notif-item__icon--meeting'  },
    contribution: { icon: '💰', iconClass: 'notif-item__icon--payout'   },
    system:       { icon: '⚙️', iconClass: 'notif-item__icon--system'   },
  };
  const meta     = TYPE_META[type] || TYPE_META.system;
  const isUnread = !notif.read;
  const ts       = notif.createdAt?.toDate ? timeAgo(notif.createdAt.toDate()) : '';
  const isInvite = (notif.type === 'invite' && notif.status === 'pending');

  const li = document.createElement('li');
  li.className       = `notif-item${isUnread ? ' notif-item--unread' : ''}`;
  li.dataset.notifId = notif.id;

  li.innerHTML = `
    <div class="notif-item__icon ${meta.iconClass}" aria-hidden="true">${meta.icon}</div>
    <div class="notif-item__body">
      <p class="notif-item__text">${notif.html || escapeHtml(notif.message || '')}</p>
      <p class="notif-item__meta">${ts}</p>
      ${isInvite ? `
        <div class="notif-item__actions">
          <button class="notif-item__btn notif-item__btn--accept"  data-invite-id="${notif.inviteId}" data-notif-id="${notif.id}">Accept</button>
          <button class="notif-item__btn notif-item__btn--decline" data-invite-id="${notif.inviteId}" data-notif-id="${notif.id}">Decline</button>
        </div>
      ` : ''}
    </div>
  `;

  if (isUnread) {
    li.addEventListener('click', async (e) => {
      if (e.target.tagName !== 'BUTTON') {
        await markNotificationRead(notif.id);
        li.classList.remove('notif-item--unread');
      }
    });
  }

  if (isInvite && currentUser) {
    const acceptBtn  = li.querySelector('.notif-item__btn--accept');
    const declineBtn = li.querySelector('.notif-item__btn--decline');

    acceptBtn?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const { inviteId, notifId } = e.currentTarget.dataset;
      try {
        await acceptInvite(inviteId, currentUser);
        await markNotificationRead(notifId);
        showToast({ type: 'success', title: 'Joined!', message: 'You have joined the group.' });
        setTimeout(() => window.location.reload(), 1500);
      } catch (err) {
        showToast({ type: 'error', title: 'Failed to accept', message: err.message });
      }
    });

    declineBtn?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const { inviteId, notifId } = e.currentTarget.dataset;
      try {
        await declineInvite(inviteId);
        await markNotificationRead(notifId);
        showToast({ type: 'warning', title: 'Invite declined', message: 'You declined the invitation.' });
        li.remove();
      } catch (err) {
        showToast({ type: 'error', title: 'Failed to decline', message: err.message });
      }
    });
  }

  return li;
}

/* ══════════════════════════════════════════════════════════
   INVITE BANNERS
   ══════════════════════════════════════════════════════════ */
async function showInviteBanners(user) {
  let invites = [];
  try {
    invites = await checkPendingInvites(user);
  } catch (err) {
    console.error('[Invites] Failed to load pending invites:', err);
    return;
  }
  if (!invites.length) return;

  for (const invite of invites) {
    await createNotification({
      userId:    user.uid,
      type:      'invite',
      message:   `You've been invited to join ${invite.groupName}`,
      html:      `📩 You've been invited to join <strong>${invite.groupName}</strong>`,
      groupName: invite.groupName,
      inviteId:  invite.id,
      status:    'pending',
    });

    const banner = document.createElement('div');
    banner.className = 'invite-banner';
    banner.setAttribute('role', 'alert');
    banner.innerHTML = `
      <p>📩 You've been invited to join <strong>${invite.groupName}</strong></p>
      <div class="invite-banner__actions">
        <button class="btn btn--primary btn--sm" data-action="accept">Accept</button>
        <button class="btn btn--outline btn--sm" data-action="decline">Decline</button>
      </div>`;

    banner.querySelector('[data-action="accept"]').addEventListener('click', async () => {
      try {
        await acceptInvite(invite.id, user);
        showToast({ type: 'success', title: `Joined ${invite.groupName}!`, message: 'Refreshing…', duration: 3000 });
        banner.remove();
        setTimeout(() => window.location.reload(), 1800);
      } catch (err) {
        showToast({ type: 'error', title: 'Could not accept invite', message: err.message });
      }
    });

    banner.querySelector('[data-action="decline"]').addEventListener('click', async () => {
      try {
        await declineInvite(invite.id);
        showToast({ type: 'warning', title: 'Invite declined', message: `You declined ${invite.groupName}.` });
        banner.remove();
      } catch (err) {
        showToast({ type: 'error', title: 'Could not decline invite', message: err.message });
      }
    });

    const notifRoot = el('notification-root') || document.body;
    notifRoot.appendChild(banner);
  }
}

/* ══════════════════════════════════════════════════════════
   MEETING REQUESTS WIDGET  (Admin / Treasurer only)

   Mounts into a container element with id="meeting-requests-widget-root"
   on the dashboard. Called from mountDashboardWidgets() below only when
   the user's role is Admin or Treasurer.

   Uses an onSnapshot query on meetingRequests where:
     groupId  == selectedGroupId   (scoped to current group)
     status   == 'pending'         (only unactioned requests)

   Each request card shows:
     • requesterName  — the member's name written at creation time
     • reason         — the member's free-text reason for the request
     • createdAt      — formatted relative timestamp

   The admin can Accept or Decline directly from the dashboard card.
   On action:
     • status        → 'accepted' | 'rejected'
     • actionedBy    → currentUser.uid
     • actionedAt    → serverTimestamp()
     • memberNotified → false  (reset so member sees outcome banner)

   The onSnapshot 'removed' event cleans up the card automatically
   because the query filters status == 'pending'.
   ══════════════════════════════════════════════════════════ */
export function mountMeetingRequestsWidget(container, groupId, role) {
  if (!container) return;
  if (role !== ROLES.ADMIN && role !== ROLES.TREASURER) {
    container.hidden = true;
    return;
  }

  container.hidden = false;

  // Build the widget shell
  container.innerHTML = `
    <section class="dashboard-card meeting-requests-widget" aria-labelledby="mr-widget-heading">
      <header class="meeting-requests-widget__header">
        <h3 id="mr-widget-heading" class="meeting-requests-widget__title">
          🗓 Meeting Requests
        </h3>
        <output
          id="mr-widget-badge"
          class="meeting-requests-widget__badge"
          aria-label="Pending meeting requests"
          hidden
        ></output>
      </header>
      <p id="mr-widget-empty" class="meeting-requests-widget__empty">
        No pending meeting requests.
      </p>
      <ul
        id="mr-widget-list"
        class="meeting-requests-widget__list"
        aria-live="polite"
        aria-relevant="additions removals"
      ></ul>
    </section>`;

  const listEl  = container.querySelector('#mr-widget-list');
  const emptyEl = container.querySelector('#mr-widget-empty');
  const badgeEl = container.querySelector('#mr-widget-badge');

  /* ── Helper: sync count badge + empty state ── */
  function syncUI() {
    const count = listEl.querySelectorAll('li').length;
    if (count > 0) {
      badgeEl.textContent = String(count);
      badgeEl.hidden      = false;
      emptyEl.hidden      = true;
    } else {
      badgeEl.hidden  = true;
      emptyEl.hidden  = false;
    }
  }

  /* ── Helper: build one request card as <li> ── */
  function buildRequestCard(request) {
    const li = document.createElement('li');
    li.className         = 'mr-widget-item';
    li.dataset.requestId = request.id;

    // Timestamp
    let tsText = '';
    if (request.createdAt?.toDate) {
      tsText = timeAgo(request.createdAt.toDate());
    }

    // Header row — member name + timestamp
    const cardHeader = document.createElement('header');
    cardHeader.className = 'mr-widget-item__header';

    const nameEl = document.createElement('p');
    nameEl.className   = 'mr-widget-item__name';
    nameEl.textContent = request.requesterName || 'A group member';

    const tsEl = document.createElement('time');
    tsEl.className = 'mr-widget-item__time';
    if (request.createdAt?.toDate) {
      tsEl.dateTime    = request.createdAt.toDate().toISOString();
      tsEl.textContent = tsText;
    }

    cardHeader.appendChild(nameEl);
    cardHeader.appendChild(tsEl);

    // Reason block
    const reasonEl = document.createElement('p');
    reasonEl.className   = 'mr-widget-item__reason';
    reasonEl.textContent = request.reason || '(No reason provided)';

    // Action buttons
    const actions = document.createElement('menu');
    actions.className = 'mr-widget-item__actions';

    const acceptLi  = document.createElement('li');
    const acceptBtn = document.createElement('button');
    acceptBtn.type        = 'button';
    acceptBtn.className   = 'mr-widget-item__btn mr-widget-item__btn--accept';
    acceptBtn.textContent = 'Accept';
    acceptBtn.setAttribute('aria-label',
      `Accept meeting request from ${request.requesterName || 'member'}`);

    const declineLi  = document.createElement('li');
    const declineBtn = document.createElement('button');
    declineBtn.type        = 'button';
    declineBtn.className   = 'mr-widget-item__btn mr-widget-item__btn--decline';
    declineBtn.textContent = 'Decline';
    declineBtn.setAttribute('aria-label',
      `Decline meeting request from ${request.requesterName || 'member'}`);

    // Accept handler
    acceptBtn.addEventListener('click', async () => {
      [acceptBtn, declineBtn].forEach(b => { b.disabled = true; });
      try {
        await updateDoc(doc(db, 'meetingRequests', request.id), {
          status:         'accepted',
          actionedBy:     currentUser.uid,
          actionedAt:     serverTimestamp(),
          memberNotified: false,
        });
        showToast({
          type:    'success',
          title:   'Request accepted',
          message: `${request.requesterName || 'Member'}'s meeting request has been accepted.`,
        });
        // Card removed automatically by onSnapshot 'removed' event
      } catch (err) {
        console.error('[MR Widget] Accept failed:', err);
        showToast({ type: 'error', title: 'Failed to accept', message: err.message });
        [acceptBtn, declineBtn].forEach(b => { b.disabled = false; });
      }
    });

    // Decline handler
    declineBtn.addEventListener('click', async () => {
      [acceptBtn, declineBtn].forEach(b => { b.disabled = true; });
      try {
        await updateDoc(doc(db, 'meetingRequests', request.id), {
          status:         'rejected',
          actionedBy:     currentUser.uid,
          actionedAt:     serverTimestamp(),
          memberNotified: false,
        });
        showToast({
          type:    'warning',
          title:   'Request declined',
          message: `${request.requesterName || 'Member'}'s meeting request has been declined.`,
        });
      } catch (err) {
        console.error('[MR Widget] Decline failed:', err);
        showToast({ type: 'error', title: 'Failed to decline', message: err.message });
        [acceptBtn, declineBtn].forEach(b => { b.disabled = false; });
      }
    });

    acceptLi.appendChild(acceptBtn);
    declineLi.appendChild(declineBtn);
    actions.appendChild(acceptLi);
    actions.appendChild(declineLi);

    li.appendChild(cardHeader);
    li.appendChild(reasonEl);
    li.appendChild(actions);
    return li;
  }

  /* ── Real-time listener ── */
  if (unsubMeetingRequests) unsubMeetingRequests();

  const q = query(
    collection(db, 'meetingRequests'),
    where('groupId', '==', groupId),
    where('status',  '==', 'pending'),
    orderBy('createdAt', 'asc')
  );

  unsubMeetingRequests = onSnapshot(q, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      const request = { id: change.doc.id, ...change.doc.data() };

      if (change.type === 'added') {
        listEl.appendChild(buildRequestCard(request));
      }

      if (change.type === 'removed') {
        listEl.querySelector(`[data-request-id="${request.id}"]`)?.remove();
      }
    });
    syncUI();
  }, (err) => {
    console.error('[MR Widget] Listener error:', err);
  });

  return () => { if (unsubMeetingRequests) unsubMeetingRequests(); };
}

/* ══════════════════════════════════════════════════════════
   MEMBERS LOADER
   ══════════════════════════════════════════════════════════ */
async function loadMembers(groupId, groupName) {
  const memberlist         = el('memberlist');
  const membersBlock       = el('members-list-block');
  const currentGroupNameEl = el('current-group-name');

  if (!memberlist) return;
  memberlist.innerHTML = '<li>Loading members...</li>';
  if (membersBlock)       membersBlock.style.display = 'block';
  if (currentGroupNameEl) currentGroupNameEl.textContent = groupName;

  try {
    const membersSnap = await getDocs(collection(db, `groups/${groupId}/members`));
    memberlist.innerHTML = '';

    const memberPromises = membersSnap.docs.map(async (docSnap) => {
      const memberData = docSnap.data();
      let displayName = memberData.displayName || 'User ' + docSnap.id.substring(0, 5);
      try {
        const userSnap = await getDocs(query(
          collection(db, COLLECTIONS.USERS),
          where('__name__', '==', docSnap.id),
          limit(1)
        ));
        if (!userSnap.empty) {
          const ud = userSnap.docs[0].data();
          displayName = ud.displayName || ud.name || ud.email || displayName;
        }
      } catch { /* silent */ }
      return { displayName, role: memberData.role };
    });

    const members = await Promise.all(memberPromises);
    members.forEach(member => {
      const li        = document.createElement('li');
      const nameSpan  = document.createElement('span');
      nameSpan.textContent = member.displayName;
      const roleBadge = document.createElement('small');
      roleBadge.className   = 'badge';
      roleBadge.textContent = member.role;
      li.appendChild(nameSpan);
      li.appendChild(document.createTextNode(' '));
      li.appendChild(roleBadge);
      memberlist.appendChild(li);
    });
  } catch (err) {
    console.error('[Members]', err);
    memberlist.innerHTML = '<li>Error loading members</li>';
  }
}

/* ══════════════════════════════════════════════════════════
   GROUPS LOADER
   ══════════════════════════════════════════════════════════ */
async function loadGroups(uid) {
  const grouplist = el('grouplist');
  if (!grouplist) return [];

  const groups = await getUserGroups(uid);
  grouplist.innerHTML = '';

  const rolesSettled = await Promise.allSettled(
    groups.map(g => getUserRoleInGroup(g.id, uid))
  );

  groups.forEach((group, idx) => {
    const role    = rolesSettled[idx].status === 'fulfilled' ? rolesSettled[idx].value : null;
    const isAdmin = role?.toLowerCase() === ROLES.ADMIN.toLowerCase();

    const li     = document.createElement('li');
    li.className = 'group-list-item';

    const button = document.createElement('button');
    button.type            = 'button';
    button.className       = 'group-list-btn';
    button.dataset.groupId = group.id;

    const nameSpan = document.createElement('span');
    nameSpan.className   = 'group-list-btn__name';
    nameSpan.textContent = group.name;
    button.appendChild(nameSpan);

    if (isAdmin) {
      const adminBadge = document.createElement('span');
      adminBadge.className   = 'group-list-btn__admin-badge';
      adminBadge.textContent = 'Admin';
      adminBadge.setAttribute('aria-label', 'You are admin of this group');
      button.appendChild(adminBadge);
    }

    button.onclick = async () => {
      grouplist.querySelectorAll('.group-list-btn').forEach(b => b.classList.remove('group-list-btn--active'));
      button.classList.add('group-list-btn--active');

      selectedGroupId = group.id;
      userRole        = role || await getUserRoleInGroup(group.id, uid);
      await loadMembers(group.id, group.name);

      if (window.loadDashboardData && window.renderSAWidget) {
        const balance = await window.loadDashboardData(currentUser, group.id);
        await window.renderSAWidget(balance);
        if (window.wireRefreshButton) window.wireRefreshButton(balance);
      }

      startMeetingListener([group.id]);
      await loadPayoutWidget(uid, [group.id]);

      // Re-mount the meeting requests widget for the newly selected group
      const mrContainer = el('meeting-requests-widget-root');
      if (mrContainer) mountMeetingRequestsWidget(mrContainer, group.id, userRole);
    };

    li.appendChild(button);
    grouplist.appendChild(li);
  });

  return groups.map(g => g.id);
}

/* ══════════════════════════════════════════════════════════
   INVITE FORM HANDLER
   ══════════════════════════════════════════════════════════ */
const inviteForm = document.getElementById('invite-form');
if (inviteForm) {
  inviteForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const inviteMessage = el('inviteMessage');
    const email = document.getElementById('inviteEmail')?.value.trim();

    if (!selectedGroupId) {
      if (inviteMessage) inviteMessage.textContent = 'Please select a group first.';
      return;
    }
    if (userRole?.toLowerCase() !== ROLES.ADMIN.toLowerCase()) {
      if (inviteMessage) inviteMessage.textContent = 'Only admins can invite members.';
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      if (inviteMessage) inviteMessage.textContent = 'Please enter a valid email address.';
      return;
    }

    try {
      if (inviteMessage) inviteMessage.textContent = 'Sending invite…';
      const result = await sendInvite(selectedGroupId, email, auth.currentUser.uid);

      if (result?.targetUserId) {
        const groupDetails = await getGroupDetails(selectedGroupId);
        await createNotification({
          userId:    result.targetUserId,
          type:      'invite',
          message:   `You've been invited to join ${groupDetails?.name || 'a group'}`,
          html:      `📩 You've been invited to join <strong>${groupDetails?.name || 'a group'}</strong>`,
          groupName: groupDetails?.name,
          inviteId:  result.inviteId,
          status:    'pending',
        });
      }

      if (inviteMessage) inviteMessage.textContent = '✅ Invite sent!';
      inviteForm.reset();
      setTimeout(() => { if (inviteMessage) inviteMessage.textContent = ''; }, 3000);
    } catch (err) {
      const inviteMessage = el('inviteMessage');
      if (inviteMessage) inviteMessage.textContent = '❌ ' + err.message;
    }
  });
}

/* ══════════════════════════════════════════════════════════
   MEETINGS WIDGET
   ══════════════════════════════════════════════════════════ */
function buildMeetingWidget(meeting) {
  const d  = new Date(meeting.date);
  const li = document.createElement('li');
  li.className = 'meeting-widget-item';

  const timeEl   = document.createElement('time');
  timeEl.className = 'meeting-widget-date';
  const strongEl = document.createElement('strong');
  strongEl.textContent = String(d.getDate());
  const spanEl   = document.createElement('span');
  spanEl.textContent = d.toLocaleString('en-ZA', { month: 'short' }).toUpperCase();
  timeEl.appendChild(strongEl);
  timeEl.appendChild(spanEl);

  const infoEl  = document.createElement('div');
  infoEl.className = 'meeting-widget-info';
  const titleEl = document.createElement('p');
  titleEl.className   = 'meeting-widget-title';
  titleEl.textContent = (meeting.title || meeting.agenda?.split('\n')[0] || 'Untitled').substring(0, 50);
  const metaEl  = document.createElement('small');
  metaEl.className   = 'meeting-widget-meta';
  metaEl.textContent = `${meeting.time ? fmtTime(meeting.time) : ''}${meeting.location ? ' · ' + meeting.location : ''}`;
  infoEl.appendChild(titleEl);
  infoEl.appendChild(metaEl);

  li.appendChild(timeEl);
  li.appendChild(infoEl);
  return li;
}

function startMeetingListener(groupIds) {
  if (unsubMeetings) unsubMeetings();
  const meetingsContainer = el('meetings-container');
  if (!meetingsContainer) return;

  if (!groupIds.length) {
    meetingsContainer.innerHTML = '<p class="meetings-widget-empty">No upcoming meetings.</p>';
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const q = query(
    collection(db, COLLECTIONS.MEETINGS),
    where('groupId', 'in', groupIds.slice(0, 10)),
    where('date', '>=', today),
    orderBy('date', 'asc'),
    limit(5)
  );

  unsubMeetings = onSnapshot(q, (snapshot) => {
    const meetings = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    if (!meetings.length) {
      meetingsContainer.innerHTML = '<p class="meetings-widget-empty">No upcoming meetings.</p>';
      return;
    }
    const ul = document.createElement('ul');
    ul.className = 'meeting-widget-list';
    meetings.forEach(m => ul.appendChild(buildMeetingWidget(m)));
    meetingsContainer.innerHTML = '';
    meetingsContainer.appendChild(ul);
  });
}

/* ══════════════════════════════════════════════════════════
   CONTRIBUTIONS WIDGET
   ══════════════════════════════════════════════════════════ */
function startContributionListener(uid, groupMap) {
  if (unsubContributions) unsubContributions();
  const contributionsContainer = el('contributions-container');
  const statMyContributions    = el('stat-my-contributions');
  if (!contributionsContainer) return;

  const q = query(
    collection(db, COLLECTIONS.CONTRIBUTIONS),
    where('userId', '==', uid),
    orderBy('date', 'desc'),
    limit(10)
  );

  unsubContributions = onSnapshot(q, (snapshot) => {
    const contributions = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    if (!contributions.length) {
      contributionsContainer.innerHTML = '<p class="widget-empty">No contributions.</p>';
      return;
    }

    const ul = document.createElement('ul');
    ul.className = 'contribution-widget-list';
    contributions.slice(0, 5).forEach(c => {
      const li      = document.createElement('li');
      li.className  = 'contribution-widget-item';
      const infoDiv = document.createElement('div');
      infoDiv.className = 'contribution-widget-info';
      const amountP = document.createElement('p');
      amountP.className   = 'contribution-widget-amount';
      amountP.textContent = `R ${c.amount}`;
      const metaSmall = document.createElement('small');
      metaSmall.textContent = `${groupMap[c.groupId] || 'Group'} · ${fmtDate(c.date)}`;
      infoDiv.appendChild(amountP);
      infoDiv.appendChild(metaSmall);
      li.appendChild(infoDiv);
      ul.appendChild(li);
    });
    contributionsContainer.innerHTML = '';
    contributionsContainer.appendChild(ul);

    const confirmed   = contributions.filter(c => c.status === 'confirmed');
    const totalAmount = confirmed.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
    if (statMyContributions) statMyContributions.textContent = fmtRand(totalAmount);
  });
}

/* ══════════════════════════════════════════════════════════
   PAYOUT WIDGET
   ══════════════════════════════════════════════════════════ */
async function loadPayoutWidget(uid, groupIds) {
  const payoutContainer = el('payout-container');
  const statPayout      = el('stat-payout');
  const statPayoutName  = el('stat-payout-name');
  const payoutViewAll   = el('payout-view-all');

  if (!payoutContainer) return;
  if (!groupIds.length) {
    payoutContainer.innerHTML = '<p class="widget-empty">Join a group to see payout schedules.</p>';
    return;
  }

  try {
    let payouts       = [];
    let activeGroupId = null;

    for (const gid of groupIds.slice(0, 5)) {
      const snap = await getDocs(query(
        collection(db, COLLECTIONS.PAYOUTS),
        where('groupId', '==', gid),
        orderBy('order', 'asc')
      ));
      if (!snap.empty) {
        payouts = snap.docs.map(d => {
          const data = d.data();
          if (data.payoutDate?.toDate) data.payoutDate = data.payoutDate.toDate().toISOString().slice(0, 10);
          return { id: d.id, ...data };
        });
        activeGroupId = gid;
        break;
      }
    }

    if (!payouts.length) {
      payoutContainer.innerHTML = '<p class="widget-empty">No payout schedule set up yet.</p>';
      return;
    }

    if (payoutViewAll && activeGroupId) payoutViewAll.href = 'contributions-payout.html?groupId=' + activeGroupId;

    const today    = new Date().toISOString().slice(0, 10);
    const upcoming = payouts.find(p => p.payoutDate >= today);
    if (upcoming) {
      if (statPayout)     statPayout.textContent     = fmtDate(upcoming.payoutDate);
      if (statPayoutName) statPayoutName.textContent = upcoming.userDisplayName + "'s turn";
    }

    const ul = document.createElement('ul');
    ul.className = 'payout-widget-list';

    payouts.forEach(p => {
      const isCurrentUser = p.userId === uid;
      const li = document.createElement('li');
      li.className = 'payout-widget-item' + (isCurrentUser ? ' payout-widget-item--you' : '');

      const orderDiv = document.createElement('div');
      orderDiv.className   = 'payout-widget-order';
      orderDiv.textContent = `#${p.order}`;

      const infoDiv   = document.createElement('div');
      infoDiv.className = 'payout-widget-info';
      const nameP     = document.createElement('p');
      nameP.className   = 'payout-widget-name';
      nameP.textContent = p.userDisplayName + (isCurrentUser ? ' (You)' : '');
      const dateSmall = document.createElement('small');
      dateSmall.className   = 'payout-widget-date';
      dateSmall.textContent = fmtDate(p.payoutDate);
      infoDiv.appendChild(nameP);
      infoDiv.appendChild(dateSmall);

      const amountDiv = document.createElement('div');
      amountDiv.className   = 'payout-widget-amount';
      amountDiv.textContent = fmtRand(p.amount);

      li.appendChild(orderDiv);
      li.appendChild(infoDiv);
      li.appendChild(amountDiv);
      ul.appendChild(li);
    });

    payoutContainer.innerHTML = '';
    payoutContainer.appendChild(ul);
  } catch (err) {
    console.error('[Payout Widget] Error:', err);
  }
}

/* ══════════════════════════════════════════════════════════
   CHAT BOT UI  — Gemini Agent version
   ══════════════════════════════════════════════════════════ */
export function mountChatWidget() {
  if (!document.getElementById('chat-widget-styles')) {
    const style = document.createElement('style');
    style.id = 'chat-widget-styles';
    style.textContent = `
      .chat-fab {
        position: fixed; bottom: 1.5rem; right: 1.5rem; z-index: 1000;
        width: 3.5rem; height: 3.5rem; border-radius: 50%;
        background: var(--color-primary, #16a34a); color: #fff;
        border: none; cursor: pointer; display: flex; align-items: center;
        justify-content: center; font-size: 1.4rem;
        box-shadow: 0 4px 20px rgba(0,0,0,0.25);
        transition: transform 0.2s ease, box-shadow 0.2s ease;
      }
      .chat-fab:hover  { transform: scale(1.08); box-shadow: 0 6px 24px rgba(0,0,0,0.3); }
      .chat-fab:active { transform: scale(0.96); }
      .chat-fab__badge {
        position: absolute; top: -4px; right: -4px;
        background: #ef4444; color: #fff; font-size: 0.65rem; font-weight: 700;
        line-height: 1; padding: 2px 5px; border-radius: 999px; display: none;
      }
      .chat-fab__badge--show { display: block; }
      .chat-panel {
        position: fixed; bottom: 5.5rem; right: 1.5rem; z-index: 999;
        width: min(420px, calc(100vw - 2rem));
        height: min(560px, calc(100dvh - 7rem));
        background: var(--color-surface, #fff);
        border: 1px solid var(--color-border, #e5e7eb);
        border-radius: 1.25rem; box-shadow: 0 8px 40px rgba(0,0,0,0.18);
        display: flex; flex-direction: column; overflow: hidden;
        transform: translateY(16px) scale(0.97); opacity: 0; pointer-events: none;
        transition: transform 0.22s cubic-bezier(0.34,1.56,0.64,1), opacity 0.18s ease;
      }
      .chat-panel--open { transform: translateY(0) scale(1); opacity: 1; pointer-events: auto; }
      .chat-panel__header {
        display: flex; align-items: center; gap: 0.65rem; padding: 0.9rem 1rem;
        background: var(--color-primary, #16a34a); color: #fff; flex-shrink: 0;
      }
      .chat-panel__avatar {
        width: 2rem; height: 2rem; border-radius: 50%;
        background: rgba(255,255,255,0.25); display: flex;
        align-items: center; justify-content: center; font-size: 1rem; flex-shrink: 0;
      }
      .chat-panel__title { font-size: 0.95rem; font-weight: 600; flex: 1; }
      .chat-panel__subtitle { font-size: 0.72rem; opacity: 0.82; }
      .chat-panel__agent-badge {
        font-size: 0.65rem; font-weight: 700; background: rgba(255,255,255,0.2);
        border: 1px solid rgba(255,255,255,0.4); border-radius: 999px;
        padding: 2px 8px; letter-spacing: 0.04em; flex-shrink: 0;
      }
      .chat-panel__close {
        background: none; border: none; color: #fff; cursor: pointer;
        padding: 0.25rem; border-radius: 0.4rem; line-height: 1; font-size: 1.1rem;
        opacity: 0.8; transition: opacity 0.15s; flex-shrink: 0;
      }
      .chat-panel__close:hover { opacity: 1; }
      .chat-panel__messages {
        flex: 1; overflow-y: auto; padding: 1rem;
        display: flex; flex-direction: column; gap: 0.65rem;
        scroll-behavior: smooth; overscroll-behavior: contain;
      }
      .chat-panel__messages::-webkit-scrollbar { width: 4px; }
      .chat-panel__messages::-webkit-scrollbar-track { background: transparent; }
      .chat-panel__messages::-webkit-scrollbar-thumb { background: var(--color-border, #d1d5db); border-radius: 4px; }
      .chat-msg { display: flex; gap: 0.5rem; align-items: flex-end; animation: chat-msg-in 0.2s ease both; }
      @keyframes chat-msg-in { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
      .chat-msg--user { flex-direction: row-reverse; }
      .chat-msg__bubble {
        max-width: 78%; padding: 0.6rem 0.85rem; border-radius: 1rem;
        font-size: 0.875rem; line-height: 1.5; word-break: break-word;
      }
      .chat-msg--bot  .chat-msg__bubble { background: var(--color-surface-2, #f3f4f6); color: var(--color-text, #111827); border-bottom-left-radius: 0.25rem; }
      .chat-msg--user .chat-msg__bubble { background: var(--color-primary, #16a34a); color: #fff; border-bottom-right-radius: 0.25rem; }
      .chat-msg__avatar {
        width: 1.75rem; height: 1.75rem; border-radius: 50%;
        background: var(--color-primary, #16a34a); color: #fff;
        font-size: 0.8rem; display: flex; align-items: center;
        justify-content: center; flex-shrink: 0; align-self: flex-end;
      }
      .chat-msg--user .chat-msg__avatar { background: var(--color-border, #d1d5db); color: var(--color-text-muted, #6b7280); }
      .chat-msg__time { font-size: 0.68rem; color: var(--color-text-muted, #9ca3af); text-align: right; margin-top: 0.15rem; }
      .chat-thinking { display: flex; gap: 0.5rem; align-items: flex-end; }
      .chat-thinking__bubble {
        display: flex; flex-direction: column; gap: 4px; padding: 0.65rem 0.85rem;
        background: var(--color-surface-2, #f3f4f6); border-radius: 1rem; border-bottom-left-radius: 0.25rem;
        font-size: 0.78rem; color: var(--color-text-muted, #6b7280);
      }
      .chat-thinking__dots { display: flex; gap: 4px; }
      .chat-thinking__dot {
        width: 7px; height: 7px; border-radius: 50%;
        background: var(--color-text-muted, #9ca3af);
        animation: typing-bounce 1.2s ease-in-out infinite;
      }
      .chat-thinking__dot:nth-child(2) { animation-delay: 0.2s; }
      .chat-thinking__dot:nth-child(3) { animation-delay: 0.4s; }
      @keyframes typing-bounce { 0%,60%,100% { transform:translateY(0); } 30% { transform:translateY(-5px); } }
      .chat-thinking__label { font-size: 0.72rem; opacity: 0.75; }
      .chat-panel__footer {
        display: flex; gap: 0.5rem; padding: 0.75rem 1rem;
        border-top: 1px solid var(--color-border, #e5e7eb);
        background: var(--color-surface, #fff); flex-shrink: 0;
      }
      .chat-panel__input {
        flex: 1; border: 1px solid var(--color-border, #d1d5db);
        border-radius: 1.5rem; padding: 0.55rem 1rem; font-size: 0.875rem;
        outline: none; resize: none; font-family: inherit; line-height: 1.4;
        max-height: 120px; overflow-y: auto;
        background: var(--color-surface-2, #f9fafb);
        transition: border-color 0.15s; color: var(--color-text, #111827);
      }
      .chat-panel__input:focus { border-color: var(--color-primary, #16a34a); background: var(--color-surface, #fff); }
      .chat-panel__send {
        width: 2.4rem; height: 2.4rem; border-radius: 50%;
        background: var(--color-primary, #16a34a); color: #fff; border: none;
        cursor: pointer; display: flex; align-items: center; justify-content: center;
        font-size: 1rem; flex-shrink: 0; align-self: flex-end;
        transition: background 0.15s, transform 0.1s;
      }
      .chat-panel__send:hover    { background: var(--color-primary-dark, #15803d); }
      .chat-panel__send:active   { transform: scale(0.93); }
      .chat-panel__send:disabled { opacity: 0.5; cursor: not-allowed; }
      .chat-welcome {
        display: flex; flex-direction: column; align-items: center;
        justify-content: center; gap: 0.5rem; height: 100%;
        color: var(--color-text-muted, #6b7280); text-align: center; padding: 1.5rem;
      }
      .chat-welcome__icon { font-size: 2.5rem; }
      .chat-welcome__title { font-size: 0.95rem; font-weight: 600; color: var(--color-text, #374151); }
      .chat-welcome__sub { font-size: 0.82rem; }
      .chat-welcome__chips { display: flex; flex-wrap: wrap; gap: 0.4rem; justify-content: center; margin-top: 0.5rem; }
      .chat-welcome__chip {
        background: var(--color-surface-2, #f3f4f6);
        border: 1px solid var(--color-border, #e5e7eb); border-radius: 1rem;
        padding: 0.35rem 0.75rem; font-size: 0.78rem; cursor: pointer; transition: background 0.15s;
      }
      .chat-welcome__chip:hover { background: var(--color-primary-light, #dcfce7); border-color: var(--color-primary, #16a34a); }
      @media (max-width: 480px) {
        .chat-panel { bottom: 0; right: 0; width: 100vw; height: 100dvh; border-radius: 0; }
        .chat-fab   { bottom: 1rem; right: 1rem; }
      }
    `;
    document.head.appendChild(style);
  }

  const fab = document.createElement('button');
  fab.className = 'chat-fab';
  fab.setAttribute('aria-label', 'Open AI assistant');
  fab.setAttribute('aria-expanded', 'false');
  fab.innerHTML = `🤖<span class="chat-fab__badge" id="chat-fab-badge">1</span>`;

  const panel = document.createElement('div');
  panel.className = 'chat-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'AI assistant');
  panel.innerHTML = `
    <div class="chat-panel__header">
      <div class="chat-panel__avatar">🌿</div>
      <div style="flex:1;min-width:0">
        <div class="chat-panel__title">Stokpal Assistant</div>
        <div class="chat-panel__subtitle">Powered by Gemini · Live data access</div>
      </div>
      <span class="chat-panel__agent-badge">AGENT</span>
      <button class="chat-panel__close" aria-label="Close chat">✕</button>
    </div>
    <div class="chat-panel__messages" id="chat-messages" role="log" aria-live="polite">
      <div class="chat-welcome" id="chat-welcome">
        <div class="chat-welcome__icon">🌿</div>
        <p class="chat-welcome__title">Hi! I'm your Stokpal AI Agent.</p>
        <p class="chat-welcome__sub">I can look up your real group data — balances, payouts, meetings, and more.</p>
        <div class="chat-welcome__chips">
          <button class="chat-welcome__chip" data-prompt="What is our group balance?">💰 Group balance</button>
          <button class="chat-welcome__chip" data-prompt="When is the next payout and whose turn is it?">📅 Next payout</button>
          <button class="chat-welcome__chip" data-prompt="Show me my contribution history">📋 My contributions</button>
          <button class="chat-welcome__chip" data-prompt="When is the next meeting?">🗓 Next meeting</button>
          <button class="chat-welcome__chip" data-prompt="Who are the members of my group?">👥 Members</button>
        </div>
      </div>
    </div>
    <div class="chat-panel__footer">
      <textarea
        class="chat-panel__input"
        id="chat-input"
        rows="1"
        placeholder="Ask anything about your stokvel…"
        aria-label="Chat message"
      ></textarea>
      <button class="chat-panel__send" id="chat-send" aria-label="Send message">➤</button>
    </div>
  `;

  document.body.appendChild(fab);
  document.body.appendChild(panel);

  const messagesEl = panel.querySelector('#chat-messages');
  const inputEl    = panel.querySelector('#chat-input');
  const sendBtn    = panel.querySelector('#chat-send');
  const closeBtn   = panel.querySelector('.chat-panel__close');
  const welcomeEl  = panel.querySelector('#chat-welcome');
  const badgeEl    = fab.querySelector('#chat-fab-badge');

  let isOpen      = false;
  let isStreaming = false;
  let chatHistory = [];

  badgeEl.classList.add('chat-fab__badge--show');

  function openPanel() {
    isOpen = true;
    panel.classList.add('chat-panel--open');
    fab.setAttribute('aria-expanded', 'true');
    badgeEl.classList.remove('chat-fab__badge--show');
    inputEl.focus();
    scrollToBottom(false);
  }

  function closePanel() {
    isOpen = false;
    panel.classList.remove('chat-panel--open');
    fab.setAttribute('aria-expanded', 'false');
  }

  fab.addEventListener('click', () => isOpen ? closePanel() : openPanel());
  closeBtn.addEventListener('click', closePanel);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen) closePanel(); });

  function scrollToBottom(smooth = true) {
    requestAnimationFrame(() => {
      messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: smooth ? 'smooth' : 'instant' });
    });
  }

  inputEl.addEventListener('input', () => {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
  });

  function nowLabel() {
    return new Date().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
  }

  function removeWelcome() {
    if (welcomeEl && welcomeEl.parentNode === messagesEl) welcomeEl.remove();
  }

  function appendMessage(role, text) {
    removeWelcome();
    const wrap = document.createElement('div');
    wrap.className = `chat-msg chat-msg--${role === 'user' ? 'user' : 'bot'}`;
    wrap.innerHTML = `
      <div class="chat-msg__avatar">${role === 'user' ? '👤' : '🌿'}</div>
      <div>
        <div class="chat-msg__bubble">${escapeHtml(text).replace(/\n/g, '<br>')}</div>
        <div class="chat-msg__time">${nowLabel()}</div>
      </div>`;
    messagesEl.appendChild(wrap);
    scrollToBottom();
    return wrap;
  }

  function showThinking(label = 'Thinking…') {
    removeWelcome();
    const wrap = document.createElement('div');
    wrap.className = 'chat-thinking';
    wrap.id        = 'chat-thinking-indicator';
    wrap.innerHTML = `
      <div class="chat-msg__avatar">🌿</div>
      <div class="chat-thinking__bubble">
        <div class="chat-thinking__dots">
          <div class="chat-thinking__dot"></div>
          <div class="chat-thinking__dot"></div>
          <div class="chat-thinking__dot"></div>
        </div>
        <span class="chat-thinking__label" id="chat-thinking-label">${label}</span>
      </div>`;
    messagesEl.appendChild(wrap);
    scrollToBottom();
    return wrap;
  }

  function updateThinkingLabel(label) {
    const labelEl = document.getElementById('chat-thinking-label');
    if (labelEl) labelEl.textContent = label;
  }

  function removeThinking() {
    document.getElementById('chat-thinking-indicator')?.remove();
  }

  const CHAT_PROXY = '/api/chat';

  async function sendMessage(text) {
    text = text.trim();
    if (!text || isStreaming) return;

    isStreaming       = true;
    sendBtn.disabled  = true;
    inputEl.value     = '';
    inputEl.style.height = 'auto';

    chatHistory.push({ role: 'user', content: text });
    appendMessage('user', text);

    const userName  = currentUser?.displayName || currentUser?.email || 'a member';
    const systemCtx = [
      `You are a helpful AI agent for Stokpal, a South African stokvel management app.`,
      `The user is ${userName}.`,
      `Always use your available tools to fetch live data before answering questions about balances,`,
      `payouts, meetings, contributions, or members. Never say you cannot access the data.`,
      `Amounts are in South African Rand (ZAR). Be concise, warm, and helpful.`,
      `Format currency as "R X,XXX" — e.g. "R 4,200".`,
    ].join(' ');

    showThinking('Thinking…');
    const thinkingTimer = setTimeout(() => updateThinkingLabel('Checking your data…'), 1500);

    try {
      const res = await fetch(CHAT_PROXY, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system:   systemCtx,
          messages: chatHistory,
          groupId:  selectedGroupId,
          uid:      currentUser?.uid || null,
          groupIds: allGroupIds,
        }),
      });

      clearTimeout(thinkingTimer);
      removeThinking();

      if (!res.ok) {
        let friendlyMsg = 'Something went wrong. Please try again.';
        if (res.status === 401 || res.status === 403) friendlyMsg = '🔑 Authentication error — the API key needs to be configured on the server.';
        else if (res.status === 429) friendlyMsg = '⏳ Too many requests — please wait a moment and try again.';
        else if (res.status >= 500) friendlyMsg = '🛠 The assistant server is having issues. Try again shortly.';
        appendMessage('bot', friendlyMsg);
        chatHistory.pop();
      } else {
        const data  = await res.json();
        const reply = data.content?.map(b => b.text || '').join('') || "Sorry, I didn't get a response.";
        chatHistory.push({ role: 'assistant', content: reply });
        appendMessage('bot', reply);
      }
    } catch (err) {
      clearTimeout(thinkingTimer);
      removeThinking();
      const msg = !navigator.onLine
        ? '📶 You appear to be offline. Please check your connection.'
        : '⚠️ Could not reach the assistant. Make sure your server is running.';
      appendMessage('bot', msg);
      chatHistory.pop();
      console.warn('[Agent Chat] Fetch failed:', err.message);
    } finally {
      isStreaming      = false;
      sendBtn.disabled = false;
      inputEl.focus();
    }
  }

  sendBtn.addEventListener('click', () => sendMessage(inputEl.value));
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(inputEl.value); }
  });
  panel.querySelectorAll('.chat-welcome__chip').forEach(chip => {
    chip.addEventListener('click', () => { if (chip.dataset.prompt) sendMessage(chip.dataset.prompt); });
  });
}

/* ══════════════════════════════════════════════════════════
   AUTH STATE HANDLER
   ══════════════════════════════════════════════════════════ */
auth.onAuthStateChanged(async (user) => {
  if (!user) return;
  currentUser = user;

  await showInviteBanners(user);

  const groupIds     = await loadGroups(user.uid);
  allGroupIds        = groupIds;

  const groupDetails = await Promise.all(groupIds.map(id => getGroupDetails(id)));
  const groupMap     = {};
  groupIds.forEach((id, i) => { if (groupDetails[i]) groupMap[id] = groupDetails[i].name; });

  // Determine role for the first group (default selectedGroupId)
  if (groupIds.length > 0) {
    selectedGroupId = groupIds[0];
    try {
      userRole = await getUserRoleInGroup(selectedGroupId, user.uid);
    } catch (_) { userRole = null; }
  }

  startMeetingListener(groupIds);
  startContributionListener(user.uid, groupMap);
  await loadPayoutWidget(user.uid, groupIds);

  /*
    Mount the meeting requests widget if the user is Admin or Treasurer.
    The container element must exist in dashboard.html:
      <section id="meeting-requests-widget-root" hidden></section>
    mountMeetingRequestsWidget() removes [hidden] for eligible roles.
  */
  const mrContainer = el('meeting-requests-widget-root');
  if (mrContainer && selectedGroupId) {
    mountMeetingRequestsWidget(mrContainer, selectedGroupId, userRole);
  }

  mountChatWidget();
});