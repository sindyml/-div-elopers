/* ============================================================
   payment-modal.js — Payment Modal Component

   A self-contained modal that manages the full payment flow:
     1. Form     → amount summary + payment method selection
     2. Confirm  → review details before submitting
     3. Processing → spinner while polling for status
     4. Receipt  → success screen with optional proof upload
     5. Failed   → error screen with retry option
     6. Proof    → drag-and-drop proof upload interface

   Usage:
     import { PaymentModal } from './components/payment-modal.js';

     const modal = new PaymentModal();

     // Assign callbacks
     modal.onPaymentSuccess = (receipt) => { ... };
     modal.onPaymentFailed  = (error)   => { ... };
     modal.onProofUploaded  = async (file, paymentId) => { ... };

     // Open with contribution context
     modal.open({
       userId:         'uid-abc',
       groupId:        'grp-xyz',
       contributionId: 'contrib-123',
       amount:         500,
       groupName:      'Evergreen Stokvel',
       dueDate:        '2026-05-01',  // optional, display only
     });
   ============================================================ */

import { auth } from '../js/firebase-config.js';
import {
  initiatePayment,
  getPaymentStatus,
} from '../js/paymentService.js';
import {
  validatePaymentContext,
  validatePaymentMethod,
  isNetworkAvailable,
  categorizePaymentError,
} from '../js/payment-validator.js';

/* ── Constants ─────────────────────────────────────────────── */
const POLL_INTERVAL_MS      = 2000;
const POLL_SLOW_INTERVAL_MS = 5000;  // used after POLL_SLOW_AFTER attempts
const POLL_SLOW_AFTER       = 5;     // switch to slow interval after this many polls
const POLL_MAX_ATTEMPTS     = 20;    // total polls before timeout
const POLL_MAX_NET_ERRORS   = 3;     // consecutive network errors → abort
const CARD_FEE_RATE     = 0.015; // 1.5% for card payments
const MAX_PROOF_SIZE    = 5 * 1024 * 1024; // 5 MB
const ALLOWED_PROOF_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];

/* ── PaymentModal Class ────────────────────────────────────── */
export class PaymentModal {
  constructor() {
    /** @type {HTMLElement|null} */
    this._root = null;

    /** @type {{ userId:string, groupId:string, contributionId:string,
     *           amount:number, groupName:string, dueDate?:string }|null} */
    this._context = null;

    /** @type {string|null} paymentId returned by initiatePayment */
    this._paymentId = null;

    /** @type {'card'|'eft'} */
    this._selectedMethod = 'card';

    /** @type {File|null} */
    this._selectedFile = null;

    /** @type {ReturnType<typeof setInterval>|null} */
    this._pollTimer = null;

    /** @type {number} */
    this._pollCount = 0;

    /* ── Public callbacks ──────────────────────────────────── */

    /**
     * Called when a payment completes successfully.
     * @type {((receipt: Object) => void)|null}
     */
    this.onPaymentSuccess = null;

    /**
     * Called when a payment fails or is cancelled.
     * @type {((error: Error) => void)|null}
     */
    this.onPaymentFailed = null;

    /**
     * Called when the user selects a proof file and clicks "Upload".
     * Implementor should upload the file to Firebase Storage and
     * write the proof document to Firestore.
     * @type {((file: File, paymentId: string) => Promise<void>)|null}
     */
    this.onProofUploaded = null;

    /**
     * Called when the modal is closed.
     * @type {(() => void)|null}
     */
    this.onClose = null;

    /** @type {boolean} Whether the device currently has a network connection. */
    this._isOnline = navigator.onLine !== false;
    /** @type {number} Consecutive network errors during polling. */
    this._consecutiveNetErrors = 0;
    /** @type {boolean} True while polling is paused due to being offline. */
    this._pollPaused = false;

    this._inject();
    this._wireNetworkEvents();
  }

  /* ── Public API ────────────────────────────────────────────── */

  /**
   * Open the payment modal for a given contribution.
   * @param {{ userId:string, groupId:string, contributionId:string,
   *           amount:number, groupName:string, dueDate?:string }} context
   */
  open(context) {
    if (!context || !context.userId || !context.groupId || !context.contributionId) {
      console.error('[PaymentModal] open() requires userId, groupId, and contributionId');
      return;
    }

    this._context = context;
    this._paymentId = null;
    this._selectedMethod = 'card';
    this._selectedFile = null;

    this._root.classList.add('is-open');
    document.body.style.overflow = 'hidden';

    this._showScreen('form');
    this._populateForm();
  }

  /** Close and clean up. */
  close() {
    this._clearPoll();
    this._root.classList.remove('is-open');
    document.body.style.overflow = '';

    if (typeof this.onClose === 'function') this.onClose();
  }

  /* ── DOM Injection ─────────────────────────────────────────── */

  _inject() {
    const existing = document.getElementById('payment-modal-root');
    if (existing && existing.querySelector('.payment-overlay')) {
      // Element exists and has template already injected
      this._root = existing;
      this._wireEvents();
      return;
    }

    if (existing) {
      // Element exists but is empty - inject template into it
      existing.innerHTML = this._buildTemplate();
      this._root = existing;
      this._wireEvents();
      return;
    }

    // No element exists - create and append
    const wrapper = document.createElement('div');
    wrapper.id = 'payment-modal-root';
    wrapper.innerHTML = this._buildTemplate();
    document.body.appendChild(wrapper);

    this._root = wrapper;
    this._wireEvents();
  }

  _buildTemplate() {
    return `
<div class="payment-overlay"
     role="dialog"
     aria-modal="true"
     aria-labelledby="payment-modal-title">

  <div class="payment-modal">

    <!-- ── Offline Banner ── -->
    <div id="pm-offline-banner"
         class="payment-offline-banner"
         role="alert"
         aria-live="assertive"
         hidden>
      <span class="payment-offline-banner__icon" aria-hidden="true">📡</span>
      <span class="payment-offline-banner__text">
        No internet connection. Your payment is paused until you're back online.
      </span>
    </div>

    <!-- ── Header ── -->
    <header class="payment-modal__header">
      <span class="payment-modal__icon" aria-hidden="true">💳</span>
      <h2 class="payment-modal__title" id="payment-modal-title">Make Payment</h2>
      <button class="payment-modal__close"
              data-action="close"
              aria-label="Close payment modal">✕</button>
    </header>

    <!-- ── Step Indicator ── -->
    <div class="payment-steps" role="list" aria-label="Payment progress">
      <div class="payment-steps__item is-active" data-step="form" role="listitem">
        <span class="payment-steps__dot" aria-hidden="true">1</span>
        <span class="payment-steps__label">Details</span>
      </div>
      <div class="payment-steps__connector" aria-hidden="true"></div>
      <div class="payment-steps__item" data-step="confirm" role="listitem">
        <span class="payment-steps__dot" aria-hidden="true">2</span>
        <span class="payment-steps__label">Confirm</span>
      </div>
      <div class="payment-steps__connector" aria-hidden="true"></div>
      <div class="payment-steps__item" data-step="receipt" role="listitem">
        <span class="payment-steps__dot" aria-hidden="true">3</span>
        <span class="payment-steps__label">Done</span>
      </div>
    </div>

    <!-- ══════════════════════════════════════════════════════ -->
    <!-- Screen 1: Form                                         -->
    <!-- ══════════════════════════════════════════════════════ -->
    <section class="payment-screen"
             id="payment-screen-form"
             aria-label="Payment details form">

      <!-- Amount summary -->
      <div class="payment-amount-card" aria-label="Payment amount">
        <span class="payment-amount-card__label">Amount Due</span>
        <span class="payment-amount-card__value"
              id="pm-amount-display"
              aria-live="polite">R 0.00</span>
        <span class="payment-amount-card__group"
              id="pm-group-display">—</span>
      </div>

      <!-- Payment method selection -->
      <div class="payment-method-section">
        <p class="payment-method-section__label"
           id="pm-method-label">Select payment method</p>

        <div class="payment-method-grid"
             role="radiogroup"
             aria-labelledby="pm-method-label">

          <label class="payment-method-card is-selected" data-method="card">
            <input type="radio"
                   name="pm-method"
                   value="card"
                   checked
                   class="sr-only" />
            <span class="payment-method-card__icon" aria-hidden="true">💳</span>
            <span class="payment-method-card__title">Card</span>
            <span class="payment-method-card__sub">Visa / Mastercard</span>
          </label>

          <label class="payment-method-card" data-method="eft">
            <input type="radio"
                   name="pm-method"
                   value="eft"
                   class="sr-only" />
            <span class="payment-method-card__icon" aria-hidden="true">🏦</span>
            <span class="payment-method-card__title">EFT</span>
            <span class="payment-method-card__sub">Bank transfer</span>
          </label>

        </div>
      </div>

      <!-- Fee breakdown -->
      <div class="payment-breakdown" aria-label="Payment breakdown">
        <div class="payment-breakdown__row">
          <span>Contribution amount</span>
          <span id="pm-base-amount">R 0.00</span>
        </div>
        <div class="payment-breakdown__row payment-breakdown__row--fee"
             id="pm-fee-row">
          <span>Processing fee (1.5%)</span>
          <span id="pm-fee-amount">R 0.00</span>
        </div>
        <div class="payment-breakdown__row payment-breakdown__row--total">
          <span>Total</span>
          <strong id="pm-total-amount">R 0.00</strong>
        </div>
      </div>

      <!-- Inline error -->
      <div class="payment-alert payment-alert--error payment-alert--hidden"
           id="pm-form-error"
           role="alert"
           aria-live="assertive"></div>

      <!-- Actions -->
      <div class="payment-modal__actions">
        <button class="btn btn--outline" data-action="close">Cancel</button>
        <button class="btn btn--primary" id="pm-proceed-btn" data-action="proceed">
          Continue →
        </button>
      </div>

    </section>

    <!-- ══════════════════════════════════════════════════════ -->
    <!-- Screen 2: Confirmation                                 -->
    <!-- ══════════════════════════════════════════════════════ -->
    <section class="payment-screen"
             id="payment-screen-confirm"
             aria-label="Payment confirmation"
             hidden>

      <div class="payment-confirm-card">
        <h3 class="payment-confirm-card__heading">Review your payment</h3>
        <ul class="payment-confirm-list"
            id="pm-confirm-list"
            aria-label="Payment details summary"></ul>
      </div>

      <p class="payment-confirm-notice">
        By continuing, you authorise this payment from your selected method.
      </p>

      <div class="payment-alert payment-alert--error payment-alert--hidden"
           id="pm-confirm-error"
           role="alert"
           aria-live="assertive"></div>

      <div class="payment-modal__actions">
        <button class="btn btn--outline" data-action="back-to-form">← Back</button>
        <button class="btn btn--primary" id="pm-pay-btn" data-action="pay">
          Pay Now
        </button>
      </div>

    </section>

    <!-- ══════════════════════════════════════════════════════ -->
    <!-- Screen 3: Processing (loading)                         -->
    <!-- ══════════════════════════════════════════════════════ -->
    <section class="payment-screen"
             id="payment-screen-processing"
             aria-label="Processing payment"
             aria-live="polite"
             hidden>

      <div class="payment-processing">
        <div class="payment-spinner" role="status" aria-label="Loading"></div>
        <h3 class="payment-processing__title" id="pm-processing-title">
          Processing payment…
        </h3>
        <p class="payment-processing__sub" id="pm-processing-sub">
          Please wait. Do not close this window.
        </p>
      </div>

    </section>

    <!-- ══════════════════════════════════════════════════════ -->
    <!-- Screen 4: Receipt (success)                            -->
    <!-- ══════════════════════════════════════════════════════ -->
    <section class="payment-screen"
             id="payment-screen-receipt"
             aria-label="Payment receipt"
             hidden>

      <div class="payment-receipt" id="pm-receipt-content">
        <div class="payment-receipt__badge" aria-label="Payment successful">✅</div>
        <h3 class="payment-receipt__title">Payment Successful</h3>
        <ul class="payment-receipt__list"
            id="pm-receipt-list"
            aria-label="Receipt details"></ul>
      </div>

      <div class="payment-modal__actions payment-modal__actions--column">
        <button class="btn btn--outline btn--sm"
                id="pm-upload-proof-btn"
                data-action="go-to-proof">
          📎 Upload proof of payment (optional)
        </button>
        <button class="btn btn--primary" data-action="close">Done</button>
      </div>

    </section>

    <!-- ══════════════════════════════════════════════════════ -->
    <!-- Screen 5: Failed                                       -->
    <!-- ══════════════════════════════════════════════════════ -->
    <section class="payment-screen"
             id="payment-screen-failed"
             aria-label="Payment failed"
             aria-live="assertive"
             hidden>

      <div class="payment-failed">
        <div class="payment-failed__badge" aria-label="Payment failed">❌</div>
        <h3 class="payment-failed__title" id="pm-failed-title">Payment Failed</h3>
        <p class="payment-failed__reason" id="pm-failed-reason">
          Something went wrong. Please try again.
        </p>
        <ul class="payment-failed__steps" id="pm-failed-steps" hidden></ul>
      </div>

      <div class="payment-modal__actions">
        <button class="btn btn--outline" data-action="close">Cancel</button>
        <button class="btn btn--primary"
                id="pm-failed-action-btn"
                data-action="retry">Retry Payment</button>
      </div>

    </section>

    <!-- ══════════════════════════════════════════════════════ -->
    <!-- Screen 6: Proof Upload                                 -->
    <!-- ══════════════════════════════════════════════════════ -->
    <section class="payment-screen"
             id="payment-screen-proof"
             aria-label="Upload payment proof"
             hidden>

      <p class="proof-upload-intro">
        Upload a screenshot or PDF of your payment confirmation. This helps
        your group treasurer verify the transaction.
      </p>

      <!-- Drop zone -->
      <div class="proof-upload-zone"
           id="pm-upload-zone"
           role="button"
           tabindex="0"
           aria-label="Click or drag a file here to upload payment proof">
        <span class="proof-upload-zone__icon" aria-hidden="true">📎</span>
        <p class="proof-upload-zone__text">
          Drop a file here or
          <span class="proof-upload-zone__link">browse</span>
        </p>
        <p class="proof-upload-zone__hint">JPG, PNG, or PDF · max 5 MB</p>
        <input type="file"
               id="pm-file-input"
               accept="image/jpeg,image/png,application/pdf"
               class="sr-only"
               aria-label="Choose payment proof file" />
      </div>

      <!-- File preview -->
      <div class="proof-upload-preview" id="pm-upload-preview" hidden>
        <div class="proof-upload-preview__info">
          <span class="proof-upload-preview__icon" aria-hidden="true">📄</span>
          <div>
            <p class="proof-upload-preview__name" id="pm-file-name"></p>
            <p class="proof-upload-preview__size" id="pm-file-size"></p>
          </div>
          <button class="proof-upload-preview__remove"
                  id="pm-remove-file"
                  type="button"
                  aria-label="Remove selected file">✕</button>
        </div>
        <div class="proof-upload-progress" id="pm-upload-progress" hidden>
          <div class="proof-upload-progress__bar"
               id="pm-progress-bar"
               style="width:0%"
               role="progressbar"
               aria-valuenow="0"
               aria-valuemin="0"
               aria-valuemax="100"></div>
        </div>
      </div>

      <!-- Error / success alerts -->
      <div class="payment-alert payment-alert--error payment-alert--hidden"
           id="pm-proof-error"
           role="alert"
           aria-live="assertive"></div>

      <div class="payment-alert payment-alert--success payment-alert--hidden"
           id="pm-proof-success"
           role="status"
           aria-live="polite"></div>

      <div class="payment-modal__actions">
        <button class="btn btn--outline" data-action="back-to-receipt">← Back</button>
        <button class="btn btn--primary"
                id="pm-submit-proof-btn"
                data-action="submit-proof"
                disabled>
          Upload Proof
        </button>
      </div>

    </section>

  </div><!-- /.payment-modal -->
</div><!-- /.payment-overlay -->
    `;
  }

  /* ── Event Wiring (FIXED with null checks) ────────────────── */

  _wireEvents() {
    // Close on backdrop click - ADD NULL CHECK
    const overlay = this._root.querySelector('.payment-overlay');
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) this.close();
      });
    }

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this._root.classList.contains('is-open')) {
        this.close();
      }
    });

    // Delegate button actions via data-action
    this._root.addEventListener('click', (e) => {
      const target = e.target.closest('[data-action]');
      if (!target) return;
      const action = target.dataset.action;

      switch (action) {
        case 'close':           this.close();                                break;
        case 'proceed':         this._handleProceed();                       break;
        case 'back-to-form':    this._showScreen('form');                    break;
        case 'pay':             this._handlePay();                           break;
        case 'retry':           this._handleRetry();                         break;
        case 'go-to-proof':     this._showScreen('proof');                   break;
        case 'back-to-receipt': this._showScreen('receipt');                 break;
        case 'submit-proof':    this._handleProofSubmit();                   break;
        case 'nav-history':     window.location.href = 'payment-history.html'; break;
        case 'nav-login':       window.location.href = 'login.html';         break;
      }
    });

    // Payment method radio cards - ADD NULL CHECK
    const radioCards = this._root.querySelectorAll('.payment-method-card input[type="radio"]');
    if (radioCards && radioCards.length) {
      radioCards.forEach((radio) => {
        radio.addEventListener('change', () => {
          this._selectedMethod = radio.value;
          this._root.querySelectorAll('.payment-method-card').forEach((card) => {
            card.classList.toggle('is-selected', card.dataset.method === radio.value);
          });
          this._updateBreakdown();
        });
      });
    }

    // Proof upload zone - ADD NULL CHECKS
    const zone = this._root.querySelector('#pm-upload-zone');
    const fileInput = this._root.querySelector('#pm-file-input');
    const removeBtn = this._root.querySelector('#pm-remove-file');

    if (zone) {
      zone.addEventListener('click', () => fileInput && fileInput.click());
      zone.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          fileInput && fileInput.click();
        }
      });
      zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('is-dragover'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('is-dragover'));
      zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('is-dragover');
        const file = e.dataTransfer?.files?.[0];
        if (file) this._handleFileSelected(file);
      });
    }

    if (fileInput) {
      fileInput.addEventListener('change', () => {
        const file = fileInput.files?.[0];
        if (file) this._handleFileSelected(file);
      });
    }

    if (removeBtn) {
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._clearFileSelection();
      });
    }
  }

  /* ── Screen Management ─────────────────────────────────────── */

  /**
   * Show a named screen and update the step indicator.
   * @param {'form'|'confirm'|'processing'|'receipt'|'failed'|'proof'} name
   */
  _showScreen(name) {
    this._root.querySelectorAll('.payment-screen').forEach((screen) => {
      const match = screen.id === `payment-screen-${name}`;
      screen.hidden = !match;
    });

    // Step indicator: map screen names to step index (0-based)
    const stepMap = { form: 0, confirm: 1, processing: 1, receipt: 2, failed: 2, proof: 2 };
    const activeIndex = stepMap[name] ?? 0;

    this._root.querySelectorAll('.payment-steps__item').forEach((item, i) => {
      item.classList.toggle('is-active', i === activeIndex);
      item.classList.toggle('is-done',   i < activeIndex);
    });

    // Update modal title
    const titles = {
      form:       '💳 Make Payment',
      confirm:    '✅ Review Payment',
      processing: '⏳ Processing…',
      receipt:    '🧾 Payment Receipt',
      failed:     '❌ Payment Failed',
      proof:      '📎 Upload Proof',
    };
    const titleEl = this._root.querySelector('#payment-modal-title');
    if (titleEl && titles[name]) titleEl.textContent = titles[name];

    this._currentScreen = name;
  }

  /* ── Form Screen (FIXED with null checks) ─────────────────── */

  _populateForm() {
    const { amount, groupName } = this._context;
    const base = parseFloat(amount) || 0;

    const amountDisplay = this._root.querySelector('#pm-amount-display');
    const groupDisplay = this._root.querySelector('#pm-group-display');
    const cardRadio = this._root.querySelector('input[value="card"]');
    const methodCards = this._root.querySelectorAll('.payment-method-card');

    if (amountDisplay) amountDisplay.textContent = `R ${base.toFixed(2)}`;
    if (groupDisplay) groupDisplay.textContent = groupName || '—';

    // Reset to card method
    this._selectedMethod = 'card';
    if (cardRadio) cardRadio.checked = true;
    if (methodCards) {
      methodCards.forEach((c) => {
        c.classList.toggle('is-selected', c.dataset.method === 'card');
      });
    }

    this._updateBreakdown();
    this._hideAlert('pm-form-error');
  }

  _updateBreakdown() {
    const base    = parseFloat(this._context?.amount) || 0;
    const feeRate = this._selectedMethod === 'card' ? CARD_FEE_RATE : 0;
    const fee     = base * feeRate;
    const total   = base + fee;

    const baseAmountEl = this._root.querySelector('#pm-base-amount');
    const feeAmountEl = this._root.querySelector('#pm-fee-amount');
    const totalAmountEl = this._root.querySelector('#pm-total-amount');
    const feeRow = this._root.querySelector('#pm-fee-row');

    if (baseAmountEl) baseAmountEl.textContent = `R ${base.toFixed(2)}`;
    if (feeAmountEl) feeAmountEl.textContent = `R ${fee.toFixed(2)}`;
    if (totalAmountEl) totalAmountEl.textContent = `R ${total.toFixed(2)}`;
    
    // Show fee row only for card payments
    if (feeRow) feeRow.style.display = feeRate > 0 ? '' : 'none';
  }

  /** Step 1 → Step 2: validate form then build the confirmation screen. */
  _handleProceed() {
    this._hideAlert('pm-form-error');
    if (!this._context) return;

    // Network pre-flight check
    if (!isNetworkAvailable()) {
      this._showAlert('pm-form-error', 'No internet connection. Please check your network and try again.');
      return;
    }

    // Context / amount validation
    const ctxResult = validatePaymentContext(this._context);
    if (!ctxResult.valid) {
      this._showAlert('pm-form-error', ctxResult.error);
      return;
    }

    // Payment method validation
    const methodResult = validatePaymentMethod(this._selectedMethod);
    if (!methodResult.valid) {
      this._showAlert('pm-form-error', methodResult.error);
      return;
    }

    const base    = parseFloat(this._context.amount) || 0;
    const feeRate = this._selectedMethod === 'card' ? CARD_FEE_RATE : 0;
    const fee     = base * feeRate;
    const total   = base + fee;

    const methodLabel = this._selectedMethod === 'card'
      ? 'Card (Visa / Mastercard)'
      : 'EFT (Bank transfer)';

    const rows = [
      { label: 'Group',            value: this._context.groupName || '—' },
      { label: 'Contribution',     value: `R ${base.toFixed(2)}` },
      { label: 'Payment method',   value: methodLabel },
      ...(fee > 0 ? [{ label: 'Processing fee (1.5%)', value: `R ${fee.toFixed(2)}` }] : []),
      { label: 'Total to pay',     value: `R ${total.toFixed(2)}`, bold: true },
    ];

    const list = this._root.querySelector('#pm-confirm-list');
    if (list) {
      list.innerHTML = rows
        .map(
          (r) =>
            `<li class="payment-confirm-list__item${r.bold ? ' is-total' : ''}">
               <span>${r.label}</span>
               <span>${r.value}</span>
             </li>`
        )
        .join('');
    }

    this._showScreen('confirm');
  }

  /* ── Pay Action ────────────────────────────────────────────── */

  async _handlePay() {
    const payBtn = this._root.querySelector('#pm-pay-btn');
    if (payBtn) {
      payBtn.disabled = true;
      payBtn.textContent = 'Authorising…';
    }
    this._hideAlert('pm-confirm-error');

    // Network pre-flight: fast-fail before showing processing screen
    if (!isNetworkAvailable()) {
      this._showAlert('pm-confirm-error', 'No internet connection. Please check your network and try again.');
      if (payBtn) {
        payBtn.disabled = false;
        payBtn.textContent = 'Pay Now';
      }
      return;
    }

    this._showScreen('processing');
    this._updateProcessingStatus('Initiating payment…', 'Please wait. Redirecting to PayFast…');

    try {
      const { userId, groupId, contributionId, amount, groupName } = this._context;
      const base    = parseFloat(amount) || 0;
      const feeRate = this._selectedMethod === 'card' ? CARD_FEE_RATE : 0;
      const total   = base + base * feeRate;

      // Get user info from Firebase if available
      let userEmail = '';
      let userName = '';
      try {
        const currentUser = auth.currentUser;
        if (currentUser) {
          userEmail = currentUser.email || '';
          userName = currentUser.displayName || '';
        }
      } catch (e) {
        console.log('Could not get user info:', e);
      }

      // Call backend API to initiate PayFast payment
      const result = await initiatePayment({
        amount: total,
        contributionId: contributionId,
        groupId: groupId,
        groupName: groupName,
        userEmail: userEmail,
        userName: userName,
        metadata: {
          paymentMethod: this._selectedMethod
        }
      });

      this._paymentId = result.paymentId;

      // Store payment ID in localStorage for return handling
      localStorage.setItem('pendingPaymentId', this._paymentId);

      // Redirect to PayFast using form submission
      this._redirectToPayFast(result.paymentData);

    } catch (err) {
      // Categorise the error and revert to confirm screen
      const info = categorizePaymentError(err, 'initiate');
      this._showScreen('confirm');
      this._showAlert('pm-confirm-error', info.message);
      if (payBtn) {
        payBtn.disabled = false;
        payBtn.textContent = 'Pay Now';
      }
    }
  }

  /**
   * Redirect to PayFast by creating and submitting a form
   * @param {Object} paymentData - Payment data from backend
   */
  _redirectToPayFast(paymentData) {
    // Create a hidden form
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
  }

  _handleRetry() {
    // Reset form state and go back to form screen
    this._paymentId = null;
    const payBtn = this._root.querySelector('#pm-pay-btn');
    if (payBtn) {
      payBtn.disabled = false;
      payBtn.textContent = 'Pay Now';
    }
    this._showScreen('form');
    this._populateForm();
  }

  /* ── Status Polling ────────────────────────────────────────── */

  _startPolling() {
    this._pollCount            = 0;
    this._consecutiveNetErrors = 0;
    this._pollPaused           = false;
    this._schedulePoll(POLL_INTERVAL_MS);
  }

  _schedulePoll(delayMs) {
    this._pollTimer = setTimeout(() => this._pollStatus(), delayMs);
  }

  _clearPoll() {
    if (this._pollTimer !== null) {
      clearTimeout(this._pollTimer);
      this._pollTimer = null;
    }
  }

  async _pollStatus() {
    // Do not poll when paused (device offline) or after the modal has been closed.
    if (this._pollPaused || !this._paymentId) return;

    this._pollCount += 1;

    if (this._pollCount > POLL_MAX_ATTEMPTS) {
      this._showFailed(null, categorizePaymentError(null, 'timeout'));
      return;
    }

    // Use a slower interval after the first POLL_SLOW_AFTER polls
    const nextInterval = this._pollCount > POLL_SLOW_AFTER
      ? POLL_SLOW_INTERVAL_MS
      : POLL_INTERVAL_MS;

    this._updateProcessingStatus(
      'Verifying payment…',
      this._pollCount <= 3
        ? 'Please wait. Do not close this window.'
        : `Checking with payment gateway… (${this._pollCount}/${POLL_MAX_ATTEMPTS})`
    );

    try {
      const statusData = await getPaymentStatus(this._paymentId);
      this._consecutiveNetErrors = 0; // reset on a successful request

      if (statusData.status === 'completed') {
        this._clearPoll();
        this._showReceipt(statusData);
      } else if (statusData.status === 'failed' || statusData.status === 'cancelled') {
        this._clearPoll();
        this._showFailed(null, categorizePaymentError(new Error('declined'), 'poll'));
      } else {
        // Still pending/processing — schedule the next check
        this._schedulePoll(nextInterval);
      }

    } catch (err) {
      this._consecutiveNetErrors += 1;
      console.warn('[PaymentModal] Poll error:', err.message);

      if (this._consecutiveNetErrors >= POLL_MAX_NET_ERRORS) {
        this._clearPoll();
        this._showFailed(null, categorizePaymentError(err, 'poll'));
        return;
      }

      // Exponential back-off capped at 2× POLL_SLOW_INTERVAL_MS
      const backoff = Math.min(
        POLL_INTERVAL_MS * Math.pow(2, this._consecutiveNetErrors),
        POLL_SLOW_INTERVAL_MS * 2
      );
      this._schedulePoll(backoff);
    }
  }

  /* ── Receipt Screen ────────────────────────────────────────── */

  _showReceipt(statusData) {
    const base    = parseFloat(this._context.amount) || 0;
    const feeRate = this._selectedMethod === 'card' ? CARD_FEE_RATE : 0;
    const fee     = base * feeRate;
    const total   = base + fee;
    const now     = new Date();

    const rows = [
      { label: 'Payment ID',    value: statusData.paymentId },
      { label: 'Transaction ID', value: statusData.transactionId || '—' },
      { label: 'Group',          value: this._context.groupName || '—' },
      { label: 'Amount paid',    value: `R ${total.toFixed(2)}` },
      { label: 'Payment method', value: this._selectedMethod === 'card' ? 'Card' : 'EFT' },
      {
        label: 'Status',
        value: '<span class="status-badge status-badge--completed">Completed</span>',
      },
      { label: 'Date',           value: now.toLocaleString('en-ZA') },
    ];

    const list = this._root.querySelector('#pm-receipt-list');
    if (list) {
      list.innerHTML = rows
        .map(
          (r) =>
            `<li class="payment-receipt__row">
               <span class="payment-receipt__row-label">${r.label}</span>
               <span class="payment-receipt__row-value">${r.value}</span>
             </li>`
        )
        .join('');
    }

    this._showScreen('receipt');

    // Fire the success callback
    if (typeof this.onPaymentSuccess === 'function') {
      this.onPaymentSuccess({
        paymentId:      statusData.paymentId,
        transactionId:  statusData.transactionId,
        amount:         total,
        currency:       'ZAR',
        method:         this._selectedMethod,
        groupId:        this._context.groupId,
        contributionId: this._context.contributionId,
        completedAt:    now,
      });
    }
  }

  /* ── Failed Screen ─────────────────────────────────────────── */

  _showFailed(reason, errorInfo = null) {
    const info = errorInfo || categorizePaymentError(
      reason ? new Error(reason) : null,
      'poll'
    );

    const titleEl   = this._root.querySelector('#pm-failed-title');
    const reasonEl  = this._root.querySelector('#pm-failed-reason');
    const stepsEl   = this._root.querySelector('#pm-failed-steps');
    const actionBtn = this._root.querySelector('#pm-failed-action-btn');

    if (titleEl)  titleEl.textContent  = info.title;
    if (reasonEl) reasonEl.textContent = info.message;

    if (stepsEl) {
      if (info.steps && info.steps.length) {
        stepsEl.innerHTML = info.steps.map(s => `<li>${s}</li>`).join('');
        stepsEl.hidden = false;
      } else {
        stepsEl.hidden = true;
      }
    }

    if (actionBtn) {
      actionBtn.textContent = info.actionLabel;
      if (!info.retryable) {
        actionBtn.dataset.action = info.actionLabel === 'Log In' ? 'nav-login' : 'nav-history';
      } else {
        actionBtn.dataset.action = 'retry';
      }
    }

    this._showScreen('failed');

    if (typeof this.onPaymentFailed === 'function') {
      this.onPaymentFailed(new Error(info.message));
    }
  }

  /* ── Proof Upload ──────────────────────────────────────────── */

  /**
   * Validate and preview a user-selected or dropped file.
   * @param {File} file
   */
  _handleFileSelected(file) {
    this._hideAlert('pm-proof-error');

    if (!ALLOWED_PROOF_TYPES.includes(file.type)) {
      this._showAlert('pm-proof-error', 'Invalid file type. Please upload a JPG, PNG, or PDF.');
      return;
    }
    if (file.size > MAX_PROOF_SIZE) {
      this._showAlert('pm-proof-error', `File is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Maximum size is 5 MB.`);
      return;
    }

    this._selectedFile = file;

    // Show preview
    const fileNameEl = this._root.querySelector('#pm-file-name');
    const fileSizeEl = this._root.querySelector('#pm-file-size');
    const previewEl = this._root.querySelector('#pm-upload-preview');
    const zoneEl = this._root.querySelector('#pm-upload-zone');
    
    if (fileNameEl) fileNameEl.textContent = file.name;
    if (fileSizeEl) fileSizeEl.textContent = `${(file.size / 1024).toFixed(1)} KB`;
    if (previewEl) previewEl.hidden = false;
    if (zoneEl) zoneEl.classList.add('has-file');

    // Enable submit button
    const submitBtn = this._root.querySelector('#pm-submit-proof-btn');
    if (submitBtn) submitBtn.disabled = false;
  }

  _clearFileSelection() {
    this._selectedFile = null;

    const previewEl = this._root.querySelector('#pm-upload-preview');
    const zoneEl = this._root.querySelector('#pm-upload-zone');
    const fileInput = this._root.querySelector('#pm-file-input');
    const submitBtn = this._root.querySelector('#pm-submit-proof-btn');

    if (previewEl) previewEl.hidden = true;
    if (zoneEl) zoneEl.classList.remove('has-file');
    if (fileInput) fileInput.value = '';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Upload Proof';
    }

    this._hideAlert('pm-proof-error');
    this._hideAlert('pm-proof-success');
  }

  async _handleProofSubmit() {
    if (!this._selectedFile) return;

    const submitBtn  = this._root.querySelector('#pm-submit-proof-btn');
    const progress   = this._root.querySelector('#pm-upload-progress');
    const progressBar = this._root.querySelector('#pm-progress-bar');

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Uploading…';
    }
    if (progress) progress.hidden = false;
    this._hideAlert('pm-proof-error');
    this._hideAlert('pm-proof-success');

    // Animate a fake progress bar while waiting for the real upload
    let pct = 0;
    const ticker = setInterval(() => {
      pct = Math.min(pct + 12, 85);
      if (progressBar) {
        progressBar.style.width = `${pct}%`;
        progressBar.setAttribute('aria-valuenow', String(pct));
      }
    }, 200);

    try {
      if (typeof this.onProofUploaded === 'function') {
        await this.onProofUploaded(this._selectedFile, this._paymentId);
      }

      clearInterval(ticker);
      if (progressBar) {
        progressBar.style.width = '100%';
        progressBar.setAttribute('aria-valuenow', '100');
      }

      await new Promise((r) => setTimeout(r, 400));

      if (progress) progress.hidden = true;
      if (progressBar) progressBar.style.width = '0%';
      if (submitBtn) submitBtn.textContent = '✓ Uploaded';

      this._showAlert('pm-proof-success', '✅ Proof uploaded successfully! Your treasurer will verify it shortly.');

    } catch (err) {
      clearInterval(ticker);
      if (progress) progress.hidden = true;
      if (progressBar) progressBar.style.width = '0%';
      if (progressBar) progressBar.setAttribute('aria-valuenow', '0');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Upload Proof';
      }
      this._showAlert('pm-proof-error', err.message || 'Upload failed. Please try again.');
    }
  }

  /* ── Network & Processing Status Helpers ──────────────────── */

  /**
   * Attach window online/offline listeners and apply the initial state.
   * Called once from the constructor after _inject().
   */
  _wireNetworkEvents() {
    window.addEventListener('online',  () => this._handleNetworkChange(true));
    window.addEventListener('offline', () => this._handleNetworkChange(false));
    // Apply initial state in case the page loaded while offline
    if (!navigator.onLine) this._handleNetworkChange(false);
  }

  /**
   * React to the browser going online or offline.
   * @param {boolean} isOnline
   */
  _handleNetworkChange(isOnline) {
    this._isOnline = isOnline;

    // Toggle the offline banner (only visible while the modal is open)
    const banner   = this._root && this._root.querySelector('#pm-offline-banner');
    if (banner) banner.hidden = isOnline;

    // Disable the "Proceed" button on the form screen while offline
    const proceedBtn = this._root && this._root.querySelector('[data-action="proceed"]');
    if (proceedBtn) proceedBtn.disabled = !isOnline;

    if (this._pollTimer !== null || this._pollPaused) {
      if (!isOnline) {
        // Pause polling — clear the pending timeout but keep _pollCount
        this._pollPaused = true;
        this._clearPoll();
        this._updateProcessingStatus(
          'Connection lost',
          'Payment verification is paused. We will resume automatically when you reconnect.'
        );
      } else {
        // Resume polling shortly after coming back online
        this._pollPaused = false;
        this._schedulePoll(800);
        this._updateProcessingStatus(
          'Verifying payment…',
          'Connection restored. Resuming verification…'
        );
      }
    }
  }

  /**
   * Update the title and sub-text on the processing screen.
   * @param {string} title
   * @param {string} [sub]
   */
  _updateProcessingStatus(title, sub = '') {
    const titleEl = this._root && this._root.querySelector('#pm-processing-title');
    const subEl   = this._root && this._root.querySelector('#pm-processing-sub');
    if (titleEl) titleEl.textContent = title;
    if (subEl)   subEl.textContent   = sub;
  }

  /* ── Alert Helpers ─────────────────────────────────────────── */

  /**
   * Show an error/info alert by element ID.
   * @param {string} id  - element ID without '#'
   * @param {string} msg - message text
   */
  _showAlert(id, msg) {
    const el = this._root.querySelector(`#${id}`);
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('payment-alert--hidden');
  }

  /** Hide an alert element. */
  _hideAlert(id) {
    const el = this._root.querySelector(`#${id}`);
    if (el) el.classList.add('payment-alert--hidden');
  }
}