/* ============================================================
   payment-receipt.js — Payment Receipt View & Download

   Provides:
     - showReceiptModal(txId)   → fetch + show receipt in a modal
     - downloadReceipt(txId)    → opens browser print dialog (PDF)
     - buildReceiptHTML(tx)     → pure HTML string for a receipt

   The receipt is styled with print-safe inline CSS so it renders
   correctly when the user prints to PDF via the browser.
   ============================================================ */

import { db, auth }          from './firebase-config.js';
import {
  doc,
  getDoc,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

/* ── Constants ─────────────────────────────────────────────── */
const CARD_FEE_RATE = 0.015; // 1.5%

/* ── Public API ─────────────────────────────────────────────── */

/**
 * Fetch a transaction and display it in a full-screen receipt modal.
 * Inserts the modal into the DOM if not already present.
 *
 * @param {string} txId  Firestore transaction document ID.
 */
export async function showReceiptModal(txId) {
  if (!txId) return;

  const tx    = await _fetchTransaction(txId);
  const html  = buildReceiptHTML(tx);
  _injectModal(html, txId);
}

/**
 * Open the browser print dialog for a receipt (print-to-PDF).
 * @param {string} txId
 */
export async function downloadReceipt(txId) {
  if (!txId) return;
  const tx = await _fetchTransaction(txId);

  // Open in a new window with print styles
  const win  = window.open('', '_blank', 'width=700,height=900');
  if (!win) {
    console.warn('[payment-receipt] Popup blocked. Falling back to showReceiptModal.');
    return showReceiptModal(txId);
  }

  win.document.write(_buildPrintPage(tx));
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400); // give time to render
}

/* ── Receipt HTML Builder ───────────────────────────────────── */

/**
 * Build the receipt HTML fragment (without print wrapper).
 * Safe to inject into existing page DOM.
 *
 * @param {Object} tx  Transaction document data.
 * @returns {string}  HTML string.
 */
export function buildReceiptHTML(tx) {
  const base    = parseFloat(tx.amount) || 0;
  const feeRate = tx.paymentMethod === 'card' ? CARD_FEE_RATE : 0;
  const fee     = base * feeRate;
  const total   = base + fee;
  const date    = _fmt(tx.completedAt || tx.createdAt || tx.updatedAt);

  const statusBadge = _statusBadge(tx.status);

  const rows = [
    ['Receipt No.',    tx.id || '—'],
    ['Transaction ID', tx.transactionId || '—'],
    ['Group',          tx.groupName || tx.groupId || '—'],
    ['Date',           date],
    ['Payment Method', tx.paymentMethod === 'card' ? '💳 Card' : tx.paymentMethod === 'eft' ? '🏦 EFT' : '—'],
    ['Status',         null],  // rendered separately with badge
  ];

  const rowsHTML = rows.map(([label, value]) => {
    if (label === 'Status') {
      return `<tr>
        <td style="padding:8px 12px;color:#6b7280;font-size:0.88rem;">${label}</td>
        <td style="padding:8px 12px;">${statusBadge}</td>
      </tr>`;
    }
    return `<tr>
      <td style="padding:8px 12px;color:#6b7280;font-size:0.88rem;">${label}</td>
      <td style="padding:8px 12px;font-weight:500;">${_esc(String(value))}</td>
    </tr>`;
  }).join('');

  return `
<div class="receipt-card" style="font-family:'DM Sans',system-ui,sans-serif;max-width:480px;margin:0 auto;">

  <!-- Header -->
  <div style="text-align:center;padding:24px 24px 16px;border-bottom:2px dashed #e5e7eb;">
    <div style="font-size:2rem;margin-bottom:8px;" aria-hidden="true">🧾</div>
    <h2 style="font-family:'DM Serif Display',serif;font-size:1.4rem;font-weight:400;margin:0 0 4px;">
      Payment Receipt
    </h2>
    <p style="color:#6b7280;font-size:0.82rem;margin:0;">StokPal Stokvel Platform</p>
  </div>

  <!-- Details table -->
  <table style="width:100%;border-collapse:collapse;margin:0;">
    <tbody>${rowsHTML}</tbody>
  </table>

  <!-- Amount breakdown -->
  <div style="border-top:1px solid #e5e7eb;padding:16px 12px;">
    <table style="width:100%;border-collapse:collapse;">
      <tbody>
        <tr>
          <td style="padding:4px 0;color:#6b7280;font-size:0.88rem;">Contribution amount</td>
          <td style="padding:4px 0;text-align:right;">R ${base.toFixed(2)}</td>
        </tr>
        ${fee > 0 ? `
        <tr>
          <td style="padding:4px 0;color:#6b7280;font-size:0.88rem;">Processing fee (1.5%)</td>
          <td style="padding:4px 0;text-align:right;color:#6b7280;">R ${fee.toFixed(2)}</td>
        </tr>` : ''}
        <tr>
          <td style="padding:8px 0 0;font-weight:700;font-size:1.05rem;border-top:1px solid #e5e7eb;">Total paid</td>
          <td style="padding:8px 0 0;text-align:right;font-weight:700;font-size:1.05rem;border-top:1px solid #e5e7eb;">R ${total.toFixed(2)}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- Footer note -->
  <div style="text-align:center;padding:12px 24px 24px;color:#9ca3af;font-size:0.78rem;border-top:2px dashed #e5e7eb;">
    <p style="margin:0 0 4px;">Keep this receipt for your records.</p>
    <p style="margin:0;">Generated by StokPal · ${new Date().toLocaleDateString('en-ZA')}</p>
  </div>

</div>`;
}

/* ── Modal injection ───────────────────────────────────────── */

function _injectModal(contentHTML, txId) {
  // Remove any existing receipt modal
  document.getElementById('receipt-modal-root')?.remove();

  const wrapper = document.createElement('div');
  wrapper.id = 'receipt-modal-root';
  wrapper.innerHTML = `
<div class="payment-overlay"
     role="dialog"
     aria-modal="true"
     aria-label="Payment receipt"
     style="z-index:1100;">
  <div class="payment-modal" style="max-width:520px;">
    <header class="payment-modal__header">
      <span class="payment-modal__icon" aria-hidden="true">🧾</span>
      <h2 class="payment-modal__title">Payment Receipt</h2>
      <button class="payment-modal__close"
              id="receipt-close-btn"
              aria-label="Close receipt">✕</button>
    </header>
    <div style="padding:var(--space-5, 1.25rem);overflow-y:auto;max-height:calc(90vh - 120px);">
      ${contentHTML}
    </div>
    <div class="payment-modal__actions" style="padding:var(--space-4, 1rem) var(--space-5, 1.25rem);">
      <button class="btn btn--outline" id="receipt-close-btn-2">Close</button>
      <button class="btn btn--primary" id="receipt-print-btn">🖨️ Print / Save PDF</button>
    </div>
  </div>
</div>`;

  document.body.appendChild(wrapper);
  document.body.style.overflow = 'hidden';

  // Wire close
  const close = () => {
    wrapper.remove();
    document.body.style.overflow = '';
  };
  wrapper.querySelector('#receipt-close-btn').addEventListener('click', close);
  wrapper.querySelector('#receipt-close-btn-2').addEventListener('click', close);
  wrapper.querySelector('.payment-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) close();
  });
  document.addEventListener('keydown', function onEsc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); }
  });

  // Wire print
  wrapper.querySelector('#receipt-print-btn').addEventListener('click', () => {
    downloadReceipt(txId);
  });
}

/* ── Print page builder ─────────────────────────────────────── */

function _buildPrintPage(tx) {
  const content = buildReceiptHTML(tx);
  return `<!DOCTYPE html>
<html lang="en-ZA">
<head>
  <meta charset="UTF-8"/>
  <title>Receipt — ${tx.id || 'StokPal'}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'DM Sans', system-ui, sans-serif; background: #fff; padding: 32px; }
    .status-badge { display:inline-block;padding:2px 10px;border-radius:12px;font-size:0.82rem;font-weight:600; }
    .status-badge--completed { background:#dcfce7;color:#16a34a; }
    .status-badge--pending   { background:#fef9c3;color:#a16207; }
    .status-badge--processing{ background:#dbeafe;color:#1d4ed8; }
    .status-badge--failed    { background:#fee2e2;color:#dc2626; }
    .status-badge--cancelled { background:#f3f4f6;color:#6b7280; }
    @media print {
      body { padding: 16px; }
      button { display: none !important; }
    }
  </style>
</head>
<body>${content}</body>
</html>`;
}

/* ── Data helpers ───────────────────────────────────────────── */

async function _fetchTransaction(txId) {
  try {
    const snap = await getDoc(doc(db, 'transactions', txId));
    if (snap.exists()) {
      const data = snap.data();
      // Security: only allow viewing own transactions
      const user = auth.currentUser;
      if (user && data.userId && data.userId !== user.uid) {
        throw new Error('Access denied.');
      }
      return { id: snap.id, ...data };
    }
  } catch (err) {
    if (err.message === 'Access denied.') throw err;
    // fall through to mock
  }

  // Mock fallback during development
  return {
    id:              txId,
    amount:          500,
    currency:        'ZAR',
    paymentMethod:   'card',
    status:          'completed',
    transactionId:   'txn_demo_fallback',
    groupId:         'mock-group',
    groupName:       'Demo Group',
    createdAt:       { toMillis: () => Date.now() - 3_600_000 },
    completedAt:     { toMillis: () => Date.now() - 3_540_000 },
  };
}

function _fmt(ts) {
  if (!ts) return '—';
  const ms = ts.toMillis ? ts.toMillis() : (typeof ts === 'number' ? ts : Date.parse(ts));
  if (!ms || isNaN(ms)) return '—';
  return new Date(ms).toLocaleString('en-ZA', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function _statusBadge(status) {
  const map = {
    pending:    ['Pending',    '#fef9c3', '#a16207'],
    processing: ['Processing', '#dbeafe', '#1d4ed8'],
    completed:  ['Completed',  '#dcfce7', '#16a34a'],
    failed:     ['Failed',     '#fee2e2', '#dc2626'],
    cancelled:  ['Cancelled',  '#f3f4f6', '#6b7280'],
  };
  const [label, bg, color] = map[status] || ['Unknown', '#f3f4f6', '#6b7280'];
  return `<span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:0.82rem;font-weight:600;background:${bg};color:${color};">${label}</span>`;
}

function _esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
