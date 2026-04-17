/* ============================================================
   meetings.js  —  Modular Firebase SDK (v9+)
   ============================================================
   Tasks covered:
     Task 1 — Schedule Meeting form (Treasurer/Admin only)
     Task 2 — Save meeting document to Firestore
     Task 3 — Meeting List view for all roles
     Task 4 — Real-time in-app notification via onSnapshot()
     Task 5 — Record Minutes feature
   ============================================================ */


/* ── 1. Firebase imports + references ───────────────────────
   CHANGED FROM COMPAT:
     Before  →  const db = firebase.firestore()
                const auth = firebase.auth()
     After   →  named imports from the modular SDK.
   db and auth are imported from firebase-config.js which
   calls initializeApp() once and exports the service handles. */
import { db, auth }                    from './firebase-config.js';

import {
  onAuthStateChanged,                  /* replaces auth.onAuthStateChanged()      */
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

import {
  collection,                          /* replaces db.collection()                */
  collectionGroup,                     /* replaces db.collectionGroup()           */
  doc,                                 /* replaces db.collection().doc()          */
  getDoc,                              /* replaces .get() on a doc ref            */
  addDoc,                              /* replaces .add() on a collection ref     */
  updateDoc,                           /* replaces .update() on a doc ref         */
  query,                               /* builds a query object                   */
  where,                               /* replaces .where()                       */
  orderBy,                             /* replaces .orderBy()                     */
  limit,                               /* replaces .limit()                       */
  onSnapshot,                          /* replaces .onSnapshot()                  */
  serverTimestamp,                     /* replaces firebase.firestore.FieldValue.serverTimestamp() */
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';


/* ── 2. Module-level state ───────────────────────────────────
   UNCHANGED — same variable names, same purposes.
   currentUser      — populated once onAuthStateChanged fires.
   currentRole      — 'Admin' | 'Treasurer' | 'Member'.
   currentGroupId   — the single group this user belongs to.
   currentMeetingId — Firestore doc id of the open minutes modal.
   unsubscribeListener — holds the onSnapshot unsubscribe fn.   */

let currentUser         = null;
let currentRole         = null;
let currentGroupId      = null;
let currentMeetingId    = null;
let unsubscribeListener = null;


/* ── Time boundary constants ─────────────────────────────────
   UNCHANGED — meetings may only be scheduled 08:00–20:00.     */
const MEETING_TIME_MIN = '08:00';
const MEETING_TIME_MAX = '20:00';


/* ─────────────────────────────────────────────────────────────
   3. ROLE GUARD
   ─────────────────────────────────────────────────────────────
   CHANGED FROM COMPAT:
     Before  →  auth.onAuthStateChanged(async (user) => { ... })
                db.collection('users').doc(uid).get()
                db.collectionGroup('members').where(...).limit(1).get()
     After   →  onAuthStateChanged(auth, async (user) => { ... })
                getDoc(doc(db, 'users', uid))
                getDocs(query(collectionGroup(db,'members'), where(...), limit(1)))

   Logic and variable names are otherwise identical.            */

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = 'login.html';
    return;
  }

  currentUser = user;

  try {
    /* ── Fetch the user's app-level role from Firestore ── */
    const userDocRef  = doc(db, 'users', user.uid);   /* CHANGED: doc() instead of .doc() */
    const userDocSnap = await getDoc(userDocRef);      /* CHANGED: getDoc() instead of .get() */

    if (!userDocSnap.exists()) {                       /* CHANGED: exists() is now a method, not a property */
      window.location.href = 'login.html';
      return;
    }

    currentRole = userDocSnap.data().role;

    /* ── Resolve which group this user belongs to ──────────
       CHANGED FROM COMPAT:
         Before  →  db.collectionGroup('members')
                      .where('uid', '==', user.uid)
                      .limit(1)
                      .get()
         After   →  getDocs(
                      query(
                        collectionGroup(db, 'members'),
                        where('uid', '==', user.uid),
                        limit(1)
                      )
                    )
       The collectionGroup index requirement is unchanged.      */
    const { getDocs } = await import(
      'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js'
    );

    const memberQuery = query(
      collectionGroup(db, 'members'),
      where('uid', '==', user.uid),
      limit(1)
    );
    const memberSnap = await getDocs(memberQuery);

    if (!memberSnap.empty) {
      /* Path resolution logic is unchanged:
         .ref.parent.parent.id  →  the groupId string         */
      currentGroupId = memberSnap.docs[0].ref.parent.parent.id;
    }

    /* ── Apply role-based UI adjustments (unchanged) ── */
    applyRoleUI(currentRole);

    /* ── Populate the group selector from Firestore ── */
    await loadUserGroups(user.uid, currentRole);

    /* ── Load existing meetings and start real-time listener ── */
    startMeetingListener(user.uid, currentRole);

  } catch (err) {
    console.error('Role check failed:', err);
    window.location.href = 'login.html';
  }
});


/* ─────────────────────────────────────────────────────────────
   4. ROLE UI  —  show/hide the schedule form
   ─────────────────────────────────────────────────────────────
   UNCHANGED — no Firebase calls here, pure DOM manipulation.   */

function applyRoleUI(role) {
  const scheduleCard = document.querySelector('section[aria-labelledby="schedule-heading"]');

  if (role === 'Member') {
    scheduleCard.hidden = true;
    document.querySelector('section.meetings-layout').style.gridTemplateColumns = '1fr';
  }

  const timeInput = document.getElementById('meeting-time');
  if (timeInput) {
    timeInput.min = MEETING_TIME_MIN;
    timeInput.max = MEETING_TIME_MAX;
  }
}


/* ─────────────────────────────────────────────────────────────
   5. LOAD USER'S GROUP into the <select>
   ─────────────────────────────────────────────────────────────
   CHANGED FROM COMPAT:
     Before  →  db.collection('groups').doc(currentGroupId).get()
     After   →  getDoc(doc(db, 'groups', currentGroupId))

   Logic and variable names are otherwise identical.            */

async function loadUserGroups(uid, role) {
  const select = document.getElementById('meeting-group');

  select.innerHTML = '<option value="" disabled selected>Select a group</option>';

  if (!currentGroupId) {
    const opt    = document.createElement('option');
    opt.disabled = true;
    opt.textContent = 'You are not in any groups yet';
    select.appendChild(opt);
    return;
  }

  try {
    /* CHANGED: getDoc(doc(...)) instead of db.collection().doc().get() */
    const groupDocRef  = doc(db, 'groups', currentGroupId);
    const groupDocSnap = await getDoc(groupDocRef);

    if (!groupDocSnap.exists()) return;   /* CHANGED: exists() is now a method */

    const opt       = document.createElement('option');
    opt.value       = groupDocSnap.id;
    opt.textContent = groupDocSnap.data().name;
    opt.selected    = true;
    select.appendChild(opt);

  } catch (err) {
    console.error('Failed to load group:', err);
  }
}


/* ─────────────────────────────────────────────────────────────
   6. REAL-TIME MEETING LISTENER  (Task 3 + Task 4)
   ─────────────────────────────────────────────────────────────
   CHANGED FROM COMPAT:
     Before  →  db.collection('meetings')
                  .where('groupId', '==', currentGroupId)
                  .orderBy('date', 'asc')
                  .onSnapshot(callback, errCallback)
     After   →  onSnapshot(
                  query(
                    collection(db, 'meetings'),
                    where('groupId', '==', currentGroupId),
                    orderBy('date', 'asc')
                  ),
                  callback,
                  errCallback
                )

   INDEX REQUIRED (unchanged): groupId (ASC) + date (ASC).     */

function startMeetingListener(uid, role) {
  if (unsubscribeListener) unsubscribeListener();

  document.getElementById('upcoming-list').innerHTML = '';
  document.querySelector('ul.meeting-list[aria-label="Past meetings"]').innerHTML = '';

  if (!currentGroupId) return;

  /* CHANGED: build a query object first, then pass to onSnapshot() */
  const meetingsQuery = query(
    collection(db, 'meetings'),
    where('groupId', '==', currentGroupId),
    orderBy('date', 'asc')
  );

  unsubscribeListener = onSnapshot(
    meetingsQuery,
    (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        const meeting = { id: change.doc.id, ...change.doc.data() };

        if (change.type === 'added') {
          renderMeeting(meeting, role);

          if (!change.doc.metadata.hasPendingWrites) {
            showNotification(
              `New meeting scheduled: "${meeting.title || 'Untitled'}" on ${formatDate(meeting.date)}`
            );
          }
        }

        if (change.type === 'modified') {
          const existing = document.querySelector(`[data-meeting-id="${meeting.id}"]`);
          if (existing) existing.replaceWith(buildMeetingItem(meeting, role));
        }

        if (change.type === 'removed') {
          const existing = document.querySelector(`[data-meeting-id="${meeting.id}"]`);
          if (existing) existing.remove();
          updateUpcomingCount();
        }
      });
    },
    (err) => {
      console.error('Meeting listener error:', err);
    }
  );
}


/* ─────────────────────────────────────────────────────────────
   7. RENDER A SINGLE MEETING into the correct list
   ─────────────────────────────────────────────────────────────
   UNCHANGED — no Firebase calls, pure DOM logic.               */

function renderMeeting(meeting, role) {
  const item  = buildMeetingItem(meeting, role);
  const today = new Date().toISOString().slice(0, 10);

  if (meeting.date >= today) {
    document.getElementById('upcoming-list').appendChild(item);
    updateUpcomingCount();
  } else {
    document.querySelector('ul.meeting-list[aria-label="Past meetings"]').appendChild(item);
  }
}


/* ─────────────────────────────────────────────────────────────
   8. BUILD MEETING LIST ITEM  (<li> element)
   ─────────────────────────────────────────────────────────────
   UNCHANGED — no Firebase calls, pure DOM construction.        */

function buildMeetingItem(meeting, role) {
  const today     = new Date().toISOString().slice(0, 10);
  const isPast    = meeting.date < today;
  const d         = new Date(meeting.date);
  const day       = d.getDate();
  const monthStr  = d.toLocaleString('en-ZA', { month: 'short' }).toUpperCase();
  const title     = (meeting.title || meeting.agenda?.split('\n')[0] || 'Untitled').substring(0, 60);
  const safeTitle = title.replace(/'/g, "\\'");
  const hasMinutes = !!(meeting.minutes && meeting.minutes.trim());

  const canEditMinutes  = role === 'Admin' || role === 'Treasurer';
  const minutesBtnLabel = hasMinutes
    ? (canEditMinutes ? 'Edit' : 'View')
    : 'Minutes';

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
        <li>
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <circle cx="5" cy="5" r="4" stroke="currentColor" fill="none"/>
            <path d="M5 2.5V5l1.5 1.5" stroke="currentColor" stroke-linecap="round"/>
          </svg>
          <time datetime="${meeting.time}">${meeting.time}</time>
        </li>
        <li>
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M5 1C3.3 1 2 2.3 2 4c0 2.5 3 5 3 5s3-2.5 3-5c0-1.7-1.3-3-3-3z"
                  stroke="currentColor" fill="none"/>
            <circle cx="5" cy="4" r="1" fill="currentColor"/>
          </svg>
          <address>${meeting.location}</address>
        </li>
        <li>
          <mark class="badge ${isPast ? 'badge-past' : 'badge-upcoming'}">
            ${isPast ? 'Past' : 'Upcoming'}
          </mark>
        </li>
        ${hasMinutes ? '<li><mark class="badge badge-past">Minutes recorded</mark></li>' : ''}
      </ul>
    </article>
    <button class="ghost" type="button"
            onclick="openMinutes('${meeting.id}', '${safeTitle}', ${canEditMinutes})"
            aria-label="${minutesBtnLabel} minutes for ${safeTitle}">
      ${minutesBtnLabel}
    </button>
  `;

  return li;
}


/* ─────────────────────────────────────────────────────────────
   9. SCHEDULE MEETING FORM  (Task 1 + Task 2)
   ─────────────────────────────────────────────────────────────
   CHANGED FROM COMPAT:
     Before  →  db.collection('meetings').add({ ... })
                firebase.firestore.FieldValue.serverTimestamp()
     After   →  addDoc(collection(db, 'meetings'), { ... })
                serverTimestamp()   ← imported at the top

   Validation logic and variable names are unchanged.           */

document.getElementById('schedule-form').addEventListener('submit', async function (e) {
  e.preventDefault();

  if (currentRole !== 'Admin' && currentRole !== 'Treasurer') {
    alert('Only Admins and Treasurers can schedule meetings.');
    return;
  }

  const data = Object.fromEntries(new FormData(this));

  if (!data.group || !data.date || !data.time || !data.location || !data.agenda) {
    alert('Please fill in all required fields.');
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  if (data.date < today) {
    alert('Please select a future date.');
    return;
  }

  if (data.time < MEETING_TIME_MIN || data.time > MEETING_TIME_MAX) {
    alert('Meeting time must be between 8:00 AM and 8:00 PM.');
    return;
  }

  const submitBtn = this.querySelector('button[type="submit"]');
  submitBtn.disabled    = true;
  submitBtn.textContent = 'Saving…';

  try {
    /* CHANGED: addDoc(collection(...), payload) instead of db.collection().add()
       serverTimestamp() instead of firebase.firestore.FieldValue.serverTimestamp() */
    await addDoc(collection(db, 'meetings'), {
      groupId:   currentGroupId,
      title:     data.agenda.split('\n')[0].substring(0, 60),
      date:      data.date,
      time:      data.time,
      location:  data.location,
      agenda:    data.agenda,
      minutes:   '',
      createdBy: currentUser.uid,
      createdAt: serverTimestamp(),          /* CHANGED: serverTimestamp() not FieldValue.serverTimestamp() */
    });

    this.reset();

    const timeInput = document.getElementById('meeting-time');
    if (timeInput) {
      timeInput.min = MEETING_TIME_MIN;
      timeInput.max = MEETING_TIME_MAX;
    }

  } catch (err) {
    console.error('Failed to schedule meeting:', err);
    alert('Something went wrong. Please try again.');
  } finally {
    submitBtn.disabled    = false;
    submitBtn.textContent = 'Schedule Meeting';
  }
});


/* ─────────────────────────────────────────────────────────────
   10. RECORD MINUTES — open dialog  (Task 5)
   ─────────────────────────────────────────────────────────────
   CHANGED FROM COMPAT:
     Before  →  db.collection('meetings').doc(meetingId).get().then(...)
     After   →  getDoc(doc(db, 'meetings', meetingId)).then(...)

   Also: doc.exists is now doc.exists() — a method, not a property.
   Variable names and logic are unchanged.                       */

function openMinutes(meetingId, title, canEdit) {
  currentMeetingId = meetingId;

  document.getElementById('dialog-title').textContent =
    (canEdit ? 'Record Minutes — ' : 'View Minutes — ') + title;

  const textarea = document.getElementById('minutes-text');
  const saveBtn  = document.querySelector('#minutes-form button[type="submit"]');

  /* CHANGED: getDoc(doc(...)) instead of db.collection().doc().get() */
  getDoc(doc(db, 'meetings', meetingId))
    .then((docSnap) => {
      textarea.value    = docSnap.exists() ? (docSnap.data().minutes || '') : ''; /* CHANGED: exists() */
      textarea.readOnly = !canEdit;
      saveBtn.hidden    = !canEdit;

      document.getElementById('minutes-dialog').showModal();
    })
    .catch((err) => {
      console.error('Failed to fetch minutes:', err);
    });
}


/* ─────────────────────────────────────────────────────────────
   11. RECORD MINUTES — save  (Task 5)
   ─────────────────────────────────────────────────────────────
   CHANGED FROM COMPAT:
     Before  →  db.collection('meetings').doc(currentMeetingId).update({ ... })
                firebase.firestore.FieldValue.serverTimestamp()
     After   →  updateDoc(doc(db, 'meetings', currentMeetingId), { ... })
                serverTimestamp()

   Logic, guards, and variable names are unchanged.             */

async function saveMinutes() {
  if (currentRole !== 'Admin' && currentRole !== 'Treasurer') return;

  const text = document.getElementById('minutes-text').value.trim();
  if (!text) {
    document.getElementById('minutes-text').focus();
    return;
  }

  const saveBtn = document.querySelector('#minutes-form button[type="submit"]');
  saveBtn.disabled    = true;
  saveBtn.textContent = 'Saving…';

  try {
    /* CHANGED: updateDoc(doc(...), payload) instead of db.collection().doc().update() */
    await updateDoc(doc(db, 'meetings', currentMeetingId), {
      minutes:          text,
      minutesUpdatedAt: serverTimestamp(),   /* CHANGED: serverTimestamp() */
      minutesUpdatedBy: currentUser.uid,
    });

    document.getElementById('minutes-dialog').close();
    showNotification('Minutes saved successfully.');

  } catch (err) {
    console.error('Failed to save minutes:', err);
    alert('Could not save minutes. Please try again.');
  } finally {
    saveBtn.disabled    = false;
    saveBtn.textContent = 'Save Minutes';
  }
}


/* ─────────────────────────────────────────────────────────────
   12. IN-APP NOTIFICATION BANNER  (Task 4)
   ─────────────────────────────────────────────────────────────
  
   no Firebase calls, pure DOM + timer logic.       */

function showNotification(message) {
  const banner = document.getElementById('notification-banner');
  document.getElementById('notification-body').textContent = message;
  banner.style.display = 'block';

  clearTimeout(showNotification._timer);
  showNotification._timer = setTimeout(closeBanner, 6000);
}

function closeBanner() {
  document.getElementById('notification-banner').style.display = 'none';
}


/* ─────────────────────────────────────────────────────────────
   13. UPCOMING COUNT — update the <output> element
   ─────────────────────────────────────────────────────────────
  no Firebase calls.                               */

function updateUpcomingCount() {
  const list  = document.getElementById('upcoming-list');
  const count = document.getElementById('upcoming-count');
  const n     = list.querySelectorAll('li').length;
  count.textContent = n + ' meeting' + (n !== 1 ? 's' : '');
}


/* ─────────────────────────────────────────────────────────────
   14. UTILITY — format a date string for display
   ─────────────────────────────────────────────────────────────
  converts "2026-04-19" → "19 Apr 2026".          */

function formatDate(isoDate) {
  if (!isoDate) return '';
  return new Date(isoDate).toLocaleDateString('en-ZA', {
    day:   'numeric',
    month: 'short',
    year:  'numeric',
  });
}


/* ─────────────────────────────────────────────────────────────
   15. CLEAN UP on page unload
   ─────────────────────────────────────────────────────────────
  detaches the onSnapshot listener on navigate.   */

window.addEventListener('beforeunload', () => {
  if (unsubscribeListener) unsubscribeListener();
});

/**making saveMinutes & openMinutes gloabbly accesible as they're
 called from inline onclick in the HTML but the module scope is private */
 window.openMinutes = openMinutes;
 window.saveMinutes = saveMinutes;
 window.closeBanner = closeBanner;
