/* =============================================================
     Task 1 — Schedule Meeting form (Treasurer/Admin only)
     Task 2 — Save meeting document to Firestore
     Task 3 — Meeting List view for all roles
     Task 4 — Real-time in-app notification via onSnapshot()
     Task 5 — Record Minutes feature

/* ── 1. Firebase references ──────────────────────────────────*/
const db   = firebase.firestore();
const auth = firebase.auth();


/* ── 2. Module-level state ───────────────────────────────────
   currentUser      — populated once onAuthStateChanged fires.
   currentRole      — 'Admin' | 'Treasurer' | 'Member', read
                      from the user's Firestore document.
   currentGroupId   — the single group this user belongs to.
                      Resolved via the members subcollection
                      (groups/{groupId}/members/{memberId}).
                      Null if the user has no group yet.
                      ASSUMPTION: a user is in at most 1 group.
   currentMeetingId — the Firestore doc id of the meeting whose
                      minutes modal is currently open.
   unsubscribeListener — holds the onSnapshot unsubscribe fn so
                      we can detach it when the user logs out.   */

let currentUser         = null;
let currentRole         = null;
let currentGroupId      = null;   
let currentMeetingId    = null;
let unsubscribeListener = null;

/* ── Time boundary constants ─────────────────────────────────
   Meetings may only be scheduled between 08:00 and 20:00.*/
const MEETING_TIME_MIN = '08:00'; 
const MEETING_TIME_MAX = '20:00'; 


/* ─────────────────────────────────────────────────────────────
   3. ROLE GUARD
   ─────────────────────────────────────────────────────────────
   Waits for Firebase Authentication to resolve, then reads the user's
   role from Firestore and resolves their group membership.

   Firestore path:  users/{uid}
   Document fields:  role  ('Admin' | 'Treasurer' | 'Member')

   What happens per role:
     Admin / Treasurer — schedule form stays visible; page loads.
     Member            — schedule form is hidden; page loads.
     Not logged in     — redirected to /login.html immediately.   */

auth.onAuthStateChanged(async (user) => {
  if (!user) {
    window.location.href = 'login.html';
    return;
  }

  currentUser = user;

  try {
    /* ── Fetch the user's app-level role from Firestore ── */
    const userDoc = await db
      .collection('users')
      .doc(user.uid)
      .get();

    if (!userDoc.exists) {
      window.location.href = 'login.html';
      return;
    }

    currentRole = userDoc.data().role;

    /* ── Resolve which group this user belongs to ──────────
       In place of memberIds array (which is to be added later), each
       group stores members in a subcollection:
         groups/{groupId}/members/{memberId}  →  { uid, role, joinedAt }

       Run a collectionGroup query to find the member doc
       whose 'uid' field matches the current user. The grandparent
       document id of that result is our groupId.

       REQUIRES a Firestore collectionGroup index:
         Collection group : members
         Field            : uid
         Order            : Ascending*/
    const memberSnap = await db
      .collectionGroup('members')       /* search ALL 'members' subcollections  */
      .where('uid', '==', user.uid)     /* find the doc belonging to this user  */
      .limit(1)                         /* user is part of 1 group max   */
      .get();

    if (!memberSnap.empty) {
      /* Path: groups/{groupId}/members/{memberId}
         .parent       → CollectionReference for 'members'
         .parent.parent → DocumentReference for the group doc
         .id           → the groupId string we need            */
      currentGroupId = memberSnap.docs[0].ref.parent.parent.id;
    }
    /* If empty, currentGroupId stays null.
       The UI will show an empty state and the listener won't fire. */

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
   The form section is hidden entirely for Members.

   Also sets min/max on the time input to restrict the browser's
   native picker to the 08:00–20:00 window. A second validation
   check in the form submit handler (Section 9) ensures this
   cannot be bypassed via DevTools.                              */

function applyRoleUI(role) {
  const scheduleCard = document.querySelector('section[aria-labelledby="schedule-heading"]');

  if (role === 'Member') {
    scheduleCard.hidden = true;
    document.querySelector('section.meetings-layout').style.gridTemplateColumns = '1fr';
  }

  /* ── Enforce time picker boundaries (8 AM – 8 PM) ── */
  const timeInput = document.getElementById('meeting-time');
  if (timeInput) {
    timeInput.min = MEETING_TIME_MIN; /* '08:00' */
    timeInput.max = MEETING_TIME_MAX; /* '20:00' */
  }
}


/* ─────────────────────────────────────────────────────────────
   5. LOAD USER'S GROUP into the <select>
   ─────────────────────────────────────────────────────────────
   BEFORE: queried groups with .where('memberIds','array-contains',uid)
   AFTER:  currentGroupId was already resolved in Section 3 via
           the members subcollection collectionGroup query.
           We simply fetch that one group's name and render it.

   Because a user belongs to at most 1 group, the <select>
   becomes a single-option confirmation rather than a multi-
   choice picker.
  */

async function loadUserGroups(uid, role) {
  const select = document.getElementById('meeting-group');

  /* Clear existing hardcoded options except the placeholder */
  select.innerHTML = '<option value="" disabled selected>Select a group</option>';

  if (!currentGroupId) {
    /* No group resolved — show informational disabled option */
    /*perhaps redirect to login*/
    const opt    = document.createElement('option');
    opt.disabled = true;
    opt.textContent = 'You are not in any groups yet';
    select.appendChild(opt);
    return;
  }

  try {
    /* Fetch the single group document by its resolved id */
    const groupDoc = await db
      .collection('groups')
      .doc(currentGroupId)
      .get();

    if (!groupDoc.exists) return;

    const opt    = document.createElement('option');
    opt.value    = groupDoc.id;
    opt.textContent = groupDoc.data().name; 
    opt.selected = true;                    /* auto-select the only available group   */
    select.appendChild(opt);

  } catch (err) {
    console.error('Failed to load group:', err);
  }
}


/* ─────────────────────────────────────────────────────────────
   6. REAL-TIME MEETING LISTENER  (Task 3 + Task 4)
   ─────────────────────────────────────────────────────────────
   Attaches a Firestore onSnapshot() listener to the meetings
   collection. Now that currentGroupId is known, we filter
   server-side with .where('groupId', '==', currentGroupId) so
   only this group's meetings stream to the client. 

   INDEX REQUIRED: groupId (ASC) + date (ASC) — create in
   Firebase Console → Firestore → Indexes → Composite.
*/

function startMeetingListener(uid, role) {
  if (unsubscribeListener) unsubscribeListener();

  document.getElementById('upcoming-list').innerHTML = '';
  document.querySelector('ul.meeting-list[aria-label="Past meetings"]').innerHTML = '';

  /* Nothing to listen to if the user has no group yet */
  if (!currentGroupId) return;

  unsubscribeListener = db
    .collection('meetings')
    .where('groupId', '==', currentGroupId) /* ← scoped to user's single group */
    .orderBy('date', 'asc')
    .onSnapshot(
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
   Decides whether the meeting is upcoming or past, builds the
   <li> element, and inserts it into the right <ol>/<ul>.

   Minutes button is labelled differently depending on whether
   minutes have already been recorded.

   For Members: the Minutes button is hidden (they cannot write
   minutes). This is enforced both here (display) and by
   Firestore security rules on the backend.                     */

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
   Handles form submission. Validates required fields, then
   writes a new document to the Firestore meetings collection.

   Additional time validation because HTML
   attributes can be removed or bypassed via DevTools. Not that anyone would for this though tbh.

   groupId written to Firestore is always currentGroupId — the
   value resolved from the members subcollection in Section 3,
   not the <select> value (which is just a visual confirmation).*/

document.getElementById('schedule-form').addEventListener('submit', async function (e) {
  e.preventDefault();

  if (currentRole !== 'Admin' && currentRole !== 'Treasurer') {
    alert('Only Admins and Treasurers can schedule meetings.');
    return;
  }

  const data = Object.fromEntries(new FormData(this));

  /* ── Required fields ── */
  if (!data.group || !data.date || !data.time || !data.location || !data.agenda) {
    alert('Please fill in all required fields.');
    return;
  }

  /* ── Future date ── */
  const today = new Date().toISOString().slice(0, 10);
  if (data.date < today) {
    alert('Please select a future date.');
    return;
  }

  /* ── Time window: 08:00–20:00 ───────────── */
  if (data.time < MEETING_TIME_MIN || data.time > MEETING_TIME_MAX) {
    alert('Meeting time must be between 8:00 AM and 8:00 PM.');
    return;
  }

  const submitBtn = this.querySelector('button[type="submit"]');
  submitBtn.disabled    = true;
  submitBtn.textContent = 'Saving…';

  try {
    await db.collection('meetings').add({
      groupId:   currentGroupId,                               /* resolved group id           */
      title:     data.agenda.split('\n')[0].substring(0, 60), /* first line of agenda        */
      date:      data.date,                                    /* "YYYY-MM-DD"                */
      time:      data.time,                                    /* "HH:MM", within 08:00–20:00 */
      location:  data.location,
      agenda:    data.agenda,
      minutes:   '',                                           
      createdBy: currentUser.uid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    this.reset();

    /* Re-apply time constraints — form.reset() clears min/max  */
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
   Called by the Minutes/Edit/View button on each meeting item.

   meetingId   — Firestore doc id, stored in data-meeting-id.
   title       — display name shown in the dialog heading.
   canEdit     — true for Admin/Treasurer, false for Members. Textarea is readonly for plebs*/

function openMinutes(meetingId, title, canEdit) {
  currentMeetingId = meetingId;

  document.getElementById('dialog-title').textContent =
    (canEdit ? 'Record Minutes — ' : 'View Minutes — ') + title;

  const textarea  = document.getElementById('minutes-text');
  const saveBtn   = document.querySelector('#minutes-form button[type="submit"]');

  db.collection('meetings')
    .doc(meetingId)
    .get()
    .then((doc) => {
      textarea.value    = doc.exists ? (doc.data().minutes || '') : '';
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
   document using update().

   Also stamps minutesUpdatedAt and minutesUpdatedBy for audit.  */

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
    await db
      .collection('meetings')
      .doc(currentMeetingId)
      .update({
        minutes:          text,
        minutesUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
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
   showNotification() is called by the onSnapshot listener
   whenever a new meeting document is added to Firestore.
   The banner auto-dismisses after 6 seconds.
   closeBanner() is also wired to the × button in the HTML.     */

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

