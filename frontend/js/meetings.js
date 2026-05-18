/* =============================================================
   meetings.js  —  Meeting Management  (ESM)
   ============================================================= */

import { auth, db } from './firebase-config.js';
import {
  collection,
  doc,
  getDoc,
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

let currentUser      = null;
let currentRole      = null;
let currentGroupId   = null;
let currentMeetingId = null;
let _unsubscribe     = null;

auth.onAuthStateChanged(async (user) => {
  if (!user) {
    window.location.href = 'login.html';
    return;
  }

  currentUser = user;

  try {
    const profile = await getUserProfile(user.uid);
    if (!profile) {
      window.location.href = 'login.html';
      return;
    }
    currentRole = profile.role;

    const groups = await getUserGroups(user.uid);
    if (groups.length > 0) {
      currentGroupId = groups[0].id; // default to first group
    }

    applyRoleUI(currentRole);
    await loadUserGroups(groups); // pass the full groups array
    startMeetingListener(currentRole);

  } catch (err) {
    console.error('Role check failed:', err);
    window.location.href = 'login.html';
  }
});

export function applyRoleUI(role) {
  const scheduleCard = document.querySelector('section[aria-labelledby="schedule-heading"]');
  if (role === ROLES.MEMBER) {
    if (scheduleCard) {
      scheduleCard.hidden = true;
      const layout = document.querySelector('section.meetings-layout');
      if (layout) layout.style.gridTemplateColumns = '1fr';
    }
  }

  const timeInput = document.getElementById('meeting-time');
  if (timeInput) {
    timeInput.min = MEETING_TIME.MIN;
    timeInput.max = MEETING_TIME.MAX;
  }
}

/**
 * Populates the group <select> from the groups array already returned
 * by getUserGroups() — no extra Firestore read needed.
 *
 * Each group object is expected to have { id, name } properties,
 * which is what getUserGroups() should return when it maps snapshots:
 *   docs.map(doc => ({ id: doc.id, ...doc.data() }))
 *
 * If getUserGroups() returns raw DocumentSnapshots instead of plain
 * objects, update groupService.js to map them as shown above.
 *
 * @param {Array<{id: string, name: string}>} groups
 */
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

  // Re-initialise the meeting listener whenever the user switches group
  select.addEventListener('change', () => {
    currentGroupId = select.value;
    startMeetingListener(currentRole);
  });
}

export function startMeetingListener(role) {
  if (_unsubscribe) _unsubscribe();

  const upcomingList = document.getElementById('upcoming-list');
  const pastList = document.querySelector('ul.meeting-list[aria-label="Past meetings"]');

  if (upcomingList) upcomingList.innerHTML = '';
  if (pastList) pastList.innerHTML = '';

  if (!currentGroupId) return;

  const meetingsQuery = query(
    collection(db, COLLECTIONS.MEETINGS),
    where('groupId', '==', currentGroupId),
    orderBy('date', 'asc'),
  );

  _unsubscribe = onSnapshot(
    meetingsQuery,
    (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        const meeting = { id: change.doc.id, ...change.doc.data() };
        if (change.type === 'added') {
          renderMeeting(meeting, role);
          if (!change.doc.metadata.hasPendingWrites) {
            showNotification(`New meeting scheduled: "${meeting.title || 'Untitled'}" on ${formatDate(meeting.date)}`);
          }
        }
        if (change.type === 'modified') {
          const el = document.querySelector(`[data-meeting-id="${meeting.id}"]`);
          if (el) el.replaceWith(buildMeetingItem(meeting, role));
        }
        if (change.type === 'removed') {
          const el = document.querySelector(`[data-meeting-id="${meeting.id}"]`);
          if (el) el.remove();
          updateUpcomingCount();
        }
      });
    },
    (err) => {
      console.error('Meeting listener error:', err);
    },
  );
}

export function renderMeeting(meeting, role) {
  const item  = buildMeetingItem(meeting, role);
  const today = new Date().toISOString().slice(0, 10);
  const upcomingList = document.getElementById('upcoming-list');
  const pastList = document.querySelector('ul.meeting-list[aria-label="Past meetings"]');

  if (meeting.date >= today) {
    if (upcomingList) upcomingList.appendChild(item);
    updateUpcomingCount();
  } else {
    if (pastList) pastList.appendChild(item);
  }
}

export function buildMeetingItem(meeting, role) {
  const today     = new Date().toISOString().slice(0, 10);
  const isPast    = meeting.date < today;
  const d         = new Date(meeting.date);
  const day       = d.getDate();
  const monthStr  = d.toLocaleString('en-ZA', { month: 'short' }).toUpperCase();
  const title     = (meeting.title || meeting.agenda?.split('\n')[0] || 'Untitled').substring(0, 60);
  const hasMinutes = !!(meeting.minutes && meeting.minutes.trim());

  const canEditMinutes  = role === ROLES.ADMIN || role === ROLES.TREASURER;
  const minutesBtnLabel = hasMinutes ? (canEditMinutes ? 'Edit' : 'View') : 'Minutes';

  const li = document.createElement('li');
  li.className         = isPast ? 'past' : 'upcoming';
  li.dataset.meetingId = meeting.id;

  const timeBlock = document.createElement('time');
  timeBlock.className     = 'date-block';
  timeBlock.dateTime      = meeting.date;
  const dayEl = document.createElement('strong');
  dayEl.textContent = String(day);
  const monthEl = document.createElement('em');
  monthEl.textContent = monthStr;
  timeBlock.appendChild(dayEl);
  timeBlock.appendChild(monthEl);

  const article = document.createElement('article');
  article.className = 'meeting-details';

  const h3 = document.createElement('h3');
  h3.textContent = title;

  const metaUl = document.createElement('ul');
  metaUl.className = 'meta';
  metaUl.setAttribute('aria-label', 'Meeting details');

  const timeLi = document.createElement('li');
  const timeEl = document.createElement('time');
  timeEl.dateTime    = meeting.time || '';
  timeEl.textContent = meeting.time || '';
  timeLi.appendChild(timeEl);

  const locLi = document.createElement('li');
  const addr = document.createElement('address');
  addr.textContent = meeting.location || '';
  locLi.appendChild(addr);

  const badgeLi = document.createElement('li');
  const badge = document.createElement('mark');
  badge.className   = `badge ${isPast ? 'badge-past' : 'badge-upcoming'}`;
  badge.textContent = isPast ? 'Past' : 'Upcoming';
  badgeLi.appendChild(badge);

  metaUl.appendChild(timeLi);
  metaUl.appendChild(locLi);
  metaUl.appendChild(badgeLi);

  if (hasMinutes) {
    const minutesBadgeLi = document.createElement('li');
    const minutesBadge = document.createElement('mark');
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
    const data = Object.fromEntries(new FormData(e.currentTarget));
    if (!data.group || !data.date || !data.time || !data.location || !data.agenda) {
      setScheduleStatus('Please fill in all required fields.');
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    if (data.date < today) {
      setScheduleStatus('Please select a future date.');
      return;
    }
    if (data.time < MEETING_TIME.MIN || data.time > MEETING_TIME.MAX) {
      setScheduleStatus('Meeting time must be between 8:00 AM and 8:00 PM.');
      return;
    }
    const submitBtn = e.currentTarget.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
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
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Schedule Meeting';
    }
  });
}

export async function openMinutes(meetingId, title, canEdit) {
  currentMeetingId = meetingId;
  const titleEl = document.getElementById('dialog-title');
  if (titleEl) titleEl.textContent = (canEdit ? 'Record Minutes — ' : 'View Minutes — ') + title;
  const textarea = document.getElementById('minutes-text');
  const saveBtn  = document.querySelector('#minutes-form button[type="submit"]');
  try {
    const meetingSnap = await getDoc(doc(db, COLLECTIONS.MEETINGS, meetingId));
    if (textarea) {
      textarea.value = meetingSnap.exists() ? (meetingSnap.data().minutes || '') : '';
      textarea.readOnly = !canEdit;
    }
    if (saveBtn) saveBtn.hidden = !canEdit;
    const dialog = document.getElementById('minutes-dialog');
    if (dialog) dialog.showModal();
  } catch (err) {
    console.error('Failed to fetch minutes:', err);
  }
}
window.openMinutes = openMinutes;

export async function saveMinutes() {
  if (currentRole !== ROLES.ADMIN && currentRole !== ROLES.TREASURER) return;
  const textarea = document.getElementById('minutes-text');
  const text = textarea ? textarea.value.trim() : '';
  const minutesStatus = document.getElementById('minutes-status');
  if (!text) {
    if (minutesStatus) minutesStatus.textContent = 'Please enter meeting minutes before saving.';
    return;
  }
  const saveBtn = document.getElementById('minutes-save-btn');
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
  }
  try {
    await updateDoc(doc(db, COLLECTIONS.MEETINGS, currentMeetingId), {
      minutes: text,
      minutesUpdatedAt: serverTimestamp(),
      minutesUpdatedBy: currentUser.uid,
    });
    if (minutesStatus) minutesStatus.textContent = '';
    const dialog = document.getElementById('minutes-dialog');
    if (dialog) dialog.close();
    showNotification('Minutes saved successfully.');
  } catch (err) {
    console.error('Failed to save minutes:', err);
    if (minutesStatus) minutesStatus.textContent = 'Failed to save minutes. Please try again.';
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Minutes';
    }
  }
}
window.saveMinutes = saveMinutes;

export function showNotification(message) {
  const banner = document.getElementById('notification-banner');
  const body = document.getElementById('notification-body');
  if (body) body.textContent = message;
  if (banner) banner.removeAttribute('hidden');
  clearTimeout(showNotification._timer);
  showNotification._timer = setTimeout(closeBanner, 6000);
}
export function closeBanner() {
  const banner = document.getElementById('notification-banner');
  if (banner) banner.setAttribute('hidden', '');
}
window.closeBanner = closeBanner;

export function updateUpcomingCount() {
  const list  = document.getElementById('upcoming-list');
  const count = document.getElementById('upcoming-count');
  if (!list || !count) return;
  const n = list.querySelectorAll('li').length;
  count.textContent = `${n} meeting${n !== 1 ? 's' : ''}`;
}

export function formatDate(isoDate) {
  if (!isoDate) return '';
  return new Date(isoDate).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Minutes form submit ────────────────────────────────────
const minutesForm = document.getElementById('minutes-form');
if (minutesForm) {
  minutesForm.addEventListener('submit', (e) => {
    e.preventDefault();
    saveMinutes();
  });
}

// ── Delegated click handler for data-action buttons ────────
document.addEventListener('click', (e) => {
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (!action) return;
  if (action === 'close-banner') {
    closeBanner();
  } else if (action === 'close-minutes-dialog') {
    const dialog = document.getElementById('minutes-dialog');
    if (dialog) dialog.close();
  }
});

window.addEventListener('beforeunload', () => {
  if (_unsubscribe) _unsubscribe();
});
