/* ============================================================
   payment.js — Payment Page Controller (payment.html)

   Loads the current user's pending/missed contributions and
   presents them in a table so the user can pay each one via
   the PaymentModal component.

   On payment success:
     - Marks the contribution as confirmed in Firestore.
     - Reloads the pending list to reflect the change.

   On proof upload (optional, from the receipt screen):
     - Delegates to payment-upload.js (Firebase Storage).
   ============================================================ */

import { auth, db }          from './firebase-config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getUserGroups }           from './groupService.js';
import { PaymentModal }            from '../components/payment-modal.js';
import { COLLECTIONS }             from './constants.js';
import { uploadPaymentProof, validateProofFile } from './payment-upload.js';
//Added imports
import { onTransactionCreate } from './onTransactionCreate.js';
import { onProofUpload } from './onProofUpload.js';
import { getDoc, doc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
/* ── Modal initialisation ──────────────────────────────────── */

const modal = new PaymentModal();

modal.onPaymentSuccess = async (receipt) => {
  // Only set payment evidence, NOT status (Treasurer must confirm)
  if (receipt.contributionId) {
    try {
      // Get the contribution to find userId and groupId
      const contribDoc = await getDoc(doc(db, COLLECTIONS.CONTRIBUTIONS, receipt.contributionId));
      if (contribDoc.exists()) {
        const contribData = contribDoc.data();
        await onTransactionCreate(contribData.userId, contribData.groupId);
      }
    } catch (err) {
      console.warn('[payment.js] Could not update payment evidence:', err.message);
    }
  }
  // Reload pending list
  const user = auth.currentUser;
  if (user) loadPendingContributions(user.uid);
};

modal.onProofUploaded = async (file, paymentId) => {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated.');

  const validationError = validateProofFile(file);
  if (validationError) throw new Error(validationError);

  // Upload the proof file (returns fileUrl)
  const { fileUrl, proofId } = await uploadPaymentProof(file, paymentId, user.uid);
  
  // Get the transaction to find userId and groupId
  const txDoc = await getDoc(doc(db, 'transactions', paymentId));
  if (txDoc.exists()) {
    const txData = txDoc.data();
    // Pass the fileUrl to onProofUpload
    await onProofUpload(txData.userId, txData.groupId, fileUrl);
  }
};

/* ── Auth gate ─────────────────────────────────────────────── */

onAuthStateChanged(auth, (user) => {
  if (!user) { window.location.href = 'login.html'; return; }
  loadPendingContributions(user.uid);

  // Wire up "Make a Payment" button in header to open first pending contribution
  const makePaymentBtn = document.getElementById('make-payment-btn');
  if (makePaymentBtn) {
    makePaymentBtn.addEventListener('click', () => {
      openFirstPendingContribution(user.uid);
    });
  }
});

/* ── Make a Payment Button Handler ─────────────────────────── */

async function openFirstPendingContribution(userId) {
  try {
    const groups = await getUserGroups(userId);
    if (!groups.length) {
      showError('You are not a member of any groups yet.');
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
    const pending = allContribs.filter(
      c => c.status === 'pending' || c.status === 'missed'
    );

    if (pending.length === 0) {
      showError('You have no pending contributions to pay.');
      return;
    }

    // Get the first pending contribution
    const contrib = pending[0];
    const groupMap = {};
    groups.forEach(g => { groupMap[g.id] = g.name; });
    const groupName = groupMap[contrib.groupId] || contrib.groupId || 'Unknown Group';
    const amount = parseFloat(contrib.amount) || 0;

    // Redirect directly to PayFast payment gateway
    await redirectToPayFast({
      userId: userId,
      groupId: contrib.groupId,
      contributionId: contrib.id,
      amount: amount,
      groupName: groupName,
    });
  } catch (err) {
    showError('Failed to load contributions: ' + (err.message || 'Unknown error'));
  }
}

/**
 * Redirect directly to PayFast payment gateway
 * @param {Object} params - Payment parameters
 */
async function redirectToPayFast({ userId, groupId, contributionId, amount, groupName }) {
  try {
    // Get user details
    let userEmail = '';
    let userName = '';
    const currentUser = auth.currentUser;
    if (currentUser) {
      userEmail = currentUser.email || '';
      userName = currentUser.displayName || '';
    }

    // Get auth token
    const authToken = currentUser ? await currentUser.getIdToken() : '';

    // Call backend API to initiate PayFast payment
    const response = await fetch('/api/payments/initiate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        amount: amount,
        contributionId: contributionId,
        groupId: groupId,
        groupName: groupName,
        userEmail: userEmail,
        userName: userName,
        metadata: {
          paymentMethod: 'card'
        }
      })
    });

    if (!response.ok) {
      throw new Error('Payment initiation failed');
    }

    const result = await response.json();
    const paymentId = result.paymentId;

    // Store payment ID in localStorage for return handling
    localStorage.setItem('pendingPaymentId', paymentId);

    // Create and submit form to redirect to PayFast
    const paymentData = result.paymentData;
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = paymentData.paymentUrl;
    form.style.display = 'none';

    // Add all payment data as hidden inputs
    for (let key in paymentData) {
      if (key !== 'paymentUrl') {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = paymentData[key];
        form.appendChild(input);
      }
    }

    // Add form to body and submit
    document.body.appendChild(form);
    form.submit();
  } catch (err) {
    showError('Failed to initiate payment: ' + (err.message || 'Unknown error'));
  }
}

/* ── Data loading ──────────────────────────────────────────── */

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
    const pending     = allContribs.filter(
      c => c.status === 'pending' || c.status === 'missed'
    );

    const groupMap = {};
    groups.forEach(g => { groupMap[g.id] = g.name; });

    const outstanding = pending.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0);

    // Completed payments this period — read from transactions collection
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
    } catch (_) { /* transactions collection may not exist yet */ }

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

/* ── Render pending contributions table ────────────────────── */

function renderTable(contributions, groupMap) {
  const tbody = document.getElementById('pending-table-body');
  tbody.innerHTML = '';

  contributions.forEach(contrib => {
    const tr     = document.createElement('tr');
    const name   = groupMap[contrib.groupId] || contrib.groupId || '—';
    const date   = contrib.date
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

  // Wire Pay Now buttons
  tbody.querySelectorAll('button[data-contrib-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const user = auth.currentUser;
      if (!user) return;
      modal.open({
        userId:         user.uid,
        groupId:        btn.dataset.groupId,
        contributionId: btn.dataset.contribId,
        amount:         parseFloat(btn.dataset.amount),
        groupName:      btn.dataset.groupName,
      });
    });
  });
}

/* ── Stats ─────────────────────────────────────────────────── */

function updateStats(outstanding, pendingCount, completed) {
  document.getElementById('stat-outstanding').textContent    = `R ${outstanding.toFixed(2)}`;
  document.getElementById('stat-pending-count').textContent  = String(pendingCount);
  document.getElementById('stat-completed').textContent      = String(completed);
}

/* ── UI state helpers ──────────────────────────────────────── */

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

/* ── Security helpers ──────────────────────────────────────── */

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
