# Payment User Flow

Sprint 3 — Developer B Frontend

---

## Overview

The payment feature allows stokvel group members to pay their monthly contributions
directly from the web app. Payments are processed via a mock gateway (Yoco-ready),
confirmed through status polling, and recorded in Firestore.

---

## Entry Points

| Page | How a member reaches payment |
|---|---|
| **My Contributions** (`contributions-my.html`) | Click "Pay Now" on any pending contribution row |
| **Payment page** (`payment.html`) | Direct navigation from the dashboard or reminders |
| **Payment History** (`payment-history.html`) | View past transactions; retry a failed payment |

---

## Modal Flow (6 Screens)

```
[Form] → [Confirm] → [Processing] → [Receipt ✅]
                                  → [Failed ❌]
                                        ↓
                            [Retry → Confirm] or
                            [View History / Log In]
                            
[Receipt] → [Proof Upload] (optional)
```

### Screen 1 — Form (Payment Details)

- Displays: Amount due, group name, contribution period
- User selects payment method: **Card** or **EFT**
- Card payments show a 1.5% processing fee
- Validations (all inline, no page reload):
  - Payment context present (userId, groupId, contributionId, amount)
  - Amount > 0 and ≤ R 1,000,000
  - Payment method selected
  - Network available (offline banner shown if not connected)
- CTA: **Proceed**

### Screen 2 — Confirm

- Shows a summary list: Group, Contribution, Method, Fee (if card), Total
- User reviews before committing funds
- Network checked again on submit
- CTA: **Pay Now** · back link returns to Form

### Screen 3 — Processing

- Spinner with live status text updated during polling
- Offline banner appears automatically if device loses connectivity
- Polling pauses when offline; resumes within 800 ms of reconnection
- Status text examples:
  - *"Initiating payment… Please wait."*
  - *"Verifying with payment gateway… (3/20)"*
  - *"Connection lost. Verification paused."*
  - *"Connection restored. Resuming verification…"*

### Screen 4 — Receipt (Success)

- Shows: Payment ID, Transaction ID, Group, Amount, Method, Status badge, Date/Time
- Optional: **Upload Proof of Payment** (goes to Screen 6)
- CTA: **Done** (closes modal, refreshes contribution list)
- Fires `onPaymentSuccess` callback → calls `markContributionAsPaid()` in Firestore

### Screen 5 — Failed

- Shows categorised error title, human-readable message, and recovery steps
- Error categories:

  | Category | Example trigger | Retryable | Action |
  |---|---|---|---|
  | Connection Problem | `navigator.onLine === false` | Yes | Retry |
  | Payment Declined | Bank decline / insufficient funds | Yes | Try Again |
  | Session Expired | Auth/permission error | No | Log In |
  | Verification Timed Out | Polling exceeded 20 attempts | No | View History |
  | Payment Failed | Generic API error | Yes | Retry |

- Recovery steps are shown as a bulleted list beneath the error message
- Non-retryable errors navigate away (History or Login) instead of retrying

### Screen 6 — Proof Upload (Optional)

- Drag-and-drop or file-picker (JPG, PNG, PDF · max 5 MB)
- Preview shown before upload
- Progress bar during Firebase Storage upload
- Fires `onProofUploaded` callback → writes proof document to Firestore
- CTA: **Upload Proof** · back to Receipt

---

## Offline Handling

An amber banner is injected above the modal header:

> 📡 No internet connection. Your payment is paused until you're back online.

This banner:
- Appears/disappears automatically via `window` `online`/`offline` events
- Disables the **Proceed** button on the Form screen
- Pauses status polling on the Processing screen (no retries wasted)
- Resumes polling automatically on reconnect

---

## Status Polling

| Phase | Interval | Behaviour |
|---|---|---|
| First 5 polls | 2 s | Fast initial check |
| Polls 6–20 | 5 s | Slow down to reduce API load |
| Network error | Exponential back-off (capped at 10 s) | Up to 3 consecutive errors |
| 3 consecutive errors | — | Show "Connection Problem" failure |
| 20 polls reached (timeout) | — | Show "Verification Timed Out" failure |

---

## Key Files

| File | Role |
|---|---|
| `frontend/payment.html` | Standalone payment page |
| `frontend/payment-history.html` | Transaction history page |
| `frontend/payment-proof.html` | Proof upload page |
| `frontend/contributions-my.html` | My contributions with Pay Now buttons |
| `frontend/components/payment-modal.js` | 6-screen modal component (class `PaymentModal`) |
| `frontend/js/payment.js` | Page controller for `payment.html` |
| `frontend/js/payment-history.js` | History table controller |
| `frontend/js/payment-upload.js` | Firebase Storage proof upload helper |
| `frontend/js/payment-validator.js` | Validation + error categorisation utilities |
| `frontend/js/payment-api-mock.js` | Mock payment gateway (Yoco-ready) |
| `frontend/js/contributions.js` | Firestore helper: `markContributionAsPaid()` |
| `frontend/css/payment.css` | All payment UI styles (modal, receipt, offline banner, error steps) |

---

## Firestore Updates on Success

When `onPaymentSuccess` fires, `markContributionAsPaid(contributionId, transactionId)` updates the contribution document:

```js
{
  status:        'confirmed',
  transactionId: '<from gateway>',
  paidAt:        serverTimestamp(),
}
```

---

## Future / Production Notes

- Replace `simulatePaymentSuccess()` with a real Yoco checkout redirect.
- Replace mock `getPaymentStatus()` with a backend endpoint that queries the Yoco API.
- Replace `payment-api-mock.js` entirely; keep the same function signatures so `payment-modal.js` needs no changes.
- The online/offline detection via `navigator.onLine` is a fast pre-check only. The real confirmation is always the API response.
