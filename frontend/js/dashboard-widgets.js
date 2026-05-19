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
  doc,
  getDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  getDocs,
  addDoc,
  serverTimestamp,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { COLLECTIONS, ROLES } from "./constants.js";

/* ══════════════════════════════════════════════════════════
   MODULE-LEVEL STATE
   ══════════════════════════════════════════════════════════ */
let selectedGroupId    = null;
let allGroupIds        = [];
let userRole           = null;
let currentUser        = null;
let unsubMeetings      = null;
let unsubContributions = null;

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
      window.selectedGroupId = group.id;
      userRole        = role || await getUserRoleInGroup(group.id, uid);
      await loadMembers(group.id, group.name);

      if (window.loadDashboardData && window.renderSAWidget) {
        const balance = await window.loadDashboardData(currentUser, group.id);
        await window.renderSAWidget(balance);
        if (window.wireRefreshButton) window.wireRefreshButton(balance);
      }

      startMeetingListener([group.id]);
      await loadPayoutWidget(uid, [group.id]);
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
   CLIENT‑SIDE CHAT WIDGET (group‑aware, no dashboard selection needed)
   ══════════════════════════════════════════════════════════ */
export function mountChatWidget() {
  // Remove any existing widget to avoid duplicates
  const oldFab = document.querySelector('.chat-fab');
  const oldPanel = document.querySelector('.chat-panel');
  if (oldFab) oldFab.remove();
  if (oldPanel) oldPanel.remove();

  // Inject styles (only once)
  if (!document.getElementById('chat-widget-styles-client')) {
    const style = document.createElement('style');
    style.id = 'chat-widget-styles-client';
    style.textContent = `
      .chat-fab {
        position: fixed; bottom: 1.5rem; right: 1.5rem; z-index: 10000;
        width: 3.5rem; height: 3.5rem; border-radius: 50%;
        background: var(--color-primary, #16a34a); color: #fff;
        border: none; cursor: pointer; display: flex; align-items: center;
        justify-content: center; font-size: 1.4rem;
        box-shadow: 0 4px 20px rgba(0,0,0,0.25);
        transition: transform 0.2s ease;
      }
      .chat-fab:hover { transform: scale(1.08); }
      .chat-panel {
        position: fixed; bottom: 5.5rem; right: 1.5rem; z-index: 9999;
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
        align-items: center; justify-content: center; font-size: 1rem;
      }
      .chat-panel__title { font-size: 0.95rem; font-weight: 600; flex: 1; }
      .chat-panel__close {
        background: none; border: none; color: #fff; cursor: pointer;
        font-size: 1.1rem; opacity: 0.8;
      }
      .chat-panel__messages {
        flex: 1; overflow-y: auto; padding: 1rem;
        display: flex; flex-direction: column; gap: 0.65rem;
      }
      .chat-msg { display: flex; gap: 0.5rem; align-items: flex-end; }
      .chat-msg--user { flex-direction: row-reverse; }
      .chat-msg__bubble {
        max-width: 78%; padding: 0.6rem 0.85rem; border-radius: 1rem;
        font-size: 0.875rem; line-height: 1.5;
      }
      .chat-msg--bot .chat-msg__bubble {
        background: var(--color-surface-2, #f3f4f6);
        border-bottom-left-radius: 0.25rem;
      }
      .chat-msg--user .chat-msg__bubble {
        background: var(--color-primary, #16a34a); color: #fff;
        border-bottom-right-radius: 0.25rem;
      }
      .chat-msg__avatar {
        width: 1.75rem; height: 1.75rem; border-radius: 50%;
        background: var(--color-primary, #16a34a); color: #fff;
        font-size: 0.8rem; display: flex; align-items: center;
        justify-content: center; flex-shrink: 0;
      }
      .chat-msg--user .chat-msg__avatar { background: var(--color-border, #d1d5db); color: #6b7280; }
      .chat-msg__time { font-size: 0.68rem; color: #9ca3af; text-align: right; margin-top: 0.15rem; }
      .chat-thinking {
        display: flex; gap: 0.5rem; align-items: center;
        padding: 0.65rem 0.85rem;
        background: var(--color-surface-2, #f3f4f6);
        border-radius: 1rem; border-bottom-left-radius: 0.25rem;
        width: fit-content;
      }
      .chat-thinking__dot {
        width: 7px; height: 7px; border-radius: 50%;
        background: #9ca3af; animation: pulse 1.2s ease infinite;
        display: inline-block;
      }
      .chat-thinking__dot:nth-child(2) { animation-delay: 0.2s; }
      .chat-thinking__dot:nth-child(3) { animation-delay: 0.4s; }
      @keyframes pulse { 0%,100%{opacity:0.3} 50%{opacity:1} }
      .chat-panel__footer {
        display: flex; gap: 0.5rem; padding: 0.75rem 1rem;
        border-top: 1px solid var(--color-border, #e5e7eb);
        background: var(--color-surface, #fff);
      }
      .chat-panel__input {
        flex: 1; border: 1px solid var(--color-border, #d1d5db);
        border-radius: 1.5rem; padding: 0.55rem 1rem;
        font-size: 0.875rem; outline: none;
        background: var(--color-surface-2, #f9fafb);
      }
      .chat-panel__input:focus { border-color: var(--color-primary, #16a34a); }
      .chat-panel__send {
        width: 2.4rem; height: 2.4rem; border-radius: 50%;
        background: var(--color-primary, #16a34a); color: #fff;
        border: none; cursor: pointer; display: flex;
        align-items: center; justify-content: center;
      }
      .chat-panel__send:disabled { opacity: 0.5; cursor: not-allowed; }
      .chat-welcome__chips {
        display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.5rem;
      }
      .chat-welcome__chip {
        background: var(--color-surface-2, #f3f4f6);
        border: 1px solid var(--color-border, #e5e7eb);
        border-radius: 1rem; padding: 0.35rem 0.75rem;
        font-size: 0.78rem; cursor: pointer;
      }
    `;
    document.head.appendChild(style);
  }

  // Create FAB and panel
  const fab = document.createElement('button');
  fab.className = 'chat-fab';
  fab.setAttribute('aria-label', 'Open AI assistant');
  fab.innerHTML = '🤖';
  document.body.appendChild(fab);

  const panel = document.createElement('div');
  panel.className = 'chat-panel';
  panel.innerHTML = `
    <div class="chat-panel__header">
      <div class="chat-panel__avatar">🌿</div>
      <div class="chat-panel__title">Stokpal Assistant</div>
      <button class="chat-panel__close">✕</button>
    </div>
    <div class="chat-panel__messages" id="chat-messages-client">
      <div class="chat-welcome" id="chat-welcome-client">
        <p>Hi! I'm your Stokpal AI Agent.</p>
        <div class="chat-welcome__chips">
          <button class="chat-welcome__chip" data-prompt="What is our group balance?">💰 Group balance</button>
          <button class="chat-welcome__chip" data-prompt="When is the next payout?">📅 Next payout</button>
          <button class="chat-welcome__chip" data-prompt="Show me my contribution history">📋 My contributions</button>
          <button class="chat-welcome__chip" data-prompt="When is the next meeting?">🗓 Next meeting</button>
          <button class="chat-welcome__chip" data-prompt="Who are the members?">👥 Members</button>
          <button class="chat-welcome__chip" data-prompt="Show full payout schedule">📊 Full schedule</button>
        </div>
      </div>
    </div>
    <div class="chat-panel__footer">
      <textarea class="chat-panel__input" id="chat-input-client" rows="1" placeholder="Ask anything..."></textarea>
      <button class="chat-panel__send" id="chat-send-client">➤</button>
    </div>
  `;
  document.body.appendChild(panel);

  // DOM references
  const messagesEl = panel.querySelector('#chat-messages-client');
  const inputEl    = panel.querySelector('#chat-input-client');
  const sendBtn    = panel.querySelector('#chat-send-client');
  const closeBtn   = panel.querySelector('.chat-panel__close');
  const welcomeDiv = panel.querySelector('#chat-welcome-client');

  let isOpen = false;
  let busy = false;
  let currentGroupId = null;
  let userGroups = [];   // store { id, name }
  let awaitingGroupSelection = false;

  // Helper: fetch user's groups using existing getUserGroups function
  async function fetchUserGroups(uid) {
    try {
      const groups = await getUserGroups(uid);
      userGroups = groups.map(g => ({ id: g.id, name: g.name }));
      return userGroups;
    } catch (err) {
      console.error('Failed to fetch groups for chat:', err);
      return [];
    }
  }

  // Helper: get active group ID (from chat state, then fallback to dashboard)
  function getActiveGroupId() {
    if (currentGroupId) return currentGroupId;
    if (window.selectedGroupId) return window.selectedGroupId;
    const activeBtn = document.querySelector('.group-list-btn--active');
    if (activeBtn && activeBtn.dataset.groupId) return activeBtn.dataset.groupId;
    return null;
  }

  // Set active group and also update dashboard if possible
  function setActiveGroup(groupId) {
    currentGroupId = groupId;
    window.selectedGroupId = groupId;
    // Also try to highlight the dashboard button (optional)
    const btn = document.querySelector(`.group-list-btn[data-group-id="${groupId}"]`);
    if (btn && !btn.classList.contains('group-list-btn--active')) {
      btn.click(); // This will trigger dashboard's group selection logic
    }
  }

  function fmtRandChat(amount) {
    return 'R ' + (Number(amount) || 0).toLocaleString('en-ZA');
  }

  function fmtDateChat(value) {
    if (!value) return 'Not set';
    if (value.toDate) value = value.toDate();
    if (value instanceof Date) return value.toLocaleDateString('en-ZA');
    return String(value);
  }

  // ── Firestore queries using MODULAR syntax ─────────────────
  async function getBalance(groupId) {
    try {
      const groupRef = doc(db, 'groups', groupId);
      const snap = await getDoc(groupRef);
      if (!snap.exists()) return { error: 'Group not found' };
      const data = snap.data();
      return { balance: data.totalBalance || data.balance || 0, name: data.name };
    } catch (err) { return { error: err.message }; }
  }

  async function getNextPayout(groupId) {
    try {
      const today = new Date().toISOString().slice(0,10);
      const payoutsRef = collection(db, 'payouts');
      const q = query(payoutsRef, where('groupId', '==', groupId), orderBy('order'));
      const snap = await getDocs(q);
      if (snap.empty) return { error: 'No payout schedule' };
      let payouts = snap.docs.map(d => {
        let data = d.data();
        if (data.payoutDate?.toDate) data.payoutDate = data.payoutDate.toDate().toISOString().slice(0,10);
        return data;
      });
      let upcoming = payouts.find(p => p.payoutDate >= today);
      let target = upcoming || payouts[payouts.length-1];
      if (!target) return { error: 'No payout info' };
      return {
        date: fmtDateChat(target.payoutDate),
        recipient: target.userDisplayName || 'member',
        amount: target.amount || 0,
        order: target.order,
        note: upcoming ? null : 'All payouts passed'
      };
    } catch (err) { return { error: err.message }; }
  }

  async function getFullSchedule(groupId) {
    try {
      const today = new Date().toISOString().slice(0,10);
      const payoutsRef = collection(db, 'payouts');
      const q = query(payoutsRef, where('groupId', '==', groupId), orderBy('order'));
      const snap = await getDocs(q);
      if (snap.empty) return [];
      return snap.docs.map(d => {
        let data = d.data();
        let pd = data.payoutDate;
        if (pd?.toDate) pd = pd.toDate().toISOString().slice(0,10);
        return { order: data.order, name: data.userDisplayName, date: fmtDateChat(pd), amount: data.amount, isPast: (pd||'') < today };
      });
    } catch (err) { return { error: err.message }; }
  }

  async function getMyContributions(groupId, uid) {
    try {
      const contribRef = collection(db, 'contributions');
      const q = query(
        contribRef,
        where('userId', '==', uid),
        where('groupId', '==', groupId),
        orderBy('date', 'desc'),
        limit(10)
      );
      const snap = await getDocs(q);
      let records = [], total = 0;
      snap.forEach(d => {
        let data = d.data();
        let amt = Number(data.amount) || 0;
        if (data.status === 'confirmed') total += amt;
        records.push({ amount: amt, date: fmtDateChat(data.date), status: data.status });
      });
      return { contributions: records, total };
    } catch (err) { return { error: err.message }; }
  }

  async function getNextMeeting(groupId) {
    try {
      const today = new Date().toISOString().slice(0,10);
      const meetingsRef = collection(db, 'meetings');
      const q = query(
        meetingsRef,
        where('groupId', '==', groupId),
        where('date', '>=', today),
        orderBy('date'),
        limit(1)
      );
      const snap = await getDocs(q);
      if (snap.empty) return { error: 'No upcoming meetings' };
      const m = snap.docs[0].data();
      let dateDisplay = fmtDateChat(m.date);
      if (m.time) dateDisplay += ` at ${m.time}`;
      return { title: m.title || 'Meeting', date: dateDisplay, location: m.location || 'TBD' };
    } catch (err) { return { error: err.message }; }
  }

  async function getMembers(groupId) {
    try {
      const membersRef = collection(db, 'groups', groupId, 'members');
      const snap = await getDocs(membersRef);
      return snap.docs.map(d => ({ name: d.data().displayName || 'Member', role: d.data().role }));
    } catch (err) { return { error: err.message }; }
  }

  function chatEscapeHtml(str) {
    return String(str).replace(/[&<>]/g, function(m) {
      if (m === '&') return '&amp;';
      if (m === '<') return '&lt;';
      if (m === '>') return '&gt;';
      return m;
    });
  }

  function removeWelcome() { if (welcomeDiv && welcomeDiv.parentNode) welcomeDiv.remove(); }

  function appendMessage(role, text) {
    removeWelcome();
    const wrap = document.createElement('div');
    wrap.className = `chat-msg chat-msg--${role === 'user' ? 'user' : 'bot'}`;
    wrap.innerHTML = `
      <div class="chat-msg__avatar">${role === 'user' ? '👤' : '🌿'}</div>
      <div>
        <div class="chat-msg__bubble">${chatEscapeHtml(text).replace(/\n/g,'<br>')}</div>
        <div class="chat-msg__time">${new Date().toLocaleTimeString()}</div>
      </div>
    `;
    messagesEl.appendChild(wrap);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function showThinking() {
    const existing = document.getElementById('chat-thinking');
    if (existing) existing.remove();
    const div = document.createElement('div');
    div.id = 'chat-thinking';
    div.className = 'chat-thinking';
    div.innerHTML = `<div class="chat-thinking__dot"></div><div class="chat-thinking__dot"></div><div class="chat-thinking__dot"></div>`;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function removeThinking() {
    document.getElementById('chat-thinking')?.remove();
  }

  function isSwitchGroupIntent(message) {
    const lower = message.toLowerCase();
    return /(switch|change|select|choose) (to )?group/i.test(lower) ||
           /which group/i.test(lower) ||
           /list groups/i.test(lower) ||
           /different group/i.test(lower);
  }

  function formatGroupList() {
    if (userGroups.length === 0) return "You don't belong to any groups yet. Ask an admin to invite you.";
    return userGroups.map((g, i) => `${i+1}. ${g.name}`).join('\n');
  }

  async function handleGroupSelectionReply(message, uid) {
    if (!awaitingGroupSelection) return null;
    const trimmed = message.trim();
    // Try to match by number
    const numMatch = trimmed.match(/^\d+$/);
    if (numMatch) {
      const idx = parseInt(numMatch[0], 10) - 1;
      if (idx >= 0 && idx < userGroups.length) {
        const selected = userGroups[idx];
        setActiveGroup(selected.id);
        awaitingGroupSelection = false;
        return `✅ Switched to group **${selected.name}**. How can I help you with this group?`;
      } else {
        return `❌ Invalid number. Please choose a number between 1 and ${userGroups.length}.`;
      }
    }
    // Try to match by name
    const matched = userGroups.find(g => g.name.toLowerCase() === trimmed.toLowerCase());
    if (matched) {
      setActiveGroup(matched.id);
      awaitingGroupSelection = false;
      return `✅ Switched to group **${matched.name}**. How can I help you?`;
    }
    // If not a valid selection, remind
    return `Please type the **number** or the **exact name** of the group you want to use.\n${formatGroupList()}`;
  }

  async function buildReply(message, uid) {
    // First, handle pending group selection
    if (awaitingGroupSelection) {
      const result = await handleGroupSelectionReply(message, uid);
      if (result) return result;
    }

    const lower = message.toLowerCase();

    // Switch group intent
    if (isSwitchGroupIntent(message)) {
      if (userGroups.length === 0) {
        return "You don't belong to any groups yet. Ask an admin to invite you.";
      }
      awaitingGroupSelection = true;
      return `Please select a group:\n${formatGroupList()}\n\nType the number or the group name.`;
    }

    // If no group selected yet, force selection first
    const groupId = getActiveGroupId();
    if (!groupId) {
      if (userGroups.length === 0) {
        return "You don't belong to any groups. Please ask an admin to invite you.";
      }
      awaitingGroupSelection = true;
      return `Before I can answer that, please select a group:\n${formatGroupList()}\n\nType the number or the group name.`;
    }

    // Normal question answering
    if (/(balance|how much money)/.test(lower)) {
      const res = await getBalance(groupId);
      if (res.error) return `⚠️ ${res.error}`;
      return `💰 **${res.name}** balance: **${fmtRandChat(res.balance)}**`;
    }
    if (/(next payout|whose turn)/.test(lower)) {
      const res = await getNextPayout(groupId);
      if (res.error) return `⚠️ ${res.error}`;
      let msg = `📅 Next payout: **${res.date}**\n👤 ${res.recipient} (slot #${res.order})\n💰 ${fmtRandChat(res.amount)}`;
      if (res.note) msg += `\n_${res.note}_`;
      return msg;
    }
    if (/(full schedule|all payouts)/.test(lower)) {
      const list = await getFullSchedule(groupId);
      if (list.error) return `⚠️ ${list.error}`;
      if (!list.length) return "📊 No payout schedule.";
      return "📊 **Full schedule:**\n" + list.map(p => `  ${p.isPast ? '✅' : '🔜'} #${p.order} — ${p.name} · ${p.date} · ${fmtRandChat(p.amount)}`).join('\n');
    }
    if (/(my contribution|paid in)/.test(lower)) {
      const res = await getMyContributions(groupId, uid);
      if (res.error) return `⚠️ ${res.error}`;
      if (!res.contributions.length) return "📋 No contributions yet.";
      let lines = res.contributions.map(c => `  • ${fmtRandChat(c.amount)} on ${c.date} [${c.status}]`);
      return `📋 **Your contributions** (confirmed total: ${fmtRandChat(res.total)}):\n` + lines.join('\n');
    }
    if (/(meeting|next meeting)/.test(lower)) {
      const res = await getNextMeeting(groupId);
      if (res.error) return `⚠️ ${res.error}`;
      return `🗓 **${res.title}**\n📍 ${res.date} · ${res.location}`;
    }
    if (/(member|who is in)/.test(lower)) {
      const members = await getMembers(groupId);
      if (members.error) return `⚠️ ${members.error}`;
      if (!members.length) return "👥 No members found.";
      return "👥 **Members:**\n" + members.map(m => `  • ${m.name} [${m.role}]`).join('\n');
    }
    if (/(help|what can you do)/.test(lower)) {
      return `💡 I can answer questions about your stokvel group:\n- "What is our balance?"\n- "When is the next payout?"\n- "Show my contributions"\n- "Full payout schedule"\n- "Next meeting"\n- "Who are the members?"\n- "Switch group" or "change group"\nJust ask naturally!`;
    }
    if (/(hi|hello|hey|sawubona)/.test(lower)) {
      const groupName = userGroups.find(g => g.id === groupId)?.name || 'your group';
      return `👋 Sawubona! I'm your Stokpal Assistant. Currently active group: **${groupName}**.\nAsk me about balance, payouts, contributions, meetings, members, or type "help".`;
    }
    return "🤔 I didn't understand. Try asking about balance, next payout, full schedule, my contributions, next meeting, members, or 'switch group'.";
  }

  async function sendMessage(text) {
    if (!text.trim() || busy) return;
    busy = true;
    sendBtn.disabled = true;
    removeWelcome();
    appendMessage('user', text);
    inputEl.value = '';
    inputEl.style.height = 'auto';
    showThinking();

    try {
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error('Not logged in');

      // Ensure we have user groups loaded
      if (userGroups.length === 0) {
        await fetchUserGroups(uid);
      }

      const reply = await buildReply(text, uid);
      removeThinking();
      appendMessage('bot', reply);
    } catch (err) {
      removeThinking();
      appendMessage('bot', '❌ An error occurred. Please try again.');
      console.error(err);
    } finally {
      busy = false;
      sendBtn.disabled = false;
    }
  }

  // Event listeners
  fab.addEventListener('click', () => {
    isOpen = !isOpen;
    panel.classList.toggle('chat-panel--open', isOpen);
    if (isOpen) {
      inputEl.focus();
      // If no group selected, immediately prompt after a short delay
      if (!getActiveGroupId() && userGroups.length > 0 && !awaitingGroupSelection) {
        setTimeout(() => {
          if (isOpen && !busy && messagesEl.querySelector('.chat-welcome')) {
            sendMessage("switch group");
          }
        }, 500);
      }
    }
  });
  closeBtn.addEventListener('click', () => {
    isOpen = false;
    panel.classList.remove('chat-panel--open');
  });
  sendBtn.addEventListener('click', () => sendMessage(inputEl.value));
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputEl.value);
    }
  });
  inputEl.addEventListener('input', () => {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 80) + 'px';
  });
  panel.addEventListener('click', (e) => {
    if (e.target.classList?.contains('chat-welcome__chip')) {
      sendMessage(e.target.dataset.prompt);
    }
  });

  // Initialise: fetch user groups when the widget is mounted
  if (auth.currentUser) {
    fetchUserGroups(auth.currentUser.uid).then(() => {
      // If a group is already selected via dashboard, use it
      const existingGroup = getActiveGroupId();
      if (existingGroup) {
        setActiveGroup(existingGroup);
      }
    });
  }
}

/* ══════════════════════════════════════════════════════════
   AUTH STATE HANDLER (main entry point)
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

  startMeetingListener(groupIds);
  startContributionListener(user.uid, groupMap);
  await loadPayoutWidget(user.uid, groupIds);

  // Mount the floating chat widget
  mountChatWidget();
});