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
  serverTimestamp,
  getDocs,
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
      currentGroupId = groups[0].id;
    }

    applyRoleUI(currentRole);
    await loadUserGroups();
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

export async function loadUserGroups() {
  const select = document.getElementById('meeting-group');
  if (!select) return;
  select.innerHTML = '<option value="" disabled selected>Select a group</option>';

  if (!currentGroupId) {
    const opt    = document.createElement('option');
    opt.disabled = true;
    opt.textContent = 'You are not in any groups yet';
    select.appendChild(opt);
    return;
  }

  try {
    const groupSnap = await getDoc(doc(db, COLLECTIONS.GROUPS, currentGroupId));
    if (!groupSnap.exists()) return;

    const opt       = document.createElement('option');
    opt.value       = groupSnap.id;
    opt.textContent = groupSnap.data().name;
    opt.selected    = true;
    select.appendChild(opt);

  } catch (err) {
    console.error('Failed to load group:', err);
  }
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
  const safeTitle = title.replace(/'/g, "\\'");
  const hasMinutes = !!(meeting.minutes && meeting.minutes.trim());

  const canEditMinutes  = role === ROLES.ADMIN || role === ROLES.TREASURER;
  const minutesBtnLabel = hasMinutes ? (canEditMinutes ? 'Edit' : 'View') : 'Minutes';

  const li = document.createElement('li');
  li.className         = isPast ? 'past' : 'upcoming';
  li.dataset.meetingId = meeting.id;

  li.innerHTML = `
    <time class="date-block" datetime="${meeting.date}">
      <strong>${day}</strong>
      <em>${monthStr}</em>
    </time>
    <article class="meeting-details">
      <h3>${title}</h3>
      <ul class="meta" aria-label="Meeting details">
        <li><time datetime="${meeting.time}">${meeting.time}</time></li>
        <li><address>${meeting.location}</address></li>
        <li><mark class="badge ${isPast ? 'badge-past' : 'badge-upcoming'}">${isPast ? 'Past' : 'Upcoming'}</mark></li>
        ${hasMinutes ? '<li><mark class="badge badge-past">Minutes recorded</mark></li>' : ''}
      </ul>
    </article>
    <button class="ghost" type="button" onclick="openMinutes('${meeting.id}', '${safeTitle}', ${canEditMinutes})">
      ${minutesBtnLabel}
    </button>
  `;
  return li;
}

const scheduleForm = document.getElementById('schedule-form');
if (scheduleForm) {
  scheduleForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (currentRole !== ROLES.ADMIN && currentRole !== ROLES.TREASURER) {
      alert('Only Admins and Treasurers can schedule meetings.');
      return;
    }
    const data = Object.fromEntries(new FormData(e.currentTarget));
    if (!data.group || !data.date || !data.time || !data.location || !data.agenda) {
      alert('Please fill in all required fields.');
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    if (data.date < today) {
      alert('Please select a future date.');
      return;
    }
    if (data.time < MEETING_TIME.MIN || data.time > MEETING_TIME.MAX) {
      alert('Meeting time must be between 8:00 AM and 8:00 PM.');
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
  if (!text) return;
  const saveBtn = document.querySelector('#minutes-form button[type="submit"]');
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
    const dialog = document.getElementById('minutes-dialog');
    if (dialog) dialog.close();
    showNotification('Minutes saved successfully.');
  } catch (err) {
    console.error('Failed to save minutes:', err);
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
  if (banner) banner.style.display = 'block';
  clearTimeout(showNotification._timer);
  showNotification._timer = setTimeout(closeBanner, 6000);
}
export function closeBanner() {
  const banner = document.getElementById('notification-banner');
  if (banner) banner.style.display = 'none';
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

window.addEventListener('beforeunload', () => {
  if (_unsubscribe) _unsubscribe();
});
