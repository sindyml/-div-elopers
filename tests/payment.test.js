/* ============================================================
   tests/payment.test.js
   Unit & integration tests for the backend payment layer.

   Covers:
   - PaymentService.createCharge        : success, API error
   - PaymentService.getChargeStatus     : success, not found
   - PaymentService.verifyWebhookSignature : valid, invalid, no secret
   - PaymentService.createChargeWithRetry : succeeds on retry, exhausts retries
   - PaymentService.refundCharge        : success, API error
   - PaymentService.generatePaymentIntent: shape of returned object
   ============================================================ */

const axios = require('axios');
const crypto = require('crypto');

// ── Module-level jest.mock must come before require ─────────
jest.mock('axios');
jest.mock('firebase-admin', () => ({
  apps: [],
  initializeApp: jest.fn(),
  firestore: jest.fn(() => ({})),
  credential: { applicationDefault: jest.fn(), cert: jest.fn() },
}));

// Load module after mocks are in place
const paymentService = require('../backend/services/paymentService');

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/** Build a Yoco-like successful charge response body. */
function makeChargeResponse(overrides = {}) {
  return {
    id: 'ch_test_abc123',
    status: 'successful',
    amount: 30000,
    currency: 'ZAR',
    receipt_url: 'https://yoco.com/receipt/abc123',
    payment_method: { type: 'card' },
    ...overrides,
  };
}

/** Build an Axios-style error with a response body. */
function makeAxiosError(message, responseData = {}, statusCode = 400) {
  const err = new Error(message);
  err.response = { data: responseData, status: statusCode };
  return err;
}

// ─────────────────────────────────────────────────────────────
// Reset mocks between tests
// ─────────────────────────────────────────────────────────────
beforeEach(() => {
  jest.clearAllMocks();
  // The paymentService is a singleton exported at module load time.
  // Set the instance properties directly so each test starts from a
  // known state regardless of when the module was first required.
  paymentService.apiKey = 'sk_test_XXXXXXXX';
  paymentService.webhookSecret = 'whsec_test_secret';
});

// =============================================================
// PaymentService.createCharge
// =============================================================
describe('PaymentService.createCharge()', () => {
  test('returns success:true with charge data on a valid request', async () => {
    const chargeData = makeChargeResponse();
    axios.post.mockResolvedValueOnce({ data: chargeData });

    const result = await paymentService.createCharge(300, 'ZAR', 'tok_test_abc');

    expect(result.success).toBe(true);
    expect(result.data).toEqual(chargeData);
  });

  test('converts amount from rands to cents when calling Yoco', async () => {
    axios.post.mockResolvedValueOnce({ data: makeChargeResponse() });

    await paymentService.createCharge(150.5, 'ZAR', 'tok_test_abc');

    const [, body] = axios.post.mock.calls[0];
    expect(body.amount).toBe(15050); // 150.5 * 100 rounded
  });

  test('sends the correct Authorization header', async () => {
    axios.post.mockResolvedValueOnce({ data: makeChargeResponse() });

    await paymentService.createCharge(100, 'ZAR', 'tok_test_abc');

    const [, , config] = axios.post.mock.calls[0];
    expect(config.headers['Authorization']).toBe('Bearer sk_test_XXXXXXXX');
  });

  test('returns success:false with error message when Yoco returns an error', async () => {
    axios.post.mockRejectedValueOnce(
      makeAxiosError('Card declined', { message: 'Card declined', code: 'card_declined' }),
    );

    const result = await paymentService.createCharge(300, 'ZAR', 'tok_bad');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Card declined');
    expect(result.code).toBe('card_declined');
  });

  test('returns generic error when Yoco response has no message', async () => {
    axios.post.mockRejectedValueOnce(new Error('Network error'));

    const result = await paymentService.createCharge(300, 'ZAR', 'tok_bad');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Payment processing failed');
  });

  test('includes metadata in the request body', async () => {
    axios.post.mockResolvedValueOnce({ data: makeChargeResponse() });
    const metadata = { userId: 'u1', contributionId: 'c1' };

    await paymentService.createCharge(100, 'ZAR', 'tok_abc', metadata);

    const [, body] = axios.post.mock.calls[0];
    expect(body.metadata).toEqual(metadata);
  });
});

// =============================================================
// PaymentService.getChargeStatus
// =============================================================
describe('PaymentService.getChargeStatus()', () => {
  test('returns success:true with charge data for a valid charge ID', async () => {
    const chargeData = makeChargeResponse();
    axios.get.mockResolvedValueOnce({ data: chargeData });

    const result = await paymentService.getChargeStatus('ch_test_abc123');

    expect(result.success).toBe(true);
    expect(result.data).toEqual(chargeData);
  });

  test('calls the correct Yoco charges endpoint', async () => {
    axios.get.mockResolvedValueOnce({ data: makeChargeResponse() });

    await paymentService.getChargeStatus('ch_test_abc123');

    const [url] = axios.get.mock.calls[0];
    expect(url).toMatch(/\/charges\/ch_test_abc123$/);
  });

  test('returns success:false when charge is not found', async () => {
    axios.get.mockRejectedValueOnce(
      makeAxiosError('Not found', { message: 'Charge not found' }, 404),
    );

    const result = await paymentService.getChargeStatus('ch_unknown');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Charge not found');
  });
});

// =============================================================
// PaymentService.verifyWebhookSignature
// =============================================================
describe('PaymentService.verifyWebhookSignature()', () => {
  function buildValidSignature(payload, timestamp, secret) {
    return crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${payload}`)
      .digest('hex');
  }

  test('returns true for a correctly signed payload', () => {
    const secret = 'whsec_test_secret';
    const payload = JSON.stringify({ type: 'charge.succeeded' });
    const timestamp = '1700000000';
    const signature = buildValidSignature(payload, timestamp, secret);

    process.env.YOCO_WEBHOOK_SECRET = secret;
    // Re-instantiate to pick up env var (module is a singleton)
    paymentService.webhookSecret = secret;

    expect(paymentService.verifyWebhookSignature(payload, signature, timestamp)).toBe(true);
  });

  test('returns false for a tampered payload', () => {
    const secret = 'whsec_test_secret';
    const payload = JSON.stringify({ type: 'charge.succeeded' });
    const timestamp = '1700000000';
    const signature = buildValidSignature(payload, timestamp, secret);

    paymentService.webhookSecret = secret;

    // Tamper with payload
    expect(
      paymentService.verifyWebhookSignature('tampered_payload', signature, timestamp),
    ).toBe(false);
  });

  test('returns true (skips verification) when webhookSecret is not configured', () => {
    paymentService.webhookSecret = null;

    expect(paymentService.verifyWebhookSignature('payload', 'sig', '123')).toBe(true);
  });
});

// =============================================================
// PaymentService.createChargeWithRetry
// =============================================================
describe('PaymentService.createChargeWithRetry()', () => {
  let originalSetTimeout;

  // Replace setTimeout with an immediate version to skip backoff delays.
  beforeEach(() => {
    originalSetTimeout = global.setTimeout;
    jest.spyOn(global, 'setTimeout').mockImplementation((cb) => { cb(); return 0; });
  });

  afterEach(() => {
    global.setTimeout = originalSetTimeout;
    jest.restoreAllMocks();
  });

  test('returns immediately on first success without retrying', async () => {
    axios.post.mockResolvedValueOnce({ data: makeChargeResponse() });

    const result = await paymentService.createChargeWithRetry(300, 'ZAR', 'tok_abc', {}, 3);

    expect(result.success).toBe(true);
    expect(axios.post).toHaveBeenCalledTimes(1);
  });

  test('retries on failure and succeeds on the second attempt', async () => {
    axios.post
      .mockRejectedValueOnce(makeAxiosError('Fail', { message: 'Temporary error' }))
      .mockResolvedValueOnce({ data: makeChargeResponse() });

    const result = await paymentService.createChargeWithRetry(300, 'ZAR', 'tok_abc', {}, 3);

    expect(result.success).toBe(true);
    expect(axios.post).toHaveBeenCalledTimes(2);
  });

  test('returns success:false after exhausting all retries', async () => {
    axios.post.mockRejectedValue(makeAxiosError('Fail', { message: 'Persistent error' }));

    const result = await paymentService.createChargeWithRetry(300, 'ZAR', 'tok_abc', {}, 3);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Failed after 3 attempts/);
    expect(axios.post).toHaveBeenCalledTimes(3);
  });
});

// =============================================================
// PaymentService.refundCharge
// =============================================================
describe('PaymentService.refundCharge()', () => {
  test('returns success:true on a successful full refund', async () => {
    const refundData = { id: 'ref_abc', status: 'refunded', amount: 30000 };
    axios.post.mockResolvedValueOnce({ data: refundData });

    const result = await paymentService.refundCharge('ch_test_abc123');

    expect(result.success).toBe(true);
    expect(result.data).toEqual(refundData);
  });

  test('sends empty body for a full refund', async () => {
    axios.post.mockResolvedValueOnce({ data: {} });

    await paymentService.refundCharge('ch_test_abc123');

    const [, body] = axios.post.mock.calls[0];
    expect(body).toEqual({});
  });

  test('sends the refund amount in cents for a partial refund', async () => {
    axios.post.mockResolvedValueOnce({ data: {} });

    await paymentService.refundCharge('ch_test_abc123', 100);

    const [, body] = axios.post.mock.calls[0];
    expect(body.amount).toBe(10000); // 100 * 100
  });

  test('returns success:false when Yoco rejects the refund', async () => {
    axios.post.mockRejectedValueOnce(
      makeAxiosError('Refund failed', { message: 'Charge already refunded' }),
    );

    const result = await paymentService.refundCharge('ch_test_abc123');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Charge already refunded');
  });
});

// =============================================================
// PaymentService.generatePaymentIntent
// =============================================================
describe('PaymentService.generatePaymentIntent()', () => {
  test('returns an object with chargeId, amount, currency, status, and timestamp', () => {
    const intent = paymentService.generatePaymentIntent('ch_abc', 300, 'ZAR');

    expect(intent).toHaveProperty('chargeId', 'ch_abc');
    expect(intent).toHaveProperty('amount', 300);
    expect(intent).toHaveProperty('currency', 'ZAR');
    expect(intent).toHaveProperty('status', 'pending');
    expect(intent).toHaveProperty('timestamp');
  });

  test('timestamp is a valid ISO string', () => {
    const intent = paymentService.generatePaymentIntent('ch_abc', 100);
    expect(() => new Date(intent.timestamp)).not.toThrow();
    expect(new Date(intent.timestamp).toISOString()).toBe(intent.timestamp);
  });

  test('defaults currency to ZAR when not provided', () => {
    const intent = paymentService.generatePaymentIntent('ch_abc', 100);
    expect(intent.currency).toBe('ZAR');
  });
});
