/* ============================================================
   tests/payment-api-mock.test.js
   Unit tests for frontend/js/payment-api-mock.js

   Covers:
     - initiatePayment   : success, validation errors
     - getPaymentStatus  : returns live store entry, unknown id
     - simulatePaymentSuccess : transitions status → completed
     - simulatePaymentFailure : transitions status → failed
   ============================================================ */

const fs   = require('fs');
const vm   = require('vm');
const path = require('path');

// ── Load payment-api-mock.js source ────────────────────────
//   Strip ESM export keywords; no external imports to worry about.

const RAW_SRC = fs.readFileSync(
  path.join(__dirname, '..', 'frontend', 'js', 'payment-api-mock.js'),
  'utf-8',
);
const STRIPPED_SRC = RAW_SRC
  .replace(/^export\s+async\s+function\s+/gm, 'async function ')
  .replace(/^export\s+function\s+/gm,        'function ')
  .replace(/^export\s+const\s+/gm,           'const ');

// ── Sandbox factory ────────────────────────────────────────
function createSandbox() {
  const ctx = vm.createContext({
    setTimeout,
    clearTimeout,
    Date,
    Map,
    Promise,
    Math,
    Error,
    JSON,
    console,
    String,
  });
  vm.runInContext(STRIPPED_SRC, ctx);
  return ctx;
}

// ── Valid payment params ───────────────────────────────────
const VALID_PARAMS = {
  userId:        'user_abc',
  groupId:       'group_xyz',
  contributionId:'contrib_99',
  amount:        300,
  currency:      'ZAR',
};

// ═══════════════════════════════════════════════════════════
// initiatePayment
// ═══════════════════════════════════════════════════════════

describe('initiatePayment()', () => {
  test('resolves with a paymentId string', async () => {
    const { initiatePayment } = createSandbox();
    const result = await initiatePayment(VALID_PARAMS);
    expect(typeof result.paymentId).toBe('string');
    expect(result.paymentId.length).toBeGreaterThan(0);
  });

  test('resolves with a checkoutUrl string', async () => {
    const { initiatePayment } = createSandbox();
    const result = await initiatePayment(VALID_PARAMS);
    expect(typeof result.checkoutUrl).toBe('string');
  });

  test('resolves with a future expiresAt timestamp', async () => {
    const { initiatePayment } = createSandbox();
    const before = Date.now();
    const result  = await initiatePayment(VALID_PARAMS);
    expect(result.expiresAt).toBeGreaterThan(before);
  });

  test('each call returns a unique paymentId', async () => {
    const { initiatePayment } = createSandbox();
    const r1 = await initiatePayment(VALID_PARAMS);
    const r2 = await initiatePayment(VALID_PARAMS);
    expect(r1.paymentId).not.toBe(r2.paymentId);
  });

  test('throws when userId is missing', async () => {
    const { initiatePayment } = createSandbox();
    await expect(
      initiatePayment({ ...VALID_PARAMS, userId: '' }),
    ).rejects.toThrow(/missing required/i);
  });

  test('throws when groupId is missing', async () => {
    const { initiatePayment } = createSandbox();
    await expect(
      initiatePayment({ ...VALID_PARAMS, groupId: null }),
    ).rejects.toThrow(/missing required/i);
  });

  test('throws when contributionId is missing', async () => {
    const { initiatePayment } = createSandbox();
    await expect(
      initiatePayment({ ...VALID_PARAMS, contributionId: undefined }),
    ).rejects.toThrow(/missing required/i);
  });

  test('throws when amount is 0', async () => {
    const { initiatePayment } = createSandbox();
    await expect(
      initiatePayment({ ...VALID_PARAMS, amount: 0 }),
    ).rejects.toThrow(/positive number/i);
  });

  test('throws when amount is negative', async () => {
    const { initiatePayment } = createSandbox();
    await expect(
      initiatePayment({ ...VALID_PARAMS, amount: -1 }),
    ).rejects.toThrow(/positive number/i);
  });

  test('throws when amount is a string (wrong type)', async () => {
    const { initiatePayment } = createSandbox();
    await expect(
      initiatePayment({ ...VALID_PARAMS, amount: '300' }),
    ).rejects.toThrow(/positive number/i);
  });

  test('defaults currency to "ZAR" when omitted', async () => {
    // No direct assertion possible without exposing the store, but
    // the call must resolve (not throw) when currency is omitted.
    const { initiatePayment } = createSandbox();
    const { userId, groupId, contributionId, amount } = VALID_PARAMS;
    await expect(
      initiatePayment({ userId, groupId, contributionId, amount }),
    ).resolves.toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════
// getPaymentStatus
// ═══════════════════════════════════════════════════════════

describe('getPaymentStatus()', () => {
  test('returns "pending" immediately after initiation', async () => {
    const { initiatePayment, getPaymentStatus } = createSandbox();
    const { paymentId }  = await initiatePayment(VALID_PARAMS);
    const statusData     = await getPaymentStatus(paymentId);
    expect(statusData.status).toBe('pending');
  });

  test('returned object contains paymentId, status, amount, transactionId, updatedAt', async () => {
    const { initiatePayment, getPaymentStatus } = createSandbox();
    const { paymentId } = await initiatePayment(VALID_PARAMS);
    const statusData    = await getPaymentStatus(paymentId);
    expect(statusData).toHaveProperty('paymentId', paymentId);
    expect(statusData).toHaveProperty('status');
    expect(statusData).toHaveProperty('amount', VALID_PARAMS.amount);
    expect(statusData).toHaveProperty('transactionId');
    expect(statusData).toHaveProperty('updatedAt');
  });

  test('transactionId is null for a pending payment', async () => {
    const { initiatePayment, getPaymentStatus } = createSandbox();
    const { paymentId } = await initiatePayment(VALID_PARAMS);
    const statusData    = await getPaymentStatus(paymentId);
    expect(statusData.transactionId).toBeNull();
  });

  test('throws for an unknown paymentId', async () => {
    const { getPaymentStatus } = createSandbox();
    await expect(getPaymentStatus('does_not_exist')).rejects.toThrow(/not found/i);
  });
});

// ── Helper: wait ms real milliseconds ─────────────────────
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ═══════════════════════════════════════════════════════════
// simulatePaymentSuccess
// ═══════════════════════════════════════════════════════════

describe('simulatePaymentSuccess()', () => {
  // Uses real timers — simulatePaymentSuccess delay is set to a
  // very small value (10 ms) to keep tests fast.

  test('transitions status to "completed" after the delay', async () => {
    const { initiatePayment, getPaymentStatus, simulatePaymentSuccess } = createSandbox();
    const { paymentId } = await initiatePayment(VALID_PARAMS);

    simulatePaymentSuccess(paymentId, 10);
    await wait(50); // wait longer than the 10 ms simulation delay

    const statusData = await getPaymentStatus(paymentId);
    expect(statusData.status).toBe('completed');
  }, 10_000);

  test('sets a non-null transactionId after success', async () => {
    const { initiatePayment, getPaymentStatus, simulatePaymentSuccess } = createSandbox();
    const { paymentId } = await initiatePayment(VALID_PARAMS);

    simulatePaymentSuccess(paymentId, 10);
    await wait(50);

    const statusData = await getPaymentStatus(paymentId);
    expect(statusData.transactionId).not.toBeNull();
    expect(typeof statusData.transactionId).toBe('string');
  }, 10_000);

  test('does nothing for an unknown paymentId (no throw)', async () => {
    const { simulatePaymentSuccess } = createSandbox();
    expect(() => simulatePaymentSuccess('nonexistent', 10)).not.toThrow();
    await wait(20); // let the timer fire — should be a no-op
  }, 10_000);
});

// ═══════════════════════════════════════════════════════════
// simulatePaymentFailure
// ═══════════════════════════════════════════════════════════

describe('simulatePaymentFailure()', () => {
  test('transitions status to "failed" after the delay', async () => {
    const { initiatePayment, getPaymentStatus, simulatePaymentFailure } = createSandbox();
    const { paymentId } = await initiatePayment(VALID_PARAMS);

    simulatePaymentFailure(paymentId, 10);
    await wait(50);

    const statusData = await getPaymentStatus(paymentId);
    expect(statusData.status).toBe('failed');
  }, 10_000);

  test('payment is still "pending" immediately after initiation (before delay)', async () => {
    const { initiatePayment, getPaymentStatus } = createSandbox();
    // A freshly initiated payment has no failure scheduled yet.
    // Status should be 'pending' on first poll.
    const { paymentId } = await initiatePayment(VALID_PARAMS);
    const statusData    = await getPaymentStatus(paymentId);
    expect(statusData.status).toBe('pending');
  }, 10_000);
});
