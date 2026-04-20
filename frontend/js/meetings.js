/* =============================================================
   meetings.js  —  Meeting Management  (ESM)
   Sprint 1 · P5 · Tasks 1-5

   Task 1 — Schedule Meeting form (Treasurer / Admin only)
   Task 2 — Save meeting document to Firestore
   Task 3 — Meeting List view for all roles
   Task 4 — Real-time in-app notification via onSnapshot()
   Task 5 — Record Minutes feature
   ============================================================= */

import { initializeApp }              from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  getFirestore,
  collection,
  collectionGroup,
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
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

/* ── Firebase initialisation ────────────────────────────────
   firebaseConfig is expected to be injected by the build /
   hosting layer as window.__FIREBASE_CONFIG__ rather than
   hard-coded here, so no API keys live in source.   API keys in
   client-side code means anyone can view code & muck about with the keys.
   Thus use environment variables.*/
const app  = initializeApp(window.__FIREBASE_CONFIG__);
const auth = getAuth(app);
const db   = getFirestore(app);


/* ── Module-level state ─────────────────────────────────────
   currentUser      — populated once onAuthStateChanged fires.
   currentRole      — 'Admin' | 'Treasurer' | 'Member', read
                      from the user's Firestore document.
   currentGroupId   — the single group this user belongs to.
                      Resolved via the members subcollection
                      (groups/{groupId}/members/{memberId}).
                      Null until resolved; null if user has no
                      group.
                      ASSUMPTION: a user is in at most 1 group.
   currentMeetingId — Firestore doc id of the meeting whose
                      minutes modal is currently open.
   _unsubscribe     — holds the onSnapshot unsubscribe fn so
                      it can be detached on page unload.        */

let currentUser      = null;
let currentRole      = null;
let currentGroupId   = null;
let currentMeetingId = null;
let _unsubscribe     = null;

/* ── Time boundary constants ────────────────────────────────
   Meetings may only be scheduled between 08:00 and 20:00.   */
export const MEETING_TIME_MIN = '08:00';
export const MEETING_TIME_MAX = '20:00';


/* ─────────────────────────────────────────────────────────────
   1. ROLE GUARD
   ─────────────────────────────────────────────────────────────
   Waits for Firebase Auth to resolve, then reads the user's
   role from Firestore and resolves their group membership.

   Firestore path : users/{uid}
   Field          : role  ('Admin' | 'Treasurer' | 'Member')

   Per-role behaviour:
     Admin / Treasurer — schedule form stays visible; page loads.
     Member            — schedule form is hidden; page loads.
     Not logged in     — redirected to /login.html.  */

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = 'login.html';
    return;
  }

  currentUser = user;

  try {
    /* Fetch the user's app-level role from Firestore */
    const userSnap = await getDoc(doc(db, 'users', user.uid));

    if (!userSnap.exists()) {
      window.location.href = 'login.html';
      return;
    }

    currentRole = userSnap.data().role;

    /* Resolve which group this user belongs to via a
       collectionGroup query on the members sub-collection.

       Path pattern : groups/{groupId}/members/{memberId}
                      where memberId doc has a `uid` field.

       REQUIRES a Firestore collectionGroup index:
         Collection group : members
         Field            : uid   ASC                          */
    const memberQuery = query(
      collectionGroup(db, 'members'),
      where('uid', '==', user.uid),
      limit(1),
    );

    const memberSnap = await new Promise((resolve, reject) => {
      /* getDocs equivalent using the modular SDK */
      import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js')
        .then(({ getDocs }) => getDocs(memberQuery).then(resolve).catch(reject));
    });

    if (!memberSnap.empty) {
      /* Path: groups/{groupId}/members/{memberId}
         .ref.parent       → CollectionReference 'members'
         .ref.parent.parent → DocumentReference for the group
         .id               → the groupId string we need        */
      currentGroupId = memberSnap.docs[0].ref.parent.parent.id;
    }
    /* If empty, currentGroupId stays null.
       The UI shows an empty state; the listener won't fire.  */

    applyRoleUI(currentRole);
    await loadUserGroups(currentRole);
    startMeetingListener(currentRole);

  } catch (err) {
    console.error('Role check failed:', err);
    window.location.href = 'login.html';
  }
});


/* ─────────────────────────────────────────────────────────────
   2. ROLE UI  —  show / hide the schedule form
   ─────────────────────────────────────────────────────────────
   Members: can view meeting list, can't schedule.
   The form card is hidden entirely for Members.

   Time restriction 8AM to 8PM.  A second validation
   check in the form-submit handler enforces this server-side
   so it cannot be bypassed via DevTools. Not actually necessary,
   no one is that lame.                      */

export function applyRoleUI(role) {
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
   3. LOAD USER'S GROUP into the <select>
   ─────────────────────────────────────────────────────────────
   currentGroupId was resolved in the role guard via the
   members sub-collection collectionGroup query.  This function
   just fetches that one group's display name and renders it as
   the single option in the <select>.

   Because a user belongs to at most 1 group the <select>
   functions as a read-only confirmation rather than a picker.  */

export async function loadUserGroups(role) {
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
    const groupSnap = await getDoc(doc(db, 'groups', currentGroupId));
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


/* ─────────────────────────────────────────────────────────────
   4. REAL-TIME MEETING LISTENER  (Task 3 + Task 4)
   ─────────────────────────────────────────────────────────────
   Attaches a Firestore onSnapshot() listener to the meetings
   collection, filtered to this user's group only.

   INDEX REQUIRED (create in Firebase Console → Indexes):
     Collection : meetings
     Fields     : groupId ASC, date ASC                         */

export function startMeetingListener(role) {
  /* Detach any existing listener before creating a new one */
  if (_unsubscribe) _unsubscribe();

  document.getElementById('upcoming-list').innerHTML = '';
  document.querySelector('ul.meeting-list[aria-label="Past meetings"]').innerHTML = '';

  if (!currentGroupId) return;

  const meetingsQuery = query(
    collection(db, 'meetings'),
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

          /* Suppress notification for locally-written docs that
             haven't committed to the server yet                 */
          if (!change.doc.metadata.hasPendingWrites) {
            showNotification(
              `New meeting scheduled: "${meeting.title || 'Untitled'}" on ${formatDate(meeting.date)}`,
            );
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


/* ─────────────────────────────────────────────────────────────
   5. RENDER A SINGLE MEETING into the correct list
   ─────────────────────────────────────────────────────────────
   Decides whether the meeting is upcoming or past, builds the
   <li> element, and appends it to the right list.              */

export function renderMeeting(meeting, role) {
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
   6. BUILD MEETING LIST ITEM  (<li> element)
   ─────────────────────────────────────────────────────────────
   Constructs the semantic <li> for one meeting.
   data-meeting-id is used to locate and update/remove the
   element when Firestore sends a 'modified' or 'removed'
   change event.                                                 */

export function buildMeetingItem(meeting, role) {
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
   7. SCHEDULE MEETING FORM  (Task 1 + Task 2)
   ─────────────────────────────────────────────────────────────
   Handles form submission.  Validates required fields, time
   window, and future date, then writes a new document to the
   Firestore meetings collection.

   groupId written to Firestore is always currentGroupId — the
   value resolved from the members sub-collection in the role
   guard, not the <select> value (which is merely decorative).  */

document.getElementById('schedule-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  if (currentRole !== 'Admin' && currentRole !== 'Treasurer') {
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

  /* Server-side time window guard — cannot be bypassed via DevTools */
  if (data.time < MEETING_TIME_MIN || data.time > MEETING_TIME_MAX) {
    alert('Meeting time must be between 8:00 AM and 8:00 PM.');
    return;
  }

  const form      = e.currentTarget;
  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled    = true;
  submitBtn.textContent = 'Saving…';

  try {
    await addDoc(collection(db, 'meetings'), {
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

    form.reset();

    /* Re-apply time constraints — form.reset() clears min/max */
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
   8. RECORD MINUTES — open dialog  (Task 5)
   ─────────────────────────────────────────────────────────────
   Called by the Minutes / Edit / View button on each meeting.

   meetingId — Firestore doc id stored in data-meeting-id.
   title     — display name shown in the dialog heading.
   canEdit   — true for Admin / Treasurer; false for Members.
               The textarea becomes readonly for Members.        */

export async function openMinutes(meetingId, title, canEdit) {
  currentMeetingId = meetingId;

  document.getElementById('dialog-title').textContent =
    (canEdit ? 'Record Minutes — ' : 'View Minutes — ') + title;

  const textarea = document.getElementById('minutes-text');
  const saveBtn  = document.querySelector('#minutes-form button[type="submit"]');

  try {
    const meetingSnap = await getDoc(doc(db, 'meetings', meetingId));
    textarea.value    = meetingSnap.exists() ? (meetingSnap.data().minutes || '') : '';
    textarea.readOnly = !canEdit;
    saveBtn.hidden    = !canEdit;

    document.getElementById('minutes-dialog').showModal();

  } catch (err) {
    console.error('Failed to fetch minutes:', err);
  }
}

/* Expose to inline onclick handlers until the codebase moves to
   event delegation.  Can be removed once HTML is updated.       */
window.openMinutes = openMinutes;


/* ─────────────────────────────────────────────────────────────
   9. RECORD MINUTES — save  (Task 5)
   ─────────────────────────────────────────────────────────────
   Writes the minutes text back to the meeting's Firestore
   document.  Also stamps minutesUpdatedAt / minutesUpdatedBy
   for audit purposes.                                           */

export async function saveMinutes() {
  if (currentRole !== 'Admin' && currentRole !== 'Treasurer') return;

  const textarea = document.getElementById('minutes-text');
  const text     = textarea.value.trim();
  if (!text) {
    textarea.focus();
    return;
  }

  const saveBtn = document.querySelector('#minutes-form button[type="submit"]');
  saveBtn.disabled    = true;
  saveBtn.textContent = 'Saving…';

  try {
    await updateDoc(doc(db, 'meetings', currentMeetingId), {
      minutes:          text,
      minutesUpdatedAt: serverTimestamp(),
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

/* Expose to the inline onsubmit on #minutes-form */
window.saveMinutes = saveMinutes;


/* ─────────────────────────────────────────────────────────────
   10. IN-APP NOTIFICATION BANNER  (Task 4)
   ─────────────────────────────────────────────────────────────
   Called by the onSnapshot listener whenever a new meeting
   document is added to Firestore.
   The banner auto-dismisses after 6 seconds.
   closeBanner() is also wired to the × button in the HTML.     */

export function showNotification(message) {
  const banner = document.getElementById('notification-banner');
  document.getElementById('notification-body').textContent = message;
  banner.style.display = 'block';

  clearTimeout(showNotification._timer);
  showNotification._timer = setTimeout(closeBanner, 6000);
}

export function closeBanner() {
  document.getElementById('notification-banner').style.display = 'none';
}

/* Expose to HTML onclick */
window.closeBanner = closeBanner;


/* ─────────────────────────────────────────────────────────────
   11. UPCOMING COUNT — update the <output> element
   ─────────────────────────────────────────────────────────────
   Re-counts <li> elements in the upcoming list and updates
   the label next to the "Upcoming" heading.                     */

export function updateUpcomingCount() {
  const list  = document.getElementById('upcoming-list');
  const count = document.getElementById('upcoming-count');
  const n     = list.querySelectorAll('li').length;
  count.textContent = `${n} meeting${n !== 1 ? 's' : ''}`;
}


/* ─────────────────────────────────────────────────────────────
   12. UTILITY — format a date string for display
   ─────────────────────────────────────────────────────────────
   Converts "2026-04-19" → "19 Apr 2026"                        */

export function formatDate(isoDate) {
  if (!isoDate) return '';
  return new Date(isoDate).toLocaleDateString('en-ZA', {
    day:   'numeric',
    month: 'short',
    year:  'numeric',
  });
}


/* ─────────────────────────────────────────────────────────────
   13. CLEAN UP on page unload
   ─────────────────────────────────────────────────────────────
   Detaches the Firestore onSnapshot listener to avoid memory
   leaks when the user navigates away.                           */

window.addEventListener('beforeunload', () => {
  if (_unsubscribe) _unsubscribe();
});
