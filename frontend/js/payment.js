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
import { markContributionAsPaid }  from './contributions.js';

/* ── Modal initialisation ──────────────────────────────────── */

const modal = new PaymentModal();

modal.onPaymentSuccess = async (receipt) => {
  // Mark the contribution as paid in Firestore
  if (receipt.contributionId) {
    try {
      await markContributionAsPaid(receipt.contributionId, receipt.transactionId || receipt.paymentId);
    } catch (err) {
      console.warn('[payment.js] Could not mark contribution as paid:', err.message);
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

  await uploadPaymentProof(file, paymentId, user.uid);
};

/* ── Auth gate ─────────────────────────────────────────────── */

onAuthStateChanged(auth, (user) => {
  if (!user) { window.location.href = 'login.html'; return; }
  loadPendingContributions(user.uid);
});

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
