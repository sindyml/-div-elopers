/* ============================================================
   payment.js — Payment Page Controller (payment.html)
   ============================================================ */

import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  collection,
  query,
  where,
  orderBy,
  getDocs
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getUserGroups } from './groupService.js';
import { COLLECTIONS } from './constants.js';

const API_BASE_URL = 'https://div-elopers.onrender.com';

// Generate a unique payment ID
function generatePaymentId() {
  return 'pay_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

onAuthStateChanged(auth, (user) => {
  if (!user) { window.location.href = 'login.html'; return; }
  loadPendingContributions(user.uid);

  const makePaymentBtn = document.getElementById('make-payment-btn');
  if (makePaymentBtn) {
    makePaymentBtn.addEventListener('click', () => {
      initiateStripePayment(user);
    });
  }
});

async function initiateStripePayment(user) {
  const btn = document.getElementById('make-payment-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Redirecting…'; }
  showError(null);

  try {
    const groups = await getUserGroups(user.uid);
    if (!groups.length) {
      showError('You are not a member of any groups yet.');
      return;
    }

    const contribSnap = await getDocs(
      query(
        collection(db, COLLECTIONS.CONTRIBUTIONS),
        where('userId', '==', user.uid)
      )
    );

    const allContribs = contribSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const pending = allContribs
      .filter(c => c.status === 'pending' || c.status === 'missed')
      .sort((a, b) => {
        const dateA = a.date?.toDate ? a.date.toDate() : new Date(a.date || 0);
        const dateB = b.date?.toDate ? b.date.toDate() : new Date(b.date || 0);
        return dateB - dateA;
      });

    if (pending.length === 0) {
      showError('You have no pending contributions to pay.');
      return;
    }

    const groupMap = {};
    groups.forEach(g => { groupMap[g.id] = g.name; });

    const selectedContribution = pending[0];
    const groupName = groupMap[selectedContribution.groupId] || selectedContribution.groupId || 'Unknown Group';
    const amount = parseFloat(selectedContribution.amount) || 0;
    const paymentId = generatePaymentId();

    const authToken = await user.getIdToken();
    const returnUrl = `${window.location.origin}/payment-return.html?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${window.location.origin}/payment-cancel.html`;

    // Store payment ID immediately
    localStorage.setItem('pendingPaymentId', paymentId);

    const response = await fetch(`${API_BASE_URL}/api/payments/create-checkout-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        amount: amount,
        groupName: groupName,
        contributionId: selectedContribution.id,
        groupId: selectedContribution.groupId,
        returnUrl: returnUrl,
        cancelUrl: cancelUrl,
        paymentId: paymentId
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create checkout session');
    }

    const data = await response.json();
    window.location.href = data.url;

  } catch (err) {
    showError('Failed to initiate payment: ' + (err.message || 'Unknown error'));
    if (btn) {
      btn.disabled = false;
      btn.textContent = '💳 Make a Payment';
    }
  }
}

async function loadPendingContributions(userId) {
  showLoading(true);
  showError(null);

  try {
    const groups = await getUserGroups(userId);

    if (!groups.length) {
      showLoading(false);
      showEmpty(true);
      updateStats(0, 0, 0);
      return;
    }

    const contribSnap = await getDocs(
      query(
        collection(db, COLLECTIONS.CONTRIBUTIONS),
        where('userId', '==', userId),
        orderBy('date', 'desc')
      )
    );

    const allContribs = contribSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const pending = allContribs.filter(c => c.status === 'pending' || c.status === 'missed');

    const groupMap = {};
    groups.forEach(g => { groupMap[g.id] = g.name; });

    const outstanding = pending.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0);

    let completedCount = 0;
    try {
      const txSnap = await getDocs(
        query(
          collection(db, 'transactions'),
          where('userId', '==', userId),
          where('status', '==', 'completed')
        )
      );
      completedCount = txSnap.size;
    } catch (_) { }

    updateStats(outstanding, pending.length, completedCount);

    if (pending.length === 0) {
      showLoading(false);
      showEmpty(true);
      return;
    }

    renderTable(pending, groupMap);
    showLoading(false);
    showTable(true);

  } catch (err) {
    showLoading(false);
    showError('Failed to load contributions: ' + (err.message || 'Unknown error'));
  }
}

function renderTable(contributions, groupMap) {
  const tbody = document.getElementById('pending-table-body');
  tbody.innerHTML = '';

  contributions.forEach(contrib => {
    const tr = document.createElement('tr');
    const name = groupMap[contrib.groupId] || contrib.groupId || '—';
    const date = contrib.date
      ? (contrib.date.toDate
          ? contrib.date.toDate().toLocaleDateString('en-ZA')
          : contrib.date)
      : '—';
    const amount = parseFloat(contrib.amount) || 0;

    const statusBadgeHtml = contrib.status === 'missed'
      ? '<span class="status-badge status-badge--failed">Missed</span>'
      : '<span class="status-badge status-badge--pending">Pending</span>';

    tr.innerHTML = `
      <td class="td--name">${escHtml(name)}</td>
      <td>R ${amount.toFixed(2)}</td>
      <td>${escHtml(date)}</td>
      <td>${statusBadgeHtml}</td>
      <td>
        <button class="btn btn--primary btn--sm"
                data-contrib-id="${escAttr(contrib.id)}"
                data-group-id="${escAttr(contrib.groupId)}"
                data-group-name="${escAttr(name)}"
                data-amount="${escAttr(String(amount))}">
          Pay Now
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('button[data-contrib-id]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const user = auth.currentUser;
      if (!user) return;
      
      const amount = parseFloat(btn.dataset.amount);
      const groupName = btn.dataset.groupName;
      const paymentId = generatePaymentId();
      const authToken = await user.getIdToken();
      const returnUrl = `${window.location.origin}/payment-return.html?session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${window.location.origin}/payment-cancel.html`;
      
      localStorage.setItem('pendingPaymentId', paymentId);
      
      const response = await fetch(`${API_BASE_URL}/api/payments/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          amount: amount,
          groupName: groupName,
          contributionId: btn.dataset.contribId,
          groupId: btn.dataset.groupId,
          returnUrl: returnUrl,
          cancelUrl: cancelUrl,
          paymentId: paymentId
        })
      });
      
      const data = await response.json();
      window.location.href = data.url;
    });
  });
}

function updateStats(outstanding, pendingCount, completed) {
  const outstandingEl = document.getElementById('stat-outstanding');
  const pendingCountEl = document.getElementById('stat-pending-count');
  const completedEl = document.getElementById('stat-completed');
  
  if (outstandingEl) outstandingEl.textContent = `R ${outstanding.toFixed(2)}`;
  if (pendingCountEl) pendingCountEl.textContent = String(pendingCount);
  if (completedEl) completedEl.textContent = String(completed);
}

function showLoading(on) {
  const el = document.getElementById('pending-loading');
  if (el) el.style.display = on ? '' : 'none';
}

function showEmpty(on) {
  const el = document.getElementById('pending-empty');
  if (el) el.hidden = !on;
}

function showTable(on) {
  const el = document.getElementById('pending-table-wrapper');
  if (el) el.hidden = !on;
}

function showError(msg) {
  const el = document.getElementById('page-error');
  if (!el) return;
  if (msg) {
    el.textContent = msg;
    el.classList.remove('payment-alert--hidden');
  } else {
    el.classList.add('payment-alert--hidden');
  }
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escAttr(str) {
  return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
