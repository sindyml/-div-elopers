/* ============================================================
   payment-api-mock.js — Mock Payment API (Developer B stub)

   Simulates Developer A's backend payment endpoints so the
   frontend UI can be built and tested without a real backend.

   Replace imports of this file with the real API module once
   Developer A's backend is ready.
   ============================================================ */

const MOCK_DELAY_MS = 700;

/** @type {Map<string, Object>} In-memory transaction store */
const _store = new Map();

const _delay = (ms) => new Promise((res) => setTimeout(res, ms));

function _generateId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/* ── Public API ──────────────────────────────────────────────
 * Mirrors the contract agreed with Developer A:
 *
 *   POST /api/payments/initiate
 *   GET  /api/payments/status/:paymentId
 * ─────────────────────────────────────────────────────────── */

/**
 * Initiate a new payment.
 *
 * @param {{ userId: string, groupId: string, contributionId: string,
 *           amount: number, currency?: string }} params
 * @returns {Promise<{ paymentId: string, checkoutUrl: string, expiresAt: number }>}
 */
export async function initiatePayment({ userId, groupId, contributionId, amount, currency = 'ZAR' }) {
  await _delay(MOCK_DELAY_MS);

  if (!userId || !groupId || !contributionId) {
    throw new Error('Missing required payment parameters.');
  }
  if (typeof amount !== 'number' || amount <= 0) {
    throw new Error('Payment amount must be a positive number.');
  }

  const paymentId = _generateId('mock_pay');
  const expiresAt = Date.now() + 30 * 60 * 1000; // 30 minutes

  _store.set(paymentId, {
    paymentId,
    userId,
    groupId,
    contributionId,
    amount,
    currency,
    status: 'pending',
    transactionId: null,
    paymentMethod: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    completedAt: null,
  });

  return {
    paymentId,
    checkoutUrl: `#mock-checkout-${paymentId}`,
    expiresAt,
  };
}

/**
 * Poll for payment status.
 *
 * @param {string} paymentId
 * @returns {Promise<{ paymentId: string, status: string, amount: number,
 *                     transactionId: string|null, updatedAt: number }>}
 */
export async function getPaymentStatus(paymentId) {
  await _delay(300);

  const tx = _store.get(paymentId);
  if (!tx) throw new Error(`Payment not found: ${paymentId}`);

  return {
    paymentId: tx.paymentId,
    status: tx.status,
    amount: tx.amount,
    transactionId: tx.transactionId,
    updatedAt: tx.updatedAt,
  };
}

/* ── Dev Helpers (not in real API) ───────────────────────────
 * Call these from the browser console or tests to simulate
 * gateway webhook events during development.
 * ─────────────────────────────────────────────────────────── */

/**
 * Simulate a successful payment after `delayMs` milliseconds.
 * @param {string} paymentId
 * @param {number} [delayMs=2500]
 */
export function simulatePaymentSuccess(paymentId, delayMs = 2500) {
  setTimeout(() => {
    const tx = _store.get(paymentId);
    if (!tx) return;
    tx.status = 'completed';
    tx.transactionId = _generateId('txn');
    tx.updatedAt = Date.now();
    tx.completedAt = Date.now();
  }, delayMs);
}

/**
 * Simulate a failed payment after `delayMs` milliseconds.
 * @param {string} paymentId
 * @param {number} [delayMs=2500]
 */
export function simulatePaymentFailure(paymentId, delayMs = 2500) {
  setTimeout(() => {
    const tx = _store.get(paymentId);
    if (!tx) return;
    tx.status = 'failed';
    tx.updatedAt = Date.now();
  }, delayMs);
}

/**
 * Expose the internal store for debugging.
 * @returns {Object[]}
 */
export function _debugGetAllTransactions() {
  return Array.from(_store.values());
}
