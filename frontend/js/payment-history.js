/* ============================================================
   payment-history.js — Payment History Page Controller
                        (payment-history.html)

   Loads all of the current user's transaction records from
   Firestore (falling back to mock data while Developer A's
   backend is being built), then renders a filterable table
   with summary stats.

   Falls back to mock data automatically if the transactions
   collection does not yet exist (Developer A dependency).
   ============================================================ */

import { auth, db }          from './firebase-config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  getDoc,
  doc,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getUserGroups }     from './groupService.js';
import { showReceiptModal }  from './payment-receipt.js';
import { initPaymentReminders } from './payment-reminders.js';
import { PaymentModal }      from '../components/payment-modal.js';
import { COLLECTIONS }       from './constants.js';
import { uploadPaymentProof, validateProofFile } from './payment-upload.js';
import { onTransactionCreate } from './onTransactionCreate.js';
import { onProofUpload } from './onProofUpload.js';

/* ── Module state ──────────────────────────────────────────── */

let _activeFilter    = 'all';
let _allTransactions = [];

/* ── Modal initialisation ──────────────────────────────────── */

const modal = new PaymentModal();

modal.onPaymentSuccess = async (receipt) => {
  // Handle payment success
  if (receipt.contributionId) {
    try {
      // Get the contribution to find userId and groupId
      const contribDoc = await getDoc(doc(db, COLLECTIONS.CONTRIBUTIONS, receipt.contributionId));
      if (contribDoc.exists()) {
        const contribData = contribDoc.data();
        await onTransactionCreate(contribData.userId, contribData.groupId);
      }
    } catch (err) {
      console.warn('[payment-history.js] Could not update payment evidence:', err.message);
    }
  }
  // Reload transactions list
  const user = auth.currentUser;
  if (user) loadTransactions(user.uid);
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
  initPaymentReminders(user.uid);
  loadTransactions(user.uid);

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

async function loadTransactions(userId) {
  showLoading(true);
  showError(null);

  try {
    const groups   = await getUserGroups(userId);
    const groupMap = {};
    groups.forEach(g => { groupMap[g.id] = g.name; });

    let transactions = [];

    try {
      const snap = await getDocs(
        query(
          collection(db, 'transactions'),
          where('userId', '==', userId),
          orderBy('createdAt', 'desc')
        )
      );
      transactions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (_) {
      // transactions collection not yet created by Developer A — use mock data
      transactions = buildMockTransactions(userId, groupMap);
    }

    _allTransactions = transactions.map(tx => ({
      ...tx,
      _groupName: groupMap[tx.groupId] || tx.groupId || '—',
    }));

    updateStats(_allTransactions);
    renderTable(_allTransactions, _activeFilter);
    showLoading(false);

  } catch (err) {
    showLoading(false);
    showError('Failed to load transactions: ' + (err.message || 'Unknown error'));
  }
}

/* ── Render table ──────────────────────────────────────────── */

function renderTable(transactions, filter) {
  const filtered = filter === 'all'
    ? transactions
    : transactions.filter(tx => tx.status === filter);

  const tbody        = document.getElementById('history-table-body');
  const emptySubText = document.getElementById('empty-sub-text');

  tbody.innerHTML = '';

  if (filtered.length === 0) {
    emptySubText.textContent = filter === 'all'
      ? "You haven't made any payments yet."
      : `No ${filter} transactions found.`;
    showTable(false);
    showEmpty(true);
    return;
  }

  showEmpty(false);
  showTable(true);

  filtered.forEach(tx => {
    const tr     = document.createElement('tr');
    const date   = formatTimestamp(tx.createdAt);
    const baseAmount = parseFloat(tx.amount) || 0;
    const fee        = tx.paymentMethod === 'card' ? baseAmount * 0.015 : 0;
    const totalAmt   = baseAmount + fee;
    const amountHtml = fee > 0
      ? `R ${baseAmount.toFixed(2)} <small style="color:var(--color-text-muted);font-size:0.74rem;display:block;">+R ${fee.toFixed(2)} fee</small>`
      : `R ${baseAmount.toFixed(2)}`;
    const method = tx.paymentMethod === 'card'
      ? '💳 Card'
      : tx.paymentMethod === 'eft'
        ? '🏦 EFT'
        : '—';
    const txId = tx.transactionId
      ? escHtml(tx.transactionId)
      : '<span style="color:var(--color-text-muted)">—</span>';
    const badge = statusBadge(tx.status);

    const canUploadProof = ['pending', 'processing'].includes(tx.status);
    const canViewReceipt = tx.status === 'completed';
    const canRetry       = tx.status === 'failed' || tx.status === 'cancelled';

    tr.innerHTML = `
      <td>${escHtml(date)}</td>
      <td class="td--name">${escHtml(tx._groupName)}</td>
      <td>${amountHtml}</td>
      <td>${method}</td>
      <td style="font-size:0.78rem;font-family:monospace;color:var(--color-text-muted);">${txId}</td>
      <td>${badge}</td>
      <td>
        <div style="display:flex;gap:var(--space-2);flex-wrap:wrap;">
          ${canUploadProof ? `
            <a href="payment-proof.html?txId=${escAttr(tx.id)}"
               class="btn btn--outline btn--sm">📎 Proof</a>` : ''}
          ${canViewReceipt ? `
            <button class="btn btn--outline btn--sm js-receipt-btn"
                    data-txid="${escAttr(tx.id)}"
                    aria-label="View receipt">🧾 Receipt</button>` : ''}
          ${canRetry ? `
            <a href="payment.html?retry=${escAttr(tx.id)}"
               class="btn btn--primary btn--sm">↩ Retry</a>` : ''}
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

/* ── Stats ─────────────────────────────────────────────────── */

function updateStats(txs) {
  const completed = txs.filter(t => t.status === 'completed');
  const pending   = txs.filter(t => t.status === 'pending' || t.status === 'processing');
  const failed    = txs.filter(t => t.status === 'failed' || t.status === 'cancelled');
  const totalPaid = completed.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);

  document.getElementById('stat-total-paid').textContent = `R ${totalPaid.toFixed(2)}`;
  document.getElementById('stat-pending').textContent    = String(pending.length);
  document.getElementById('stat-failed').textContent     = String(failed.length);
}

/* ── Filter tabs ───────────────────────────────────────────── */

document.getElementById('filter-bar').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-filter]');
  if (!btn) return;

  _activeFilter = btn.dataset.filter;

  document.querySelectorAll('.filter-tab').forEach(tab => {
    const isActive = tab.dataset.filter === _activeFilter;
    tab.classList.toggle('filter-tab--active', isActive);
    tab.setAttribute('aria-selected', String(isActive));
  });

  renderTable(_allTransactions, _activeFilter);
});

/* ── Receipt modal delegation ──────────────────────────────── */

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.js-receipt-btn');
  if (!btn) return;
  showReceiptModal(btn.dataset.txid);
});

/* ── Mock data (fallback until Developer A's backend is live) ── */

function buildMockTransactions(userId, groupMap) {
  const groupIds = Object.keys(groupMap);
  const gId      = groupIds[0] || 'mock-group';
  const now      = Date.now();
  const day      = 86_400_000;

  return [
    {
      id: 'mock-tx-1', userId, groupId: gId, amount: 500, currency: 'ZAR',
      status: 'completed', paymentMethod: 'card',
      transactionId: 'txn_demo_001',
      createdAt: { toMillis: () => now - 2 * day },
    },
    {
      id: 'mock-tx-2', userId, groupId: gId, amount: 500, currency: 'ZAR',
      status: 'pending', paymentMethod: 'eft',
      transactionId: null,
      createdAt: { toMillis: () => now - day },
    },
    {
      id: 'mock-tx-3', userId, groupId: gId, amount: 500, currency: 'ZAR',
      status: 'failed', paymentMethod: 'card',
      transactionId: null,
      createdAt: { toMillis: () => now - 3 * day },
    },
  ];
}

/* ── UI state helpers ──────────────────────────────────────── */

function showLoading(on) {
  const el = document.getElementById('history-loading');
  if (el) el.style.display = on ? '' : 'none';
}

function showEmpty(on) {
  const el = document.getElementById('history-empty');
  if (el) el.hidden = !on;
}

function showTable(on) {
  const el = document.getElementById('history-table-wrapper');
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

/* ── Helpers ───────────────────────────────────────────────── */

function statusBadge(status) {
  const map = {
    pending:    '<span class="status-badge status-badge--pending">Pending</span>',
    processing: '<span class="status-badge status-badge--processing">Processing</span>',
    completed:  '<span class="status-badge status-badge--completed">Completed</span>',
    failed:     '<span class="status-badge status-badge--failed">Failed</span>',
    cancelled:  '<span class="status-badge status-badge--cancelled">Cancelled</span>',
  };
  return map[status]
    || `<span class="status-badge">${escHtml(String(status || '—'))}</span>`;
}

function formatTimestamp(ts) {
  if (!ts) return '—';
  const ms = ts.toMillis
    ? ts.toMillis()
    : (typeof ts === 'number' ? ts : Date.parse(ts));
  if (!ms || isNaN(ms)) return '—';
  return new Date(ms).toLocaleString('en-ZA', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
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
