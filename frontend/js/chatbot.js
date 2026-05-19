// chatbot.js — Pure client-side Firestore chatbot
// Assumes: auth, db from firebase-config.js are globally available
import {auth , db } from "./firebase-config.js"

(function() {
  // Wait for DOM and Firebase auth to be ready
  let currentUser = null;
  let selectedGroupId = null;
  let allGroups = [];      // { id, name }

  // ---- Helper: format currency ----
  function fmtRand(amount) {
    try {
      return 'R ' + Number(amount || 0).toLocaleString('en-ZA');
    } catch { return 'R 0.00'; }
  }

  // ---- Helper: format date (YYYY-MM-DD or Firestore Timestamp) ----
  function fmtDate(value) {
    if (!value) return 'Not set';
    if (value.toDate) value = value.toDate();
    if (value instanceof Date) return value.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
    if (typeof value === 'string') return new Date(value).toLocaleDateString('en-ZA');
    return String(value);
  }

  // ---- Firestore data fetchers (same logic as dashboard widgets) ----
  async function getGroupBalance(groupId) {
    try {
      const docSnap = await db.collection('groups').doc(groupId).get();
      if (!docSnap.exists) throw new Error('Group not found');
      const data = docSnap.data();
      return { success: true, balance: data.totalBalance || data.balance || 0, name: data.name || 'your group' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async function getNextPayout(groupId) {
    try {
      const today = new Date().toISOString().slice(0,10);
      const snap = await db.collection('payouts')
        .where('groupId', '==', groupId)
        .orderBy('order')
        .get();
      if (snap.empty) return { success: false, error: 'No payout schedule found' };
      let payouts = snap.docs.map(d => {
        let data = d.data();
        if (data.payoutDate?.toDate) data.payoutDate = data.payoutDate.toDate().toISOString().slice(0,10);
        return data;
      });
      let upcoming = payouts.find(p => p.payoutDate >= today);
      let target = upcoming || payouts[payouts.length-1];
      if (!target) return { success: false, error: 'No payout information' };
      return {
        success: true,
        date: fmtDate(target.payoutDate),
        recipient: target.userDisplayName || 'member',
        amount: target.amount || 0,
        order: target.order,
        note: upcoming ? null : 'All scheduled payouts have passed.'
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async function getFullPayoutSchedule(groupId) {
    try {
      const today = new Date().toISOString().slice(0,10);
      const snap = await db.collection('payouts')
        .where('groupId', '==', groupId)
        .orderBy('order')
        .get();
      if (snap.empty) return { success: false, error: 'No payout schedule' };
      let schedule = snap.docs.map(d => {
        let data = d.data();
        let pd = data.payoutDate;
        if (pd?.toDate) pd = pd.toDate().toISOString().slice(0,10);
        return {
          order: data.order,
          name: data.userDisplayName || 'Member',
          date: fmtDate(pd),
          amount: data.amount || 0,
          isPast: (pd || '') < today
        };
      });
      return { success: true, schedule };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async function getMyContributions(groupId, uid) {
    try {
      const snap = await db.collection('contributions')
        .where('userId', '==', uid)
        .where('groupId', '==', groupId)
        .orderBy('date', 'desc')
        .limit(10)
        .get();
      let records = [];
      let totalConfirmed = 0;
      snap.forEach(d => {
        let data = d.data();
        let amount = Number(data.amount) || 0;
        let status = data.status || 'pending';
        if (status === 'confirmed') totalConfirmed += amount;
        records.push({
          amount: amount,
          date: fmtDate(data.date),
          status: status
        });
      });
      return { success: true, contributions: records, total: totalConfirmed };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async function getNextMeeting(groupId) {
    try {
      const today = new Date().toISOString().slice(0,10);
      const snap = await db.collection('meetings')
        .where('groupId', '==', groupId)
        .where('date', '>=', today)
        .orderBy('date')
        .limit(5)
        .get();
      if (snap.empty) return { success: false, error: 'No upcoming meetings' };
      const meeting = snap.docs[0].data();
      let dateDisplay = fmtDate(meeting.date);
      if (meeting.time) dateDisplay += ` at ${meeting.time}`;
      return {
        success: true,
        title: meeting.title || meeting.agenda?.split('\n')[0] || 'Meeting',
        date: dateDisplay,
        location: meeting.location || 'TBD',
        totalMeetings: snap.size
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async function getGroupMembers(groupId) {
    try {
      const snap = await db.collection('groups').doc(groupId).collection('members').get();
      let members = snap.docs.map(d => {
        let data = d.data();
        return { name: data.displayName || data.name || 'Member', role: data.role || 'member' };
      });
      return { success: true, members, count: members.length };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // ---- Intent detection ----
  function detectIntent(msg) {
    const lower = msg.toLowerCase();
    if (/(balance|how much money|savings|total saved)/.test(lower)) return 'balance';
    if (/(next payout|whose turn|when.*payout|payout date)/.test(lower)) return 'payout';
    if (/(payout schedule|full schedule|all payouts|payout order)/.test(lower)) return 'schedule';
    if (/(my contribution|contributions|paid in|my payments|how much did i pay)/.test(lower)) return 'contributions';
    if (/(meeting|next meeting|upcoming meeting|meet)/.test(lower)) return 'meeting';
    if (/(member|who is in|group members|members list)/.test(lower)) return 'members';
    if (/(help|what can you do|options)/.test(lower)) return 'help';
    if (/(hi|hello|hey|sawubona)/.test(lower)) return 'greeting';
    return 'unknown';
  }

  // ---- Reply generator ----
  async function buildReply(intent, groupId, uid) {
    if (!groupId) return "⚠️ Please select a group first (use the dashboard sidebar).";
    if (!uid) return "⚠️ You must be logged in to use the assistant.";

    switch(intent) {
      case 'greeting':
        return "👋 Sawubona! I'm your Stokvel Assistant. Ask me about balance, payout, contributions, meetings, or members.";
      case 'help':
        return "💡 I can answer:\n• What is our balance?\n• When is the next payout?\n• Show me my contributions\n• Full payout schedule\n• Next meeting\n• Who are the members?\nJust ask naturally!";
      case 'balance': {
        const res = await getGroupBalance(groupId);
        if (!res.success) return `⚠️ ${res.error}`;
        return `💰 Your group **${res.name}** has a balance of **${fmtRand(res.balance)}**.`;
      }
      case 'payout': {
        const res = await getNextPayout(groupId);
        if (!res.success) return `⚠️ ${res.error}`;
        let msg = `📅 Next payout: **${res.date}**\n👤 Recipient: **${res.recipient}** (slot #${res.order})\n💰 Amount: **${fmtRand(res.amount)}**`;
        if (res.note) msg += `\n_${res.note}_`;
        return msg;
      }
      case 'schedule': {
        const res = await getFullPayoutSchedule(groupId);
        if (!res.success) return `⚠️ ${res.error}`;
        if (res.schedule.length === 0) return "📊 No payout schedule set up for this group.";
        let lines = res.schedule.map(p => `  ${p.isPast ? '✅' : '🔜'} #${p.order} — ${p.name} · ${p.date} · ${fmtRand(p.amount)}`);
        return "📊 **Full payout schedule:**\n" + lines.join('\n');
      }
      case 'contributions': {
        const res = await getMyContributions(groupId, uid);
        if (!res.success) return `⚠️ ${res.error}`;
        if (res.contributions.length === 0) return "📋 You have no recorded contributions in this group yet.";
        let lines = res.contributions.map(c => `  • ${fmtRand(c.amount)} on ${c.date} [${c.status}]`);
        return `📋 **Your contributions** (confirmed total: ${fmtRand(res.total)}):\n` + lines.join('\n');
      }
      case 'meeting': {
        const res = await getNextMeeting(groupId);
        if (!res.success) return `⚠️ ${res.error}`;
        let reply = `🗓 **${res.title}**\n📍 ${res.date} · ${res.location}`;
        if (res.totalMeetings > 1) reply += `\n_(+${res.totalMeetings-1} more meeting(s) coming up)_`;
        return reply;
      }
      case 'members': {
        const res = await getGroupMembers(groupId);
        if (!res.success) return `⚠️ ${res.error}`;
        if (res.members.length === 0) return "👥 No members found.";
        let lines = res.members.map(m => `  • ${m.name} [${m.role}]`);
        return `👥 **${res.count} member(s)**:\n` + lines.join('\n');
      }
      default:
        return "🤔 I didn't understand that. Try asking about balance, payout, schedule, contributions, meeting, or members. Type 'help' for examples.";
    }
  }

  // ---- UI update: reflect selected group (call this when user picks a group) ----
  function setActiveGroup(groupId) {
    selectedGroupId = groupId;
    // Optionally show a small indicator in chat header
    const groupName = allGroups.find(g => g.id === groupId)?.name || 'Unknown';
    const headerSub = document.querySelector('.cb-header-text p');
    if (headerSub && !headerSub.querySelector('.cb-group-badge')) {
      headerSub.innerHTML = `<span class="cb-status-dot"></span> Online · Group: <strong>${groupName}</strong>`;
    } else if (headerSub) {
      headerSub.innerHTML = `<span class="cb-status-dot"></span> Online · Group: <strong>${groupName}</strong>`;
    }
  }

  // ---- Load user's groups and pick the first one as default ----
  async function loadUserGroups(uid) {
    try {
      const memberships = await db.collection('memberships')
        .where('uid', '==', uid)
        .get();
      const groupIds = memberships.docs.map(d => d.data().groupId);
      if (groupIds.length === 0) {
        console.warn('User belongs to no groups');
        return [];
      }
      const groups = [];
      for (let gid of groupIds) {
        const doc = await db.collection('groups').doc(gid).get();
        if (doc.exists) groups.push({ id: gid, name: doc.data().name || 'Unnamed' });
      }
      allGroups = groups;
      if (groups.length > 0) setActiveGroup(groups[0].id);
      return groups;
    } catch (err) {
      console.error('Failed to load user groups:', err);
      return [];
    }
  }

  // ---- Chat UI wiring (attaches to existing HTML) ----
  function initChatUI() {
    const messagesEl = document.getElementById('cb-messages');
    const inputEl = document.getElementById('cb-input');
    const sendBtn = document.getElementById('cb-send');
    if (!messagesEl || !inputEl || !sendBtn) {
      console.warn('Chat UI elements not found – skipping init');
      return;
    }

    let busy = false;

    function appendMessage(role, text, withChips = false) {
      const wrap = document.createElement('div');
      wrap.className = `cb-msg cb-msg--${role === 'user' ? 'user' : 'bot'}`;
      const micro = document.createElement('div');
      micro.className = 'cb-msg-micro';
      micro.setAttribute('aria-hidden', 'true');
      micro.textContent = role === 'user' ? 'U' : 'S';
      const bubbleDiv = document.createElement('div');
      const bubble = document.createElement('div');
      bubble.className = 'cb-msg-bubble';
      bubble.textContent = text;
      bubbleDiv.appendChild(bubble);
      wrap.appendChild(micro);
      wrap.appendChild(bubbleDiv);
      messagesEl.appendChild(wrap);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return wrap;
    }

    function showThinking() {
      const existing = document.getElementById('cb-thinking-wrap');
      if (existing) existing.remove();
      const wrap = document.createElement('div');
      wrap.className = 'cb-msg cb-msg--bot';
      wrap.id = 'cb-thinking-wrap';
      const micro = document.createElement('div');
      micro.className = 'cb-msg-micro';
      micro.textContent = 'S';
      const dots = document.createElement('div');
      dots.className = 'cb-thinking';
      for (let i = 0; i < 3; i++) {
        const d = document.createElement('div');
        d.className = 'cb-dot';
        dots.appendChild(d);
      }
      wrap.appendChild(micro);
      wrap.appendChild(dots);
      messagesEl.appendChild(wrap);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function removeThinking() {
      document.getElementById('cb-thinking-wrap')?.remove();
    }

    async function sendMessage(text) {
      if (!text.trim() || busy) return;
      busy = true;
      sendBtn.disabled = true;

      // Remove starter chips if present
      const starterChips = document.getElementById('cb-starter-chips');
      if (starterChips) starterChips.remove();

      appendMessage('user', text);
      inputEl.value = '';
      inputEl.style.height = 'auto';
      showThinking();

      try {
        const intent = detectIntent(text);
        const reply = await buildReply(intent, selectedGroupId, currentUser?.uid);
        removeThinking();
        appendMessage('bot', reply);
      } catch (err) {
        removeThinking();
        appendMessage('bot', '❌ Sorry, an error occurred while processing your request.');
        console.error(err);
      } finally {
        busy = false;
        sendBtn.disabled = false;
        inputEl.focus();
      }
    }

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

    // Attach quick‑chip listeners (if they exist)
    document.addEventListener('click', (e) => {
      if (e.target.classList?.contains('cb-chip')) {
        const q = e.target.dataset.q;
        if (q) sendMessage(q);
      }
    });
  }

  // ---- Wait for Firebase auth and then initialise ----
  if (window.auth && window.db) {
    window.auth.onAuthStateChanged(async (user) => {
      if (user) {
        currentUser = user;
        await loadUserGroups(user.uid);
        initChatUI();
        // Optional: display a welcome message after a short delay
        setTimeout(() => {
          if (document.getElementById('cb-starter-chips')) {
            // welcome already visible, do nothing
          } else {
            const messagesEl = document.getElementById('cb-messages');
            if (messagesEl && messagesEl.children.length === 1) {
              // no user message yet, keep bot greeting
            }
          }
        }, 500);
      } else {
        // user not logged in – show a message in chat
        const messagesEl = document.getElementById('cb-messages');
        if (messagesEl) {
          messagesEl.innerHTML = `<div class="cb-msg cb-msg--bot">
            <div class="cb-msg-micro">S</div>
            <div class="cb-msg-bubble">🔒 Please log in to use the Stokvel Assistant.</div>
          </div>`;
        }
      }
    });
  } else {
    console.error('Firebase auth/db not found – make sure firebase-config.js is loaded before chatbot.js');
  }
})();