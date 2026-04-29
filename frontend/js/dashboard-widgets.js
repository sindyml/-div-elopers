// js/dashboard-widgets.js
import { auth, db } from "./firebase-config.js";
import {
  getUserGroups,
  getUserRoleInGroup,
  checkAndAcceptInvites,
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
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { COLLECTIONS, ROLES } from "./constants.js";

(function () {
    const grouplist     = document.getElementById('grouplist');
    const memberlist    = document.getElementById('memberlist');
    const membersBlock  = document.getElementById('members-list-block');
    const currentGroupNameEl = document.getElementById('current-group-name');
    const inviteForm    = document.getElementById('invite-form');
    const inviteMessage = document.getElementById('inviteMessage');
    const meetingsContainer = document.getElementById('meetings-container');
    const contributionsContainer = document.getElementById('contributions-container');
    const payoutContainer        = document.getElementById('payout-container');
    const notificationRoot  = document.getElementById('notification-root');
    const statMyContributions    = document.getElementById('stat-my-contributions');
    const statBalance            = document.getElementById('stat-balance');
    const statPayout             = document.getElementById('stat-payout');
    const statPayoutName         = document.getElementById('stat-payout-name');
    const payoutViewAll          = document.getElementById('payout-view-all');

    let selectedGroupId = null;
    let userRole        = null;
    let unsubMeetings     = null;
    let unsubContributions = null;

    /* ── Load and render the user's group members ────────────── */
    const loadMembers = async (groupId, groupName) => {
      if (!memberlist) return;
      memberlist.innerHTML = '<li>Loading members...</li>';
      membersBlock.style.display = 'block';
      currentGroupNameEl.textContent = groupName;

      try {
        const membersSnap = await getDocs(collection(db, `groups/${groupId}/members`));
        memberlist.innerHTML = '';

        const memberPromises = membersSnap.docs.map(async (docSnap) => {
          const memberData = docSnap.data();
          let displayName = 'User ' + docSnap.id.substring(0, 5);

          try {
            const userDoc = await getDocs(query(collection(db, COLLECTIONS.USERS), where('__name__', '==', docSnap.id), limit(1)));
            if (!userDoc.empty) {
              const userData = userDoc.docs[0].data();
              displayName = userData.displayName || userData.name || userData.email || displayName;
            }
          } catch (e) { console.error(e); }

          return { displayName, role: memberData.role };
        });

        const members = await Promise.all(memberPromises);

        members.forEach(member => {
          const li = document.createElement('li');
          const nameSpan = document.createElement('span');
          nameSpan.textContent = member.displayName;

          const roleSmall = document.createElement('small');
          roleSmall.className = 'badge';
          roleSmall.textContent = member.role;

          li.appendChild(nameSpan);
          li.appendChild(document.createTextNode(' '));
          li.appendChild(roleSmall);
          memberlist.appendChild(li);
        });
      } catch (err) {
        console.error(err);
        memberlist.innerHTML = '<li>Error loading members</li>';
      }
    };

    const loadGroups = async (uid) => {
      if (!grouplist) return [];
      const groups = await getUserGroups(uid);
      grouplist.innerHTML = '';
      groups.forEach(group => {
          const li = document.createElement('li');
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = group.name;
          button.onclick = async () => {
            selectedGroupId = group.id;
            userRole = await getUserRoleInGroup(group.id, uid);
            await loadMembers(group.id, group.name);

            // Update main dashboard stats and SA widget
            if (window.loadDashboardData) {
              const balance = await window.loadDashboardData(auth.currentUser, group.id);
              if (window.renderSAWidget) {
                await window.renderSAWidget(balance);
                window.wireRefreshButton(balance);
              }
            }

            // Update meetings widget for this group specifically
            startMeetingListener([group.id]);

            // Update payout widget for this group
            await loadPayoutWidget(uid, [group.id]);
          };
          li.appendChild(button);
          grouplist.appendChild(li);
      });
      return groups.map(g => g.id);
    };

    if (inviteForm) {
      inviteForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('inviteEmail').value.trim();
        if (!selectedGroupId) { alert('Please select a group first'); return; }
        if (userRole?.toLowerCase() !== ROLES.ADMIN.toLowerCase()) { alert('Only admins can invite members'); return; }
        try {
          await sendInvite(selectedGroupId, email, auth.currentUser.uid);
          inviteMessage.textContent = 'Invite Sent!';
        } catch (err) {
          inviteMessage.textContent = 'Error sending invite';
          console.error(err);
        }
      });
    }

    function fmtDate(iso) {
      const d = new Date(iso);
      return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
    }

    function fmtRand(amount) {
      return 'R ' + Number(amount).toLocaleString('en-ZA');
    }

    function fmtTime(t) {
      if (!t) return '';
      const [h, m] = t.split(':');
      const hr = parseInt(h, 10);
      const ampm = hr >= 12 ? 'PM' : 'AM';
      return ((hr % 12) || 12) + ':' + m + ' ' + ampm;
    }

    function buildMeetingWidget(meeting) {
      const d = new Date(meeting.date);
      const day = d.getDate();
      const monthStr = d.toLocaleString('en-ZA', { month: 'short' }).toUpperCase();
      const title = (meeting.title || meeting.agenda?.split('\n')[0] || 'Untitled').substring(0, 50);

      const li = document.createElement('li');
      li.className = 'meeting-widget-item';

      const timeEl = document.createElement('time');
      timeEl.className = 'meeting-widget-date';

      const strongEl = document.createElement('strong');
      strongEl.textContent = String(day);

      const spanEl = document.createElement('span');
      spanEl.textContent = monthStr;

      timeEl.appendChild(strongEl);
      timeEl.appendChild(spanEl);

      const infoEl = document.createElement('div');
      infoEl.className = 'meeting-widget-info';

      const titleEl = document.createElement('p');
      titleEl.className = 'meeting-widget-title';
      titleEl.textContent = title;

      const metaEl = document.createElement('small');
      metaEl.className = 'meeting-widget-meta';
      const metaText = `${meeting.time ? fmtTime(meeting.time) : ''}${meeting.location ? ' · ' + meeting.location : ''}`;
      metaEl.textContent = metaText;

      infoEl.appendChild(titleEl);
      infoEl.appendChild(metaEl);

      li.appendChild(timeEl);
      li.appendChild(infoEl);

      return li;
    }

    function startMeetingListener(groupIds) {
      if (unsubMeetings) unsubMeetings();
      if (!meetingsContainer) return;
      if (!groupIds.length) { meetingsContainer.innerHTML = '<p class="meetings-widget-empty">No upcoming meetings.</p>'; return; }
      const today = new Date().toISOString().slice(0, 10);
      const q = query(collection(db, COLLECTIONS.MEETINGS), where('groupId', 'in', groupIds.slice(0, 10)), where('date', '>=', today), orderBy('date', 'asc'), limit(5));
      unsubMeetings = onSnapshot(q, (snapshot) => {
          const meetings = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
          if (!meetings.length) { meetingsContainer.innerHTML = '<p class="meetings-widget-empty">No upcoming meetings.</p>'; return; }
          const ul = document.createElement('ul');
          ul.className = 'meeting-widget-list';
          meetings.forEach(m => ul.appendChild(buildMeetingWidget(m)));
          meetingsContainer.innerHTML = '';
          meetingsContainer.appendChild(ul);
      });
    }

    function startContributionListener(uid, groupMap) {
        if (unsubContributions) unsubContributions();
        if (!contributionsContainer) return;
        const q = query(collection(db, COLLECTIONS.CONTRIBUTIONS), where('userId', '==', uid), orderBy('date', 'desc'), limit(10));
        unsubContributions = onSnapshot(q, (snapshot) => {
            const contributions = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            if (!contributions.length) { contributionsContainer.innerHTML = '<p class="widget-empty">No contributions.</p>'; return; }
            const ul = document.createElement('ul');
            ul.className = 'contribution-widget-list';
            contributions.slice(0, 5).forEach(c => {
                const li = document.createElement('li');
                li.className = 'contribution-widget-item';

                const infoDiv = document.createElement('div');
                infoDiv.className = 'contribution-widget-info';

                const amountP = document.createElement('p');
                amountP.className = 'contribution-widget-amount';
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

            const confirmed = contributions.filter(c => c.status === 'confirmed');
            const totalAmount = confirmed.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
            if (statMyContributions) statMyContributions.textContent = fmtRand(totalAmount);
        });
    }

    async function loadPayoutWidget(uid, groupIds) {
      if (!payoutContainer) return;
      if (!groupIds.length) { payoutContainer.innerHTML = '<p class="widget-empty">Join a group to see payout schedules.</p>'; return; }
      try {
        let payouts = [];
        let activeGroupId = null;
        for (const gid of groupIds.slice(0, 5)) {
          const snap = await getDocs(query(collection(db, COLLECTIONS.PAYOUTS), where('groupId', '==', gid), orderBy('order', 'asc')));
          if (!snap.empty) {
            payouts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            activeGroupId = gid;
            break;
          }
        }
        if (!payouts.length) { payoutContainer.innerHTML = '<p class="widget-empty">No payout schedule set up yet.</p>'; return; }
        if (payoutViewAll && activeGroupId) payoutViewAll.href = 'contributions-payout.html?groupId=' + activeGroupId;
        const today = new Date().toISOString().slice(0, 10);
        const upcoming = payouts.find(p => p.payoutDate >= today);
        if (upcoming) {
          if (statPayout) statPayout.textContent = fmtDate(upcoming.payoutDate);
          if (statPayoutName) statPayoutName.textContent = upcoming.userDisplayName + "'s turn";
        }
        const ul = document.createElement('ul');
        ul.className = 'payout-widget-list';
        payouts.forEach(p => {
            const isCurrentUser = p.userId === uid;
            const li = document.createElement('li');
            li.className = 'payout-widget-item' + (isCurrentUser ? ' payout-widget-item--you' : '');

            const orderDiv = document.createElement('div');
            orderDiv.className = 'payout-widget-order';
            orderDiv.textContent = `#${p.order}`;

            const infoDiv = document.createElement('div');
            infoDiv.className = 'payout-widget-info';

            const nameP = document.createElement('p');
            nameP.className = 'payout-widget-name';
            nameP.textContent = p.userDisplayName + (isCurrentUser ? ' (You)' : '');

            const dateSmall = document.createElement('small');
            dateSmall.className = 'payout-widget-date';
            dateSmall.textContent = fmtDate(p.payoutDate);

            infoDiv.appendChild(nameP);
            infoDiv.appendChild(dateSmall);

            const amountDiv = document.createElement('div');
            amountDiv.className = 'payout-widget-amount';
            amountDiv.textContent = fmtRand(p.amount);

            li.appendChild(orderDiv);
            li.appendChild(infoDiv);
            li.appendChild(amountDiv);
            ul.appendChild(li);
        });
        payoutContainer.innerHTML = '';
        payoutContainer.appendChild(ul);
      } catch (err) { console.error('[Payout Widget] Error:', err); }
    }

    auth.onAuthStateChanged(async (user) => {
      if (user) {
        await checkAndAcceptInvites(user);
        const groupIds = await loadGroups(user.uid);
        const groupMap = {};
        for(const id of groupIds) {
            const details = await getGroupDetails(id);
            if(details) groupMap[id] = details.name;
        }
        startMeetingListener(groupIds);
        startContributionListener(user.uid, groupMap);
        await loadPayoutWidget(user.uid, groupIds);
      }
    });
})();
