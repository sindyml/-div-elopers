/* =============================================================
   meetings.js  —  Meeting Management  (ESM)
   ============================================================= */

import { auth, db } from './firebase-config.js';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getUserProfile } from './userService.js';
import { getUserGroups } from './groupService.js';
import { COLLECTIONS, ROLES, MEETING_TIME } from './constants.js';

/* ── Module-level state ───────────────────────────────────── */
let currentUser          = null;
let currentRole          = null;
let currentGroupId       = null;
let currentMeetingId     = null;
let _unsubscribeMeetings = null;
let _unsubscribeRequests = null;

/* ═══════════════════════════════════════════════════════════
   AUTH
═══════════════════════════════════════════════════════════ */
auth.onAuthStateChanged(async (user) => {
  if (!user) { window.location.href = 'login.html'; return; }
  currentUser = user;

  try {
    const profile = await getUserProfile(user.uid);
    if (!profile) { window.location.href = 'login.html'; return; }
    currentRole = profile.role;

    const groups = await getUserGroups(user.uid);
    if (groups.length > 0) currentGroupId = groups[0].id;

    applyRoleUI(currentRole);
    await loadUserGroups(groups);
    startMeetingListener(currentRole);

    if (currentRole === ROLES.ADMIN || currentRole === ROLES.TREASURER) {
      startRequestsListener();
    } else {
      await checkMemberRequestStatus(user.uid);
    }

  } catch (err) {
    console.error('Role check failed:', err);
    window.location.href = 'login.html';
  }
});

/* ═══════════════════════════════════════════════════════════
   ROLE UI
═══════════════════════════════════════════════════════════ */
export function applyRoleUI(role) {
  const scheduleCard = document.querySelector('section[aria-labelledby="schedule-heading"]');
  if (role === ROLES.MEMBER) {
    if (scheduleCard) {
      scheduleCard.hidden = true;
      const layout = document.querySelector('section.meetings-layout');
      if (layout) layout.style.gridTemplateColumns = '1fr';
    }
    showMemberScheduleBanner();
  }

  const requestsPanel = document.getElementById('requests-panel');
  if (requestsPanel) {
    if (role === ROLES.ADMIN || role === ROLES.TREASURER) {
      requestsPanel.removeAttribute('hidden');
    } else {
      requestsPanel.setAttribute('hidden', '');
    }
  }

  const timeInput = document.getElementById('meeting-time');
  if (timeInput) {
    timeInput.min = MEETING_TIME.MIN;
    timeInput.max = MEETING_TIME.MAX;
  }
}

/* ═══════════════════════════════════════════════════════════
   MEMBER SCHEDULE BANNER
═══════════════════════════════════════════════════════════ */
export function showMemberScheduleBanner() {
  document.getElementById('member-info-banner')?.removeAttribute('hidden');
}

export function closeMemberBanner() {
  document.getElementById('member-info-banner')?.setAttribute('hidden', '');
}
window.closeMemberBanner = closeMemberBanner;

/* ═══════════════════════════════════════════════════════════
   MEMBER REQUEST STATUS BANNER
   On page load: find any meetingRequests where requestedBy == uid
   AND memberNotified == false AND status != 'pending'.
   Show outcome banner, then mark memberNotified = true.
═══════════════════════════════════════════════════════════ */
async function checkMemberRequestStatus(uid) {
  try {
    const q    = query(
      collection(db, 'meetingRequests'),
      where('requestedBy', '==', uid),
      where('memberNotified', '==', false)
    );
    const snap = await getDocs(q);
    snap.forEach(async (docSnap) => {
      const data = docSnap.data();
      if (data.status === 'accepted' || data.status === 'rejected') {
        showRequestStatusBanner(data.status, data.reason);
        await updateDoc(doc(db, 'meetingRequests', docSnap.id), {
          memberNotified: true
        });
      }
    });
  } catch (err) {
    console.warn('[Meetings] Could not check request status:', err.message);
  }
}

function showRequestStatusBanner(status, reason) {
  const banner  = document.getElementById('request-status-banner');
  const icon    = document.getElementById('request-status-icon');
  const heading = document.getElementById('request-status-heading');
  const detail  = document.getElementById('request-status-detail');
  if (!banner) return;

  if (status === 'accepted') {
    if (icon)    icon.textContent    = '✅';
    if (heading) heading.textContent = 'Meeting request accepted';
    if (detail)  detail.textContent  =
      `Your request has been reviewed and a meeting will be scheduled. Your original request: "${reason}"`;
    banner.dataset.variant = 'accepted';
  } else {
    if (icon)    icon.textContent    = '❌';
    if (heading) heading.textContent = 'Meeting request declined';
    if (detail)  detail.textContent  =
      `Your request was reviewed but could not be accommodated at this time. Your original request: "${reason}"`;
    banner.dataset.variant = 'rejected';
  }
  banner.removeAttribute('hidden');
}

export function closeRequestStatusBanner() {
  document.getElementById('request-status-banner')?.setAttribute('hidden', '');
}
window.closeRequestStatusBanner = closeRequestStatusBanner;

/* ═══════════════════════════════════════════════════════════
   DUPLICATE MEETING GUARD
   Queries the meetings collection for any document in this group
   with the same date AND time before allowing a new write.
   Returns true if a duplicate exists, false if the slot is free.
   ─────────────────────────────────────────────────────────────
   Why a pre-write check rather than a Firestore transaction?
   Firestore does not support unique constraints natively. A
   transaction could still race in theory, but for a stokvel
   scheduler — where two admins scheduling the exact same slot
   simultaneously is an edge case — a pre-write getDocs check is
   the right balance of simplicity and reliability.
   ─────────────────────────────────────────────────────────────
   Note: also add a Firestore security rule or Cloud Function if
   you need a hard server-side guarantee against duplicates.
═══════════════════════════════════════════════════════════ */
async function meetingSlotTaken(groupId, date, time) {
  try {
    const snap = await getDocs(
      query(
        collection(db, COLLECTIONS.MEETINGS),
        where('groupId', '==', groupId),
        where('date',    '==', date),
        where('time',    '==', time),
        limit(1)                          // only need to know if at least one exists
      )
    );
    return !snap.empty;
  } catch (err) {
    // On error, be conservative: don't block the write, but log it.
    console.warn('[Meetings] Duplicate check failed:', err.message);
    return false;
  }
}

/* ═══════════════════════════════════════════════════════════
   ADMIN / TREASURER: REQUESTS LISTENER (meetings page panel)
═══════════════════════════════════════════════════════════ */
export function startRequestsListener() {
  if (_unsubscribeRequests) _unsubscribeRequests();
  if (!currentGroupId) return;

  const requestsList = document.getElementById('requests-list');
  if (requestsList) requestsList.innerHTML = '';
  updateRequestsBadge();

  const q = query(
    collection(db, 'meetingRequests'),
    where('groupId', '==', currentGroupId),
    where('status',  '==', 'pending'),
    orderBy('createdAt', 'asc')
  );

  _unsubscribeRequests = onSnapshot(q, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        renderRequestItem({ id: change.doc.id, ...change.doc.data() });
      }
      if (change.type === 'removed') {
        document.querySelector(`[data-request-id="${change.doc.id}"]`)?.remove();
      }
    });
    updateRequestsBadge();
    updateRequestsEmptyState();
  }, (err) => { console.error('[Meetings] Requests listener error:', err); });
}

function renderRequestItem(request) {
  const requestsList = document.getElementById('requests-list');
  if (!requestsList) return;

  const article = document.createElement('article');
  article.className         = 'request-item';
  article.dataset.requestId = request.id;

  const hdr    = document.createElement('header');
  hdr.className = 'request-item__header';

  const nameEl = document.createElement('p');
  nameEl.className   = 'request-item__name';
  nameEl.textContent = request.requesterName || 'A group member';

  const timeEl = document.createElement('time');
  timeEl.className = 'request-item__time';
  if (request.createdAt?.toDate) {
    const d = request.createdAt.toDate();
    timeEl.dateTime    = d.toISOString();
    timeEl.textContent = d.toLocaleDateString('en-ZA', {
      day: 'numeric', month: 'short', year: 'numeric'
    });
  }

  hdr.appendChild(nameEl);
  hdr.appendChild(timeEl);

  const reasonEl = document.createElement('p');
  reasonEl.className   = 'request-item__details';
  reasonEl.textContent = request.reason || '(No reason provided)';

  const actions   = document.createElement('menu');
  actions.className = 'request-item__actions';

  const acceptLi  = document.createElement('li');
  const acceptBtn = document.createElement('button');
  acceptBtn.type        = 'button';
  acceptBtn.className   = 'primary btn--sm';
  acceptBtn.textContent = 'Accept';
  acceptBtn.setAttribute('aria-label', `Accept request from ${request.requesterName || 'member'}`);
  acceptBtn.addEventListener('click', () =>
    handleRequestAction(request.id, 'accepted', article));

  const declineLi  = document.createElement('li');
  const declineBtn = document.createElement('button');
  declineBtn.type        = 'button';
  declineBtn.className   = 'secondary btn--sm';
  declineBtn.textContent = 'Decline';
  declineBtn.setAttribute('aria-label', `Decline request from ${request.requesterName || 'member'}`);
  declineBtn.addEventListener('click', () =>
    handleRequestAction(request.id, 'rejected', article));

  acceptLi.appendChild(acceptBtn);
  declineLi.appendChild(declineBtn);
  actions.appendChild(acceptLi);
  actions.appendChild(declineLi);

  article.appendChild(hdr);
  article.appendChild(reasonEl);
  article.appendChild(actions);
  requestsList.appendChild(article);
}

async function handleRequestAction(requestId, action, articleEl) {
  articleEl.querySelectorAll('button').forEach(btn => { btn.disabled = true; });

  const feedbackEl = document.createElement('p');
  feedbackEl.className = 'request-item__feedback';
  feedbackEl.setAttribute('aria-live', 'polite');
  feedbackEl.textContent = action === 'accepted' ? 'Accepting…' : 'Declining…';
  articleEl.appendChild(feedbackEl);

  try {
    await updateDoc(doc(db, 'meetingRequests', requestId), {
      status:         action,
      actionedBy:     currentUser.uid,
      actionedAt:     serverTimestamp(),
      memberNotified: false,
    });
    showNotification(
      action === 'accepted'
        ? 'Meeting request accepted. The member will be notified on their next login.'
        : 'Meeting request declined. The member will be notified on their next login.'
    );
  } catch (err) {
    console.error('[Meetings] Failed to action request:', err);
    feedbackEl.textContent = 'Failed to update. Please try again.';
    articleEl.querySelectorAll('button').forEach(btn => { btn.disabled = false; });
  }
}

function updateRequestsBadge() {
  const list  = document.getElementById('requests-list');
  const badge = document.getElementById('requests-count');
  if (!badge) return;
  const n = list ? list.querySelectorAll('article').length : 0;
  badge.textContent = n > 0 ? String(n) : '';
  badge.hidden      = n === 0;
}

function updateRequestsEmptyState() {
  const list  = document.getElementById('requests-list');
  const empty = document.getElementById('requests-empty');
  if (!list || !empty) return;
  empty.hidden = list.querySelectorAll('article').length > 0;
}

/* ═══════════════════════════════════════════════════════════
   REQUEST MEETING DIALOG  (Member)
═══════════════════════════════════════════════════════════ */
export function openRequestMeetingDialog() {
  document.getElementById('request-meeting-dialog')?.showModal();
}
window.openRequestMeetingDialog = openRequestMeetingDialog;

export async function submitMeetingRequest() {
  const textarea = document.getElementById('request-meeting-text');
  const statusEl = document.getElementById('request-meeting-status');
  const reason   = textarea ? textarea.value.trim() : '';

  if (!reason) {
    if (statusEl) statusEl.textContent = 'Please provide a reason for the meeting request.';
    return;
  }

  const saveBtn = document.getElementById('request-meeting-save-btn');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Sending…'; }

  try {
    let adminUid = null;
    try {
      const snap = await getDocs(query(
        collection(db, 'memberships'),
        where('groupId', '==', currentGroupId),
        where('role', '==', ROLES.ADMIN)
      ));
      if (!snap.empty) adminUid = snap.docs[0].data().uid;
    } catch (_) { /* non-fatal */ }

    await addDoc(collection(db, 'meetingRequests'), {
      groupId:        currentGroupId,
      requestedBy:    currentUser.uid,
      requesterName:  currentUser.displayName || currentUser.email || 'Member',
      adminUid:       adminUid,
      reason:         reason,
      status:         'pending',
      memberNotified: false,
      createdAt:      serverTimestamp(),
      actionedBy:     null,
      actionedAt:     null,
    });

    if (statusEl) statusEl.textContent = '';
    document.getElementById('request-meeting-dialog')?.close();
    if (textarea) textarea.value = '';
    showNotification('Your meeting request has been sent to the group admin.');
  } catch (err) {
    console.error('[Meetings] Failed to submit meeting request:', err);
    if (statusEl) statusEl.textContent = 'Failed to send request. Please try again.';
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Send Request'; }
  }
}
window.submitMeetingRequest = submitMeetingRequest;

/* ═══════════════════════════════════════════════════════════
   GROUP SELECT
═══════════════════════════════════════════════════════════ */
export async function loadUserGroups(groups = []) {
  const select = document.getElementById('meeting-group');
  if (!select) return;
  select.innerHTML = '<option value="" disabled selected>Select a group</option>';

  if (!groups.length) {
    const opt    = document.createElement('option');
    opt.disabled = true;
    opt.textContent = 'You are not in any groups yet';
    select.appendChild(opt);
    return;
  }

  groups.forEach((group, index) => {
    const opt       = document.createElement('option');
    opt.value       = group.id;
    opt.textContent = group.name;
    if (index === 0) opt.selected = true;
    select.appendChild(opt);
  });

  select.addEventListener('change', () => {
    currentGroupId = select.value;
    startMeetingListener(currentRole);
    if (currentRole === ROLES.ADMIN || currentRole === ROLES.TREASURER) {
      startRequestsListener();
    }
  });
}

/* ═══════════════════════════════════════════════════════════
   MEETINGS LISTENER
═══════════════════════════════════════════════════════════ */
export function startMeetingListener(role) {
  if (_unsubscribeMeetings) _unsubscribeMeetings();

  const upcomingList = document.getElementById('upcoming-list');
  const pastList     = document.querySelector('ul.meeting-list[aria-label="Past meetings"]');

  if (upcomingList) upcomingList.innerHTML = '';
  if (pastList)     pastList.innerHTML     = '';
  if (!currentGroupId) return;

  let initialLoadDone = false;

  _unsubscribeMeetings = onSnapshot(
    query(
      collection(db, COLLECTIONS.MEETINGS),
      where('groupId', '==', currentGroupId),
      orderBy('date', 'asc')
    ),
    (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        const meeting = { id: change.doc.id, ...change.doc.data() };
        if (change.type === 'added') {
          renderMeeting(meeting, role);
          if (initialLoadDone && !change.doc.metadata.hasPendingWrites) {
            showNotification(`New meeting scheduled: "${meeting.title || 'Untitled'}" on ${formatDate(meeting.date)}`);
          }
        }
        if (change.type === 'modified') {
          document.querySelector(`[data-meeting-id="${meeting.id}"]`)?.remove();
          renderMeeting(meeting, role);
        }
        if (change.type === 'removed') {
          document.querySelector(`[data-meeting-id="${meeting.id}"]`)?.remove();
          updateUpcomingCount();
        }
      });
      initialLoadDone = true;
    },
    (err) => { console.error('Meeting listener error:', err); }
  );
}

/* ═══════════════════════════════════════════════════════════
   RENDER HELPERS
═══════════════════════════════════════════════════════════ */
export function renderMeeting(meeting, role) {
  const item         = buildMeetingItem(meeting, role);
  const today        = new Date().toISOString().slice(0, 10);
  const upcomingList = document.getElementById('upcoming-list');
  const pastList     = document.querySelector('ul.meeting-list[aria-label="Past meetings"]');

  if (meeting.date >= today) {
    if (upcomingList) upcomingList.appendChild(item);
    updateUpcomingCount();
  } else {
    if (pastList) pastList.appendChild(item);
  }
}

export function buildMeetingItem(meeting, role) {
  const today      = new Date().toISOString().slice(0, 10);
  const isPast     = meeting.date < today;
  const d          = new Date(meeting.date);
  const title      = (meeting.title || meeting.agenda?.split('\n')[0] || 'Untitled').substring(0, 60);
  const hasMinutes = !!(meeting.minutes && meeting.minutes.trim());

  const canEditMinutes  = role === ROLES.ADMIN || role === ROLES.TREASURER;
  const minutesBtnLabel = hasMinutes ? (canEditMinutes ? 'Edit' : 'View') : 'Minutes';

  const li = document.createElement('li');
  li.className         = isPast ? 'past' : 'upcoming';
  li.dataset.meetingId = meeting.id;

  const timeBlock = document.createElement('time');
  timeBlock.className = 'date-block';
  timeBlock.dateTime  = meeting.date;
  const dayEl   = document.createElement('strong');
  dayEl.textContent   = String(d.getDate());
  const monthEl = document.createElement('em');
  monthEl.textContent = d.toLocaleString('en-ZA', { month: 'short' }).toUpperCase();
  timeBlock.appendChild(dayEl);
  timeBlock.appendChild(monthEl);

  const article = document.createElement('article');
  article.className = 'meeting-details';
  const h3          = document.createElement('h3');
  h3.textContent    = title;
  const metaUl      = document.createElement('ul');
  metaUl.className  = 'meta';
  metaUl.setAttribute('aria-label', 'Meeting details');

  const timeLi = document.createElement('li');
  const timeEl = document.createElement('time');
  timeEl.dateTime    = meeting.time || '';
  timeEl.textContent = meeting.time || '';
  timeLi.appendChild(timeEl);

  const locLi = document.createElement('li');
  const addr  = document.createElement('address');
  addr.textContent = meeting.location || '';
  locLi.appendChild(addr);

  const badgeLi = document.createElement('li');
  const badge   = document.createElement('mark');
  badge.className   = `badge ${isPast ? 'badge-past' : 'badge-upcoming'}`;
  badge.textContent = isPast ? 'Past' : 'Upcoming';
  badgeLi.appendChild(badge);

  metaUl.appendChild(timeLi);
  metaUl.appendChild(locLi);
  metaUl.appendChild(badgeLi);

  if (hasMinutes) {
    const minutesBadgeLi = document.createElement('li');
    const minutesBadge   = document.createElement('mark');
    minutesBadge.className   = 'badge badge-past';
    minutesBadge.textContent = 'Minutes recorded';
    minutesBadgeLi.appendChild(minutesBadge);
    metaUl.appendChild(minutesBadgeLi);
  }

  article.appendChild(h3);
  article.appendChild(metaUl);

  const minutesBtn = document.createElement('button');
  minutesBtn.className   = 'ghost';
  minutesBtn.type        = 'button';
  minutesBtn.setAttribute('aria-label', `${minutesBtnLabel} minutes for ${title}`);
  minutesBtn.textContent = minutesBtnLabel;
  minutesBtn.addEventListener('click', () => openMinutes(meeting.id, title, canEditMinutes));

  li.appendChild(timeBlock);
  li.appendChild(article);
  li.appendChild(minutesBtn);
  return li;
}

/* ═══════════════════════════════════════════════════════════
   SCHEDULE FORM
   ─────────────────────────────────────────────────────────
   Duplicate prevention flow:
     1. All existing field validation runs first (required
        fields, past date, time range).
     2. meetingSlotTaken() queries Firestore for any document
        in this group with the same date AND time.
     3. If a match is found, setScheduleStatus() shows a clear
        error and the write is aborted — no document is created.
     4. Only when the slot is confirmed free does addDoc() run.
═══════════════════════════════════════════════════════════ */
function setScheduleStatus(message) {
  const statusEl = document.getElementById('schedule-status');
  if (statusEl) statusEl.textContent = message;
}

const scheduleForm = document.getElementById('schedule-form');
if (scheduleForm) {
  scheduleForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    setScheduleStatus('');

    if (currentRole !== ROLES.ADMIN && currentRole !== ROLES.TREASURER) {
      setScheduleStatus('Only Admins and Treasurers can schedule meetings.');
      return;
    }

    const data  = Object.fromEntries(new FormData(e.currentTarget));
    const today = new Date().toISOString().slice(0, 10);

    // ── Field validation ──────────────────────────────────
    if (!data.group || !data.date || !data.time || !data.location || !data.agenda) {
      setScheduleStatus('Please fill in all required fields.');
      return;
    }
    if (data.date < today) {
      setScheduleStatus('Please select a future date.');
      return;
    }
    if (data.time < MEETING_TIME.MIN || data.time > MEETING_TIME.MAX) {
      setScheduleStatus('Meeting time must be between 8:00 AM and 8:00 PM.');
      return;
    }

    const submitBtn = e.currentTarget.querySelector('button[type="submit"]');
    submitBtn.disabled    = true;
    submitBtn.textContent = 'Checking…';

    // ── Duplicate check ───────────────────────────────────
    // Query for any existing meeting in this group on the same
    // date at the same time. Uses limit(1) so Firestore only
    // reads a single document regardless of how many exist.
    const duplicate = await meetingSlotTaken(currentGroupId, data.date, data.time);
    if (duplicate) {
      setScheduleStatus(
        `A meeting is already scheduled for ${formatDate(data.date)} at ${data.time}. ` +
        `Please choose a different date or time.`
      );
      submitBtn.disabled    = false;
      submitBtn.textContent = 'Schedule Meeting';
      return;
    }

    // ── Write ─────────────────────────────────────────────
    submitBtn.textContent = 'Saving…';
    try {
      await addDoc(collection(db, COLLECTIONS.MEETINGS), {
        groupId:   currentGroupId,
        title:     data.agenda.split('\n')[0].substring(0, 60),
        date:      data.date,
        time:      data.time,
        location:  data.location,
        agenda:    data.agenda,
        minutes:   '',
        createdBy: currentUser.uid,
        createdAt: serverTimestamp(),
      });
      e.currentTarget.reset();
      setScheduleStatus('');
    } catch (err) {
      console.error('Failed to schedule meeting:', err);
      setScheduleStatus('Failed to save. Please try again.');
    } finally {
      submitBtn.disabled    = false;
      submitBtn.textContent = 'Schedule Meeting';
    }
  });
}

/* ═══════════════════════════════════════════════════════════
   MINUTES DIALOG
═══════════════════════════════════════════════════════════ */
export async function openMinutes(meetingId, title, canEdit) {
  currentMeetingId = meetingId;
  const titleEl = document.getElementById('dialog-title');
  if (titleEl) titleEl.textContent = (canEdit ? 'Record Minutes — ' : 'View Minutes — ') + title;
  const textarea = document.getElementById('minutes-text');
  const saveBtn  = document.querySelector('#minutes-form button[type="submit"]');
  try {
    const snap = await getDoc(doc(db, COLLECTIONS.MEETINGS, meetingId));
    if (textarea) {
      textarea.value    = snap.exists() ? (snap.data().minutes || '') : '';
      textarea.readOnly = !canEdit;
    }
    if (saveBtn) saveBtn.hidden = !canEdit;
    document.getElementById('minutes-dialog')?.showModal();
  } catch (err) { console.error('Failed to fetch minutes:', err); }
}
window.openMinutes = openMinutes;

export async function saveMinutes() {
  if (currentRole !== ROLES.ADMIN && currentRole !== ROLES.TREASURER) return;
  const textarea      = document.getElementById('minutes-text');
  const text          = textarea ? textarea.value.trim() : '';
  const minutesStatus = document.getElementById('minutes-status');
  if (!text) {
    if (minutesStatus) minutesStatus.textContent = 'Please enter meeting minutes before saving.';
    return;
  }
  const saveBtn = document.getElementById('minutes-save-btn');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }
  try {
    await updateDoc(doc(db, COLLECTIONS.MEETINGS, currentMeetingId), {
      minutes:          text,
      minutesUpdatedAt: serverTimestamp(),
      minutesUpdatedBy: currentUser.uid,
    });
    if (minutesStatus) minutesStatus.textContent = '';
    document.getElementById('minutes-dialog')?.close();
    showNotification('Minutes saved successfully.');
  } catch (err) {
    console.error('Failed to save minutes:', err);
    if (minutesStatus) minutesStatus.textContent = 'Failed to save minutes. Please try again.';
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Minutes'; }
  }
}
window.saveMinutes = saveMinutes;

/* ═══════════════════════════════════════════════════════════
   NOTIFICATION TOAST
═══════════════════════════════════════════════════════════ */
export function showNotification(message) {
  const banner = document.getElementById('notification-banner');
  const body   = document.getElementById('notification-body');
  if (body)   body.textContent = message;
  if (banner) banner.removeAttribute('hidden');
  clearTimeout(showNotification._timer);
  showNotification._timer = setTimeout(closeBanner, 6000);
}

export function closeBanner() {
  document.getElementById('notification-banner')?.setAttribute('hidden', '');
}
window.closeBanner = closeBanner;

/* ═══════════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════════ */
export function updateUpcomingCount() {
  const list  = document.getElementById('upcoming-list');
  const count = document.getElementById('upcoming-count');
  if (!list || !count) return;
  const n = list.querySelectorAll('li').length;
  count.textContent = `${n} meeting${n !== 1 ? 's' : ''}`;
}

export function formatDate(isoDate) {
  if (!isoDate) return '';
  return new Date(isoDate).toLocaleDateString('en-ZA', {
    day: 'numeric', month: 'short', year: 'numeric'
  });
}

/* ═══════════════════════════════════════════════════════════
   FORM SUBMIT LISTENERS
═══════════════════════════════════════════════════════════ */
document.getElementById('minutes-form')?.addEventListener('submit', (e) => {
  e.preventDefault(); saveMinutes();
});

document.getElementById('request-meeting-form')?.addEventListener('submit', (e) => {
  e.preventDefault(); submitMeetingRequest();
});

/* ═══════════════════════════════════════════════════════════
   DELEGATED CLICK HANDLER
═══════════════════════════════════════════════════════════ */
document.addEventListener('click', (e) => {
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (!action) return;
  switch (action) {
    case 'close-banner':                 closeBanner(); break;
    case 'close-minutes-dialog':         document.getElementById('minutes-dialog')?.close(); break;
    case 'close-member-banner':          closeMemberBanner(); break;
    case 'open-request-meeting':         openRequestMeetingDialog(); break;
    case 'close-request-meeting-dialog': document.getElementById('request-meeting-dialog')?.close(); break;
    case 'close-request-status-banner':  closeRequestStatusBanner(); break;
  }
});

/* ═══════════════════════════════════════════════════════════
   CLEANUP
═══════════════════════════════════════════════════════════ */
window.addEventListener('beforeunload', () => {
  if (_unsubscribeMeetings) _unsubscribeMeetings();
  if (_unsubscribeRequests) _unsubscribeRequests();
});

