/* ============================================================
   tests/payment-validator.test.js
   Unit tests for frontend/js/payment-validator.js

   Covers
   ──────
   validatePaymentContext()  — required fields, amount bounds
   validatePaymentMethod()   — allowed-values guard
   isNetworkAvailable()      — navigator.onLine passthrough
   categorizePaymentError()  — every error category + structure

   Manual / UI tests that cannot run in Node
   ──────────────────────────────────────────
   ✋ UI/UX
     [ ] Offline banner appears immediately when device goes offline
     [ ] Offline banner dismisses when device comes back online
     [ ] "Proceed" button is disabled while offline
     [ ] Inline form-error messages are visible and descriptive
     [ ] Each failed screen shows correct title, message and steps
     [ ] Non-retryable errors navigate to History / Login page

   ✋ Accessibility
     [ ] All interactive controls have visible :focus rings
     [ ] Error messages are announced by screen-reader (aria-live)
     [ ] Offline banner has role="alert" and fires immediately
     [ ] Keyboard navigation works through entire 6-screen flow
     [ ] Tab order is logical across form → confirm → processing

   ✋ Mobile responsiveness (≤ 480 px)
     [ ] Modal fills viewport with no horizontal scroll
     [ ] Step indicator wraps gracefully on narrow screens
     [ ] Buttons are min 44 px tall (touch target)
     [ ] Recovery-steps list is readable without zooming
     [ ] Offline banner text does not overflow
   ============================================================ */

'use strict';

const fs   = require('fs');
const vm   = require('vm');
const path = require('path');

/* ── Load & strip ES-module syntax ─────────────────────────── */
const SRC = fs.readFileSync(
  path.join(__dirname, '..', 'frontend', 'js', 'payment-validator.js'),
  'utf-8'
);
// Remove `export` keywords; functions become plain declarations
// that land on the sandbox object when run with vm.runInContext.
const STRIPPED_SRC = SRC.replace(/^export /gm, '');

/**
 * Build a fresh vm sandbox.  navigator.onLine defaults to true
 * but can be overridden per test.
 */
function createSandbox(overrides = {}) {
  const sandbox = {
    navigator: { onLine: true },
    console,
    ...overrides,
  };
  vm.createContext(sandbox);
  vm.runInContext(STRIPPED_SRC, sandbox, { filename: 'payment-validator.js' });
  return sandbox;
}

/* ══════════════════════════════════════════════════════════
   validatePaymentContext
   ══════════════════════════════════════════════════════════ */
describe('validatePaymentContext()', () => {
  let sb;
  beforeEach(() => { sb = createSandbox(); });

  const VALID = { userId: 'u1', groupId: 'g1', contributionId: 'c1', amount: 500 };

  test('returns { valid:true, error:null } for a complete context', () => {
    expect(sb.validatePaymentContext(VALID)).toEqual({ valid: true, error: null });
  });

  test('accepts string amount that parses to a valid number', () => {
    expect(sb.validatePaymentContext({ ...VALID, amount: '250.50' }).valid).toBe(true);
  });

  test('accepts amount exactly equal to the maximum (1 000 000)', () => {
    expect(sb.validatePaymentContext({ ...VALID, amount: 1_000_000 }).valid).toBe(true);
  });

  test('rejects null context', () => {
    const r = sb.validatePaymentContext(null);
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/context is missing/i);
  });

  test('rejects undefined context', () => {
    expect(sb.validatePaymentContext(undefined).valid).toBe(false);
  });

  test('rejects missing userId', () => {
    const r = sb.validatePaymentContext({ ...VALID, userId: '' });
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/authentication/i);
  });

  test('rejects falsy userId (null)', () => {
    expect(sb.validatePaymentContext({ ...VALID, userId: null }).valid).toBe(false);
  });

  test('rejects missing groupId', () => {
    const r = sb.validatePaymentContext({ ...VALID, groupId: '' });
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/group/i);
  });

  test('rejects missing contributionId', () => {
    const r = sb.validatePaymentContext({ ...VALID, contributionId: '' });
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/contribution/i);
  });

  test('rejects amount of 0', () => {
    const r = sb.validatePaymentContext({ ...VALID, amount: 0 });
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/greater than zero/i);
  });

  test('rejects negative amount', () => {
    expect(sb.validatePaymentContext({ ...VALID, amount: -1 }).valid).toBe(false);
  });

  test('rejects non-numeric string amount', () => {
    expect(sb.validatePaymentContext({ ...VALID, amount: 'free' }).valid).toBe(false);
  });

  test('rejects amount above 1 000 000', () => {
    const r = sb.validatePaymentContext({ ...VALID, amount: 1_000_001 });
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/maximum/i);
  });
});

/* ══════════════════════════════════════════════════════════
   validatePaymentMethod
   ══════════════════════════════════════════════════════════ */
describe('validatePaymentMethod()', () => {
  let sb;
  beforeEach(() => { sb = createSandbox(); });

  test('accepts "card"', () => {
    expect(sb.validatePaymentMethod('card')).toEqual({ valid: true, error: null });
  });

  test('accepts "eft"', () => {
    expect(sb.validatePaymentMethod('eft')).toEqual({ valid: true, error: null });
  });

  test('rejects empty string', () => {
    const r = sb.validatePaymentMethod('');
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/select a payment method/i);
  });

  test('rejects uppercase variant', () => {
    expect(sb.validatePaymentMethod('CARD').valid).toBe(false);
  });

  test('rejects unknown method', () => {
    expect(sb.validatePaymentMethod('crypto').valid).toBe(false);
  });

  test('rejects null', () => {
    expect(sb.validatePaymentMethod(null).valid).toBe(false);
  });

  test('rejects undefined', () => {
    expect(sb.validatePaymentMethod(undefined).valid).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════════
   isNetworkAvailable
   ══════════════════════════════════════════════════════════ */
describe('isNetworkAvailable()', () => {
  test('returns true when navigator.onLine is true', () => {
    const sb = createSandbox({ navigator: { onLine: true } });
    expect(sb.isNetworkAvailable()).toBe(true);
  });

  test('returns false when navigator.onLine is false', () => {
    const sb = createSandbox({ navigator: { onLine: false } });
    expect(sb.isNetworkAvailable()).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════════
   categorizePaymentError
   ══════════════════════════════════════════════════════════ */
describe('categorizePaymentError()', () => {
  let sb;
  beforeEach(() => { sb = createSandbox({ navigator: { onLine: true } }); });

  /* ── Return-value structure ─────────────────────────────── */
  test('always returns the five required keys', () => {
    const info = sb.categorizePaymentError(new Error('oops'), 'initiate');
    expect(info).toHaveProperty('title');
    expect(info).toHaveProperty('message');
    expect(info).toHaveProperty('steps');
    expect(info).toHaveProperty('retryable');
    expect(info).toHaveProperty('actionLabel');
    expect(Array.isArray(info.steps)).toBe(true);
  });

  /* ── Timeout context ────────────────────────────────────── */
  test('timeout → "Verification Timed Out", not retryable, View History', () => {
    const info = sb.categorizePaymentError(null, 'timeout');
    expect(info.title).toBe('Verification Timed Out');
    expect(info.retryable).toBe(false);
    expect(info.actionLabel).toBe('View History');
    expect(info.steps.length).toBeGreaterThan(0);
  });

  /* ── Network / offline ──────────────────────────────────── */
  test('browser offline → "Connection Problem"', () => {
    const sbOff = createSandbox({ navigator: { onLine: false } });
    const info  = sbOff.categorizePaymentError(new Error('fetch failed'), 'initiate');
    expect(info.title).toBe('Connection Problem');
    expect(info.retryable).toBe(true);
    expect(info.actionLabel).toBe('Retry');
  });

  test('"NetworkError" message → "Connection Problem"', () => {
    const info = sb.categorizePaymentError(new Error('NetworkError when attempting to fetch resource'), 'initiate');
    expect(info.title).toBe('Connection Problem');
  });

  test('"Failed to fetch" message → "Connection Problem"', () => {
    const info = sb.categorizePaymentError(new Error('Failed to fetch'), 'initiate');
    expect(info.title).toBe('Connection Problem');
  });

  test('"timeout" in message → "Connection Problem"', () => {
    const info = sb.categorizePaymentError(new Error('Request timeout exceeded'), 'initiate');
    expect(info.title).toBe('Connection Problem');
    expect(info.steps.some(s => /wi-fi|data/i.test(s))).toBe(true);
  });

  /* ── Auth / session ─────────────────────────────────────── */
  test('"not authenticated" message → "Session Expired", Log In', () => {
    const info = sb.categorizePaymentError(new Error('User is not authenticated'), 'initiate');
    expect(info.title).toBe('Session Expired');
    expect(info.retryable).toBe(false);
    expect(info.actionLabel).toBe('Log In');
  });

  test('"Permission denied" → "Session Expired"', () => {
    expect(sb.categorizePaymentError(new Error('Permission denied'), 'initiate').title)
      .toBe('Session Expired');
  });

  test('"Forbidden" → "Session Expired"', () => {
    expect(sb.categorizePaymentError(new Error('403 Forbidden'), 'initiate').title)
      .toBe('Session Expired');
  });

  /* ── Declined ───────────────────────────────────────────── */
  test('"declined" message → "Payment Declined", retryable', () => {
    const info = sb.categorizePaymentError(new Error('Card declined by issuer'), 'initiate');
    expect(info.title).toBe('Payment Declined');
    expect(info.retryable).toBe(true);
  });

  test('"Insufficient funds" → "Payment Declined"', () => {
    expect(sb.categorizePaymentError(new Error('Insufficient funds'), 'initiate').title)
      .toBe('Payment Declined');
  });

  test('"limit exceeded" → "Payment Declined"', () => {
    expect(sb.categorizePaymentError(new Error('Limit exceeded'), 'initiate').title)
      .toBe('Payment Declined');
  });

  /* ── Poll-context declined ──────────────────────────────── */
  test('poll context with generic error → "Payment Declined"', () => {
    const info = sb.categorizePaymentError(new Error('declined'), 'poll');
    expect(info.title).toBe('Payment Declined');
    expect(info.retryable).toBe(true);
  });

  /* ── Generic fallback ───────────────────────────────────── */
  test('unknown error string → "Payment Failed", retryable', () => {
    const info = sb.categorizePaymentError(new Error('Something unexpected happened'), 'initiate');
    expect(info.title).toBe('Payment Failed');
    expect(info.retryable).toBe(true);
  });

  test('null error with initiate context → "Payment Failed" with a recovery step', () => {
    const info = sb.categorizePaymentError(null, 'initiate');
    expect(info.title).toBe('Payment Failed');
    expect(info.steps.length).toBeGreaterThan(0);
  });

  test('message from raw error is surfaced in generic fallback', () => {
    const info = sb.categorizePaymentError(new Error('Gateway error GW-500'), 'initiate');
    expect(info.message).toContain('GW-500');
  });
});
