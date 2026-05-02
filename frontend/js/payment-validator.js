/* ============================================================
   payment-validator.js — Payment Form Validation & Error Utils

   Pure functions (no DOM access) for:
     - Validating the payment context before a transaction starts
     - Validating the selected payment method
     - Checking network availability
     - Categorising raw API / Firestore errors into user-friendly
       objects with recovery guidance and actionable steps

   Import into payment-modal.js and anywhere payment logic runs.
   ============================================================ */

/* ── Context Validation ──────────────────────────────────────── */

/**
 * Validate that all required payment context fields are present
 * and well-formed before the user proceeds to the confirm step.
 *
 * @param {{ userId?:string, groupId?:string, contributionId?:string,
 *           amount?:number|string, groupName?:string }} ctx
 * @returns {{ valid: boolean, error: string|null }}
 */
export function validatePaymentContext(ctx) {
  if (!ctx) {
    return { valid: false, error: 'Payment context is missing. Please reload the page and try again.' };
  }
  if (!ctx.userId) {
    return { valid: false, error: 'Authentication required. Please log in again.' };
  }
  if (!ctx.groupId) {
    return { valid: false, error: 'Group information is missing. Please reload the page.' };
  }
  if (!ctx.contributionId) {
    return { valid: false, error: 'Contribution reference is missing. Please reload the page.' };
  }

  const amount = parseFloat(ctx.amount);
  if (isNaN(amount) || amount <= 0) {
    return { valid: false, error: 'Payment amount must be greater than zero.' };
  }
  if (amount > 1_000_000) {
    return { valid: false, error: 'Payment amount exceeds the allowed maximum of R 1,000,000.' };
  }

  return { valid: true, error: null };
}

/**
 * Validate that the selected payment method is one of the
 * accepted values ('card' or 'eft').
 *
 * @param {string} method
 * @returns {{ valid: boolean, error: string|null }}
 */
export function validatePaymentMethod(method) {
  const allowed = ['card', 'eft'];
  if (!allowed.includes(method)) {
    return { valid: false, error: 'Please select a payment method (Card or EFT) to continue.' };
  }
  return { valid: true, error: null };
}

/* ── Network Availability ────────────────────────────────────── */

/**
 * Returns true if the browser reports an active network connection.
 *
 * Note: navigator.onLine reflects OS-level connectivity (LAN / Wi-Fi).
 * It can return true without real internet. Use this only as a fast
 * pre-flight check — the real verification comes from the API call.
 *
 * @returns {boolean}
 */
export function isNetworkAvailable() {
  return navigator.onLine !== false;
}

/* ── Error Categorisation ────────────────────────────────────── */

/**
 * @typedef {Object} PaymentErrorInfo
 * @property {string}   title        Short, user-visible error heading.
 * @property {string}   message      Full explanation shown in the UI.
 * @property {string[]} steps        Ordered recovery instructions (may be empty).
 * @property {boolean}  retryable    Whether the user can retry within the modal.
 * @property {string}   actionLabel  Label for the primary action button.
 */

/* Pattern sets for classifying raw error messages */
const _NETWORK_RE   = [/network/i, /fetch/i, /failed to fetch/i, /networkerror/i,
                       /offline/i, /err_internet/i, /err_network/i, /timeout/i];
const _AUTH_RE      = [/auth/i, /permission/i, /unauthenticated/i, /unauthorized/i,
                       /forbidden/i, /not-authenticated/i];
const _DECLINED_RE  = [/declin/i, /insufficient/i, /limit exceeded/i, /fraud/i,
                       /blocked/i, /do not honour/i];

/**
 * Map a raw error (from API, Firestore, or polling timeout) to a
 * user-friendly PaymentErrorInfo with recovery guidance.
 *
 * @param {Error|string|null} err
 * @param {'initiate'|'poll'|'timeout'} [context='initiate']
 * @returns {PaymentErrorInfo}
 */
export function categorizePaymentError(err, context = 'initiate') {
  const msg = (err instanceof Error ? err.message : String(err || '')) || '';

  // ── Timeout (polling exhausted) ─────────────────────────────
  if (context === 'timeout') {
    return {
      title:       'Verification Timed Out',
      message:     'We could not confirm your payment within the expected time. Check your payment history — if a deduction occurred, your treasurer will reconcile it.',
      steps: [
        'Open Payment History to see if the transaction appears.',
        'If a deduction was made from your account, contact your treasurer.',
        'Wait a few minutes and check again before retrying.',
      ],
      retryable:   false,
      actionLabel: 'View History',
    };
  }

  // ── Network / connectivity error ────────────────────────────
  if (!navigator.onLine || _NETWORK_RE.some(r => r.test(msg))) {
    return {
      title:       'Connection Problem',
      message:     'A network error occurred. Please check your internet connection and try again.',
      steps: [
        'Check your Wi-Fi or mobile data signal.',
        'Try switching between Wi-Fi and mobile data.',
        'Make sure Airplane Mode is off.',
      ],
      retryable:   true,
      actionLabel: 'Retry',
    };
  }

  // ── Authentication / session error ──────────────────────────
  if (_AUTH_RE.some(r => r.test(msg))) {
    return {
      title:       'Session Expired',
      message:     'Your login session has expired. Please log in again to complete the payment.',
      steps: [
        'You will be redirected to the login page.',
        'Log in and navigate back to make your payment.',
      ],
      retryable:   false,
      actionLabel: 'Log In',
    };
  }

  // ── Bank / gateway declined ─────────────────────────────────
  if (_DECLINED_RE.some(r => r.test(msg))) {
    return {
      title:       'Payment Declined',
      message:     'Your payment was declined by the bank or gateway.',
      steps: [
        'Ensure your card has sufficient funds or your daily limit has not been reached.',
        'Contact your bank if the problem persists.',
        'Try a different payment method (e.g. EFT instead of Card).',
      ],
      retryable:   true,
      actionLabel: 'Try Again',
    };
  }

  // ── Poll-specific declined / cancelled ──────────────────────
  if (context === 'poll') {
    return {
      title:       'Payment Declined',
      message:     'Your payment could not be completed. Please try a different payment method.',
      steps: [
        'Check your bank app or SMS for a decline notification.',
        'Ensure sufficient funds are available.',
        'Try paying via EFT if your card was declined.',
      ],
      retryable:   true,
      actionLabel: 'Retry',
    };
  }

  // ── Generic / initiate fallback ─────────────────────────────
  return {
    title:       'Payment Failed',
    message:     msg || 'Something went wrong. Please try again.',
    steps:       msg ? [] : ['Reload the page and try again if the problem persists.'],
    retryable:   true,
    actionLabel: 'Retry',
  };
}
