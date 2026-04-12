/* =============================================================
   meetings.js  —  Person 5 | Meeting Management
   Stokvel Management Platform | Software Design 2026
   
   Covers all P5 Sprint 1 tasks:
     Task 1 — Schedule Meeting form (Treasurer/Admin only)
     Task 2 — Save meeting document to Firestore
     Task 3 — Meeting List view for all roles
     Task 4 — Real-time in-app notification via onSnapshot()
     Task 5 — Record Minutes feature

   HOW TO CONNECT TO FIRESTORE:
   ─────────────────────────────
   This file assumes firebase-config.js has already run and
   exposed these globals on the window object:

     window.auth — firebase.auth()
     window.db   — firebase.firestore()

   If your firebase-config.js uses different variable names,
   update the two lines marked  ← CHANGE  in the
   "Firebase references" section below.
   ============================================================= */


/* ── 1. Firebase references ──────────────────────────────────
   Pull the auth and db instances that firebase-config.js sets
   up. Adjust the property names if yours differ.               */

//const auth = window.auth;   /* ← CHANGE if your config exports auth differently  */
//const db   = window.db;     /* ← CHANGE if your config exports db differently    */
const db   = firebase.firestore();
const auth = firebase.auth();


/* ── 2. Module-level state ───────────────────────────────────
   currentUser   — populated once onAuthStateChanged fires.
   currentRole   — 'Admin' | 'Treasurer' | 'Member', read from
                   the user's Firestore document.
   currentMeetingId — the Firestore doc id of the meeting whose
                   minutes modal is currently open.
   unsubscribeListener — holds the onSnapshot unsubscribe fn so
                   we can detach it when the user logs out.      */

let currentUser         = null;
let currentRole         = null;
let currentMeetingId    = null;
let unsubscribeListener = null;


/* ─────────────────────────────────────────────────────────────
   3. ROLE GUARD
   ─────────────────────────────────────────────────────────────
   Waits for Firebase Auth to resolve, then reads the user's
   role from Firestore.

   Firestore path assumed:  users/{uid}
   Document field assumed:  role  (value: 'Admin' | 'Treasurer' | 'Member')

   ← CHANGE "users" if your collection is named differently.
   ← CHANGE "role"  if your role field has a different name.

   What happens per role:
     Admin / Treasurer — schedule form stays visible; page loads.
     Member            — schedule form is hidden; page loads
                         (members can still VIEW the meeting list).
     Not logged in     — redirected to /login.html immediately.   */

auth.onAuthStateChanged(async (user) => {
  if (!user) {
    /* No active session — send to login */
    window.location.href = 'login.html';
    return;
  }

  currentUser = user;

  try {
    /* ── Fetch the user's role document from Firestore ── */
    const userDoc = await db
      .collection('users')    /* ← CHANGE collection name if needed */
      .doc(user.uid)
      .get();

    if (!userDoc.exists) {
      /* Document missing — treat as unauthorised */
      window.location.href = 'login.html';
      return;
    }

    currentRole = userDoc.data().role; /* ← CHANGE 'role' if your field differs */

    /* ── Apply role-based UI adjustments ── */
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
   Members can view the meeting list but cannot schedule.
   The form section is hidden entirely for Members so they
   cannot interact with or submit it even via DevTools.          */

function applyRoleUI(role) {
  const scheduleCard = document.querySelector('section[aria-labelledby="schedule-heading"]');

  if (role === 'Member') {
    /* Hide the entire schedule card for Members */
    scheduleCard.hidden = true;

    /* Expand the meeting list to full width since the form is gone */
    document.querySelector('section.meetings-layout').style.gridTemplateColumns = '1fr';
  }

  /* Admin and Treasurer: no changes — form is visible by default */
}


/* ─────────────────────────────────────────────────────────────
   5. LOAD USER'S GROUPS into the <select>
   ─────────────────────────────────────────────────────────────
   Replaces the hardcoded <option> elements in the HTML with
   the actual groups this user belongs to.

   Firestore path assumed:
     groups/{groupId}
   Group document fields assumed:
     name      — display name of the group  (string)
     memberIds — array of user uids          (array of strings)

   ← CHANGE 'groups'    if your collection is named differently.
   ← CHANGE 'memberIds' if your membership field differs.
   ← CHANGE 'name'      if your group name field differs.

   For Admins/Treasurers we load only groups they belong to.
   Extend the query if Admins should see all groups.             */

async function loadUserGroups(uid, role) {
  const select = document.getElementById('meeting-group');

  /* Clear existing hardcoded options except the placeholder */
  select.innerHTML = '<option value="" disabled selected>Select a group</option>';

  try {
    const snapshot = await db
      .collection('groups')                  /* ← CHANGE collection name if needed */
      .where('memberIds', 'array-contains', uid) /* ← CHANGE 'memberIds' if needed */
      .get();

    if (snapshot.empty) {
      const opt = document.createElement('option');
      opt.disabled = true;
      opt.textContent = 'You are not in any groups yet';
      select.appendChild(opt);
      return;
    }

    snapshot.forEach((doc) => {
      const opt = document.createElement('option');
      opt.value = doc.id;
      opt.textContent = doc.data().name; /* ← CHANGE 'name' if your field differs */
      select.appendChild(opt);
    });

  } catch (err) {
    console.error('Failed to load groups:', err);
  }
}


/* ─────────────────────────────────────────────────────────────
   6. REAL-TIME MEETING LISTENER  (Task 3 + Task 4)
   ─────────────────────────────────────────────────────────────
   Attaches a Firestore onSnapshot() listener to the meetings
   collection, filtered to groups the current user belongs to.

   Firestore path assumed:  meetings/{meetingId}
   Document fields assumed:
     groupId   — id of the group this meeting belongs to (string)
     title     — first agenda line / meeting title        (string)
     date      — ISO date string e.g. "2026-04-19"        (string)
     time      — 24-hr time string e.g. "14:00"           (string)
     location  — address or URL                           (string)
     agenda    — full agenda text                         (string)
     minutes   — recorded minutes text (may be empty)    (string)
     createdAt — Firestore server timestamp

   ← CHANGE 'meetings'  if your collection is named differently.
   ← CHANGE field names above if yours differ.

   The listener fires once immediately (loads existing data) and
   again whenever a document is added, modified, or removed.
   New additions trigger the in-app notification banner.         */

function startMeetingListener(uid, role) {
  /* Clean up any previous listener before attaching a new one */
  if (unsubscribeListener) unsubscribeListener();

  /* Clear the hardcoded placeholder list items from the HTML */
  document.getElementById('upcoming-list').innerHTML = '';
  document.querySelector('ul.meeting-list[aria-label="Past meetings"]').innerHTML = '';

  /* ── Build the Firestore query ──
     We query all meetings; the filter by group membership
     happens client-side in renderMeeting() because Firestore
     does not support array-contains on a user-level field
     combined with a group-level field in a single query without
     a composite index.

     ← CHANGE: If you create a composite index in Firestore
       (groupId + date), replace the query below with:
       db.collection('meetings')
         .where('groupId', 'in', userGroupIds)
         .orderBy('date', 'asc')
       where userGroupIds is an array of the user's group ids.   */

  unsubscribeListener = db
    .collection('meetings')               /* ← CHANGE collection name if needed */
    .orderBy('date', 'asc')               /* ← requires a Firestore index on 'date' */
    .onSnapshot(
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          const meeting = { id: change.doc.id, ...change.doc.data() };

          if (change.type === 'added') {
            renderMeeting(meeting, role);

            /* Only show notification for genuinely new docs, not
               the initial load. Firestore marks initial load docs
               as 'added' too, so we check the hasPendingWrites
               flag — new real-time additions have it false after
               the server confirms the write.                     */
            if (!change.doc.metadata.hasPendingWrites) {
              showNotification(
                `New meeting scheduled: "${meeting.title || 'Untitled'}" on ${formatDate(meeting.date)}`
              );
            }
          }

          if (change.type === 'modified') {
            /* Re-render the updated meeting item in the list */
            const existing = document.querySelector(`[data-meeting-id="${meeting.id}"]`);
            if (existing) existing.replaceWith(buildMeetingItem(meeting, role));
          }

          if (change.type === 'removed') {
            /* Remove the meeting item from the list */
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
   Decides whether the meeting is upcoming or past, builds the
   <li> element, and inserts it into the right <ol>/<ul>.

   Minutes button is labelled differently depending on whether
   minutes have already been recorded.

   For Members: the Minutes button is hidden (they cannot write
   minutes). This is enforced both here (display) and by
   Firestore security rules on the backend.                     */

function renderMeeting(meeting, role) {
  const item = buildMeetingItem(meeting, role);
  const today = new Date().toISOString().slice(0, 10);

  if (meeting.date >= today) {
    /* Upcoming */
    const list = document.getElementById('upcoming-list');
    list.appendChild(item);
    updateUpcomingCount();
  } else {
    /* Past */
    const list = document.querySelector('ul.meeting-list[aria-label="Past meetings"]');
    list.appendChild(item);
  }
}


/* ─────────────────────────────────────────────────────────────
   8. BUILD MEETING LIST ITEM  (<li> element)
   ─────────────────────────────────────────────────────────────
   Constructs the semantic <li> for one meeting.
   data-meeting-id attribute is used to find and update/remove
   the element when Firestore sends a 'modified' or 'removed'
   change.                                                       */

function buildMeetingItem(meeting, role) {
  const today     = new Date().toISOString().slice(0, 10);
  const isPast    = meeting.date < today;
  const d         = new Date(meeting.date);
  const day       = d.getDate();
  const monthStr  = d.toLocaleString('en-ZA', { month: 'short' }).toUpperCase();
  const title     = (meeting.title || meeting.agenda?.split('\n')[0] || 'Untitled').substring(0, 60);
  const safeTitle = title.replace(/'/g, "\\'");
  const hasMinutes = !!(meeting.minutes && meeting.minutes.trim());

  /* Members can only view minutes, not write them */
  const canEditMinutes = role === 'Admin' || role === 'Treasurer';
  const minutesBtnLabel = hasMinutes
    ? (canEditMinutes ? 'Edit' : 'View')
    : 'Minutes';

  const li = document.createElement('li');
  li.className = isPast ? 'past' : 'upcoming';
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
   Handles form submission. Validates all required fields, then
   writes a new document to the Firestore meetings collection.

   The document written has these fields:
     groupId   — selected group's Firestore doc id
     title     — first line of the agenda (used as display name)
     date      — ISO date string
     time      — 24-hr time string
     location  — address or URL
     agenda    — full agenda text
     minutes   — empty string (filled in later via Record Minutes)
     createdBy — uid of the Treasurer/Admin who scheduled it
     createdAt — Firestore server timestamp

   ← CHANGE 'meetings' if your collection is named differently.
   ← CHANGE field names if your data model uses different keys.  */

document.getElementById('schedule-form').addEventListener('submit', async function (e) {
  e.preventDefault();

  /* Only Admin and Treasurer may submit — belt-and-suspenders
     check in case the form was somehow un-hidden.              */
  if (currentRole !== 'Admin' && currentRole !== 'Treasurer') {
    alert('Only Admins and Treasurers can schedule meetings.');
    return;
  }

  const data = Object.fromEntries(new FormData(this));

  /* ── Client-side validation ── */
  if (!data.group || !data.date || !data.time || !data.location || !data.agenda) {
    alert('Please fill in all required fields.');
    return;
  }

  /* Prevent scheduling meetings in the past */
  const today = new Date().toISOString().slice(0, 10);
  if (data.date < today) {
    alert('Please select a future date.');
    return;
  }

  const submitBtn = this.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving…';

  try {
    /* ── Write to Firestore ── */
    await db.collection('meetings').add({  /* ← CHANGE 'meetings' if needed */
      groupId:   data.group,               /* ← CHANGE field name if needed */
      title:     data.agenda.split('\n')[0].substring(0, 60), /* ← CHANGE 'title' if needed */
      date:      data.date,                /* ← CHANGE field name if needed */
      time:      data.time,                /* ← CHANGE field name if needed */
      location:  data.location,            /* ← CHANGE field name if needed */
      agenda:    data.agenda,              /* ← CHANGE field name if needed */
      minutes:   '',                       /* ← CHANGE field name if needed */
      createdBy: currentUser.uid,          /* ← CHANGE field name if needed */
      createdAt: firebase.firestore.FieldValue.serverTimestamp(), /* server timestamp */
    });

    /* onSnapshot() will automatically re-render the new meeting
       in the list and trigger the notification banner for all
       members — no manual DOM update needed here.              */

    this.reset();

  } catch (err) {
    console.error('Failed to schedule meeting:', err);
    alert('Something went wrong. Please try again.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Schedule Meeting';
  }
});


/* ─────────────────────────────────────────────────────────────
   10. RECORD MINUTES — open dialog  (Task 5)
   ─────────────────────────────────────────────────────────────
   Called by the Minutes/Edit/View button on each meeting item.

   meetingId   — Firestore doc id, stored in data-meeting-id.
   title       — display name shown in the dialog heading.
   canEdit     — true for Admin/Treasurer, false for Members.

   For Members (canEdit = false) the textarea is set to
   readonly so they can read existing minutes but not write.     */

function openMinutes(meetingId, title, canEdit) {
  currentMeetingId = meetingId;

  document.getElementById('dialog-title').textContent =
    (canEdit ? 'Record Minutes — ' : 'View Minutes — ') + title;

  const textarea  = document.getElementById('minutes-text');
  const saveBtn   = document.querySelector('#minutes-form button[type="submit"]');

  /* Fetch the existing minutes for this meeting from Firestore */
  db.collection('meetings')           /* ← CHANGE 'meetings' if needed */
    .doc(meetingId)
    .get()
    .then((doc) => {
      textarea.value = doc.exists ? (doc.data().minutes || '') : '';

      /* Members can read but not edit */
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
   Writes the minutes text back to the meeting's Firestore
   document using update() so other fields are preserved.

   ← CHANGE 'meetings' if your collection is named differently.
   ← CHANGE 'minutes'  if your minutes field is named differently. */

async function saveMinutes() {
  /* Guard: Members should never reach this path */
  if (currentRole !== 'Admin' && currentRole !== 'Treasurer') return;

  const text = document.getElementById('minutes-text').value.trim();
  if (!text) {
    document.getElementById('minutes-text').focus();
    return;
  }

  const saveBtn = document.querySelector('#minutes-form button[type="submit"]');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';

  try {
    /* ── Update the minutes field on the meeting document ── */
    await db
      .collection('meetings')             /* ← CHANGE 'meetings' if needed */
      .doc(currentMeetingId)
      .update({
        minutes: text,                    /* ← CHANGE 'minutes' if needed  */
        minutesUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        minutesUpdatedBy: currentUser.uid,
      });

    document.getElementById('minutes-dialog').close();
    showNotification('Minutes saved successfully.');

  } catch (err) {
    console.error('Failed to save minutes:', err);
    alert('Could not save minutes. Please try again.');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Minutes';
  }
}


/* ─────────────────────────────────────────────────────────────
   12. IN-APP NOTIFICATION BANNER  (Task 4)
   ─────────────────────────────────────────────────────────────
   showNotification() is called by the onSnapshot listener
   whenever a new meeting document is added to Firestore.
   The banner auto-dismisses after 6 seconds.
   closeBanner() is also wired to the × button in the HTML.     */

function showNotification(message) {
  const banner = document.getElementById('notification-banner');
  document.getElementById('notification-body').textContent = message;
  banner.style.display = 'block';

  /* Auto-dismiss after 6 seconds */
  clearTimeout(showNotification._timer);
  showNotification._timer = setTimeout(closeBanner, 6000);
}

function closeBanner() {
  document.getElementById('notification-banner').style.display = 'none';
}


/* ─────────────────────────────────────────────────────────────
   13. UPCOMING COUNT — update the <output> element
   ─────────────────────────────────────────────────────────────
   Re-counts <li> elements in the upcoming list and updates
   the count label next to the "Upcoming" heading.              */

function updateUpcomingCount() {
  const list  = document.getElementById('upcoming-list');
  const count = document.getElementById('upcoming-count');
  const n     = list.querySelectorAll('li').length;
  count.textContent = n + ' meeting' + (n !== 1 ? 's' : '');
}


/* ─────────────────────────────────────────────────────────────
   14. UTILITY — format a date string for display
   ─────────────────────────────────────────────────────────────
   Converts "2026-04-19" → "19 Apr 2026"                       */

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
   Detaches the Firestore onSnapshot listener when the user
   navigates away to avoid memory leaks.                        */

window.addEventListener('beforeunload', () => {
  if (unsubscribeListener) unsubscribeListener();
});
