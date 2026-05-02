Feature — Complete Reference

Sprint 3 · Developer B (Frontend)
Branch: `feature/payment-frontend` → merge target: `feature/payment-integration`

---

## Table of Contents

1. [Overview](#1-overview)
2. [Files Delivered](#2-files-delivered)
3. [Modal Flow (6 Screens)](#3-modal-flow-6-screens)
4. [Validation & Error Handling](#4-validation--error-handling)
5. [Offline Handling](#5-offline-handling)
6. [Status Polling](#6-status-polling)
7. [UX Features (Task 4)](#7-ux-features-task-4)
8. [Accessibility](#8-accessibility)
9. [Mobile Responsiveness](#9-mobile-responsiveness)
10. [Testing](#10-testing)
11. [Git Branch Strategy](#11-git-branch-strategy)
12. [Production Migration Notes](#12-production-migration-notes)

---

## 1. Overview

Members of a stokvel group can pay their monthly contributions directly from the
web app. Payments are processed via a mock gateway (Yoco-ready API contract),
status is confirmed by server polling, and records are written to Firestore on
success. The UI works fully offline-aware with graceful error categorisation at
every step.

---

## 2. Files Delivered

### New files

| File | Purpose |
|---|---|
| `frontend/payment.html` | Standalone payment page — entry point for dashboard/reminder links |
| `frontend/payment-history.html` | Transaction history — lists all payments, supports retry |
| `frontend/payment-proof.html` | Standalone proof-upload page |
| `frontend/components/payment-modal.js` | Core 6-screen payment modal (class `PaymentModal`) |
| `frontend/js/payment.js` | Page controller for `payment.html` |
| `frontend/js/payment-history.js` | History table controller |
| `frontend/js/payment-upload.js` | Firebase Storage proof-upload helper |
| `frontend/js/payment-api-mock.js` | Mock payment gateway (mirrors Developer A backend contract) |
| `frontend/js/payment-validator.js` | Validation + error categorisation utilities |
| `frontend/js/financial-health.js` | ML-based financial health scoring widget |
| `frontend/js/payment-reminders.js` | Smart payment reminder bar |
| `frontend/js/payment-receipt.js` | Receipt view and download controller |
| `frontend/css/payment.css` | All payment UI styles |
| `tests/payment-validator.test.js` | 35 unit tests — validator functions |
| `tests/payment-api-mock.test.js` | 44 unit tests — mock API functions |
| `tests/payment-ui.test.js` | 32 static-analysis tests — accessibility + CSS |

### Modified files

| File | Changes |
|---|---|
| `frontend/contributions-my.html` | Added `PaymentModal` integration + Pay Now buttons |
| `frontend/js/contributions.js` | Added `markContributionAsPaid(contributionId, transactionId)` |
| `frontend/dashboard.html` | Added financial health score widget |
| `frontend/payment.html` | Added payment reminder bar |

---

## 3. Modal Flow (6 Screens)

```
[Form] ──► [Confirm] ──► [Processing] ──► [Receipt ✅]
                                      └──► [Failed ❌]
                                               │
                               ┌───────────────┴──────────────┐
                           retryable                      not retryable
                         [Retry → Confirm]         [View History | Log In]

[Receipt] ──► [Proof Upload] (optional)
```

### Screen 1 — Form

- Displays: amount due, group name, contribution period
- User selects payment method: **Card** or **EFT**
- Card payments show 1.5% processing fee in a live breakdown
- Validations run before Proceed (no page reload):
  - All context fields present (userId, groupId, contributionId, amount)
  - Amount > 0 and ≤ R 1,000,000
  - Payment method selected
  - Network available — offline banner shown if disconnected, button disabled
- CTA: **Proceed**

### Screen 2 — Confirm

- Summary list: Group · Contribution · Method · Fee (card only) · **Total**
- Network re-checked on Pay Now tap
- CTA: **Pay Now** · back returns to Form

### Screen 3 — Processing

- Spinner with live status text updated on every poll cycle
- Offline banner activates automatically on disconnect
- Polling pauses; resumes automatically within 800 ms of reconnect
- Example status messages:
  - *"Initiating payment… Please wait."*
  - *"Verifying with payment gateway… (6/20)"*
  - *"Connection lost. Verification paused."*
  - *"Connection restored. Resuming verification…"*

### Screen 4 — Receipt

Shows: Payment ID · Transaction ID · Group · Amount · Method · Status badge · Date/Time

- Optional → **Upload Proof of Payment** (Screen 6)
- **Done** closes the modal and refreshes the contributions list
- Fires `onPaymentSuccess` callback → `markContributionAsPaid()` writes to Firestore

### Screen 5 — Failed

- Categorised error title, human-readable message, and ordered recovery steps
- Primary action button label and route change per error type

| Category | Example trigger | Retryable | Button |
|---|---|---|---|
| Connection Problem | `navigator.onLine === false` or fetch error | Yes | Retry |
| Payment Declined | Bank decline / insufficient funds | Yes | Try Again |
| Session Expired | Auth / permission error | No | Log In |
| Verification Timed Out | Polling exceeded 20 attempts | No | View History |
| Payment Failed | Generic gateway error | Yes | Retry |

### Screen 6 — Proof Upload (optional)

- Drag-and-drop or file picker
- Accepted: JPG, PNG, PDF · max 5 MB
- Preview before upload; progress bar during Firebase Storage upload
- Fires `onProofUploaded` callback → writes proof document to Firestore
- CTA: **Upload Proof** · back to Receipt

---

## 4. Validation & Error Handling

All validation lives in `frontend/js/payment-validator.js` — pure functions with no
DOM access so they can be unit tested in Node without a browser.

### `validatePaymentContext(ctx)`
Checks `userId`, `groupId`, `contributionId`, `amount > 0`, `amount ≤ 1,000,000`.
Returns `{ valid: boolean, error: string | null }`.

### `validatePaymentMethod(method)`
Accepts `'card'` or `'eft'` only (case-sensitive).
Returns `{ valid: boolean, error: string | null }`.

### `isNetworkAvailable()`
Returns `navigator.onLine !== false` — fast pre-flight before any API call.

### `categorizePaymentError(err, context)`
Maps any raw Error to a structured `PaymentErrorInfo` object:

```js
{
  title:       string,   // short heading shown in the failed screen
  message:     string,   // full explanation
  steps:       string[], // ordered recovery instructions
  retryable:   boolean,  // determines button behaviour
  actionLabel: string,   // label for the primary action button
}
```

Contexts: `'initiate'` | `'poll'` | `'timeout'`

---

## 5. Offline Handling

An amber banner (`#pm-offline-banner`) sits above the modal header and is managed
by `_wireNetworkEvents()` on the `PaymentModal` class:

```
📡 No internet connection. Your payment is paused until you're back online.
```

Behaviour:
- Banner shows/hides automatically via `window` `online` / `offline` events
- **Proceed** button is disabled while offline (prevents wasted initiation calls)
- Polling is paused when offline (`_pollPaused = true`); the pending `setTimeout` is
  cleared but `_pollCount` is preserved
- On reconnect: `_schedulePoll(800)` resumes from where it left off

---

## 6. Status Polling

Polling uses `setTimeout`-based scheduling (not `setInterval`) so each interval can
adapt without accumulating drift.

| Phase | Interval | Notes |
|---|---|---|
| Polls 1–5 | 2 s | Fast initial check |
| Polls 6–20 | 5 s | Reduced frequency once likely pending |
| Network error | Exponential back-off — 2 s → 4 s → 8 s, capped at 10 s | Up to 3 consecutive errors |
| 3 consecutive errors | Abort → show "Connection Problem" error | — |
| 20 polls without confirmation | Abort → show "Verification Timed Out" error | — |

Constants (in `payment-modal.js`):

```js
const POLL_INTERVAL_MS      = 2000;   // fast phase
const POLL_SLOW_INTERVAL_MS = 5000;   // slow phase
const POLL_SLOW_AFTER       = 5;      // switch at poll #6
const POLL_MAX_ATTEMPTS     = 20;     // timeout threshold
const POLL_MAX_NET_ERRORS   = 3;      // consecutive error limit
```

---

## 7. UX Features (Task 4)

### Financial Health Score (`financial-health.js`)

A **normalised weighted linear model** that scores each member's financial health
(0 – 100) from their contribution history and group engagement patterns.
The model version is `1.0.0` and can be retrained without a code deploy by
updating the `MODEL_WEIGHTS` config object (e.g. from a backend config endpoint).

#### Model formula

```
S = Σ(wᵢ · fᵢ) × 100      range [0, 100]
```

Each feature fᵢ is independently normalised to `[0, 1]` before weighting.

#### Feature vector

| Feature | Weight | What it measures |
|---|---|---|
| `paymentConsistency` | **0.30** | Ratio of on-time confirmed payments to total contributions |
| `amountCompliance` | **0.20** | Ratio of payments where the full due amount was paid |
| `paymentStreak` | **0.20** | Consecutive on-time months, normalised — saturates at 12 months |
| `recoverySpeed` | **0.15** | How quickly late payments are recovered; `avg days late / 30` inverted |
| `engagementScore` | **0.10** | Meeting attendance ratio (attended / total meetings) |
| `accountMaturity` | **0.05** | Days since joining the group, normalised — saturates at 365 days |

> Weights sum to **1.0**. `paymentConsistency` carries the highest weight because
> consistent on-time payment is the primary obligation of a stokvel member.

#### Score bands

| Band | Range | Colour | Advice surfaced to the member |
|---|---|---|---|
| Excellent | 80 – 100 | 🟢 Green | "Outstanding financial discipline! You are a model member." |
| Good | 60 – 79 | 🟢 Light green | "Good payment habits. Keep it up to reach Excellent." |
| Fair | 40 – 59 | 🟡 Yellow | "Room for improvement. Focus on paying on time each month." |
| At Risk | 20 – 39 | 🟠 Orange | "Payment history shows gaps. Contact your treasurer for a plan." |
| Poor | 0 – 19 | 🔴 Red | "Urgent: multiple missed payments detected. Immediate action needed." |

#### Recommendation engine

`generateRecommendations(features, meta)` produces up to **3 personalised tips**:

| Trigger condition | Tip shown |
|---|---|
| `paymentConsistency < 0.70` | Set up a monthly reminder; shows missed-count |
| `amountCompliance < 0.80` | Confirm the exact contribution amount with treasurer |
| `paymentStreak < 0.25` (streak < 3 months) | Aim for 3+ consecutive on-time payments |
| `recoverySpeed < 0.60` | Catch up within 7 days of a missed due date |
| `engagementScore < 0.50` | Attend the next scheduled group meeting |

#### Firestore integration

Full pipeline in `computeAndStoreHealthScore(userId, groupId)`:

1. Fetches all `contributions` documents for the member in the group
2. Fetches all `meetings` documents and resolves the member's attendance per meeting
3. Reads `groups/{groupId}/members/{userId}` to calculate `memberAgeDays`
4. Runs `extractFeatures()` → `computeScore()` → `classifyScore()`
5. Persists the full result to `users/{userId}/healthScores/{groupId}`:

```js
{
  userId, groupId,
  score,               // e.g. 73.5
  band,                // e.g. "Good"
  features,            // normalised feature vector
  meta,                // { total, onTime, missed, late, streak }
  recommendations,     // string[]
  modelVersion: '1.0.0',
  computedAt: serverTimestamp(),
}
```

`getHealthScore(userId, groupId)` reads the cached result first; only recomputes
if no stored score exists (avoiding redundant Firestore reads on repeated visits).

#### Exported API

| Function | Returns | Purpose |
|---|---|---|
| `extractFeatures(contributions, meetings, memberAgeDays)` | `{ features, meta }` | Normalises raw Firestore data into the feature vector |
| `computeScore(features)` | `number` (0–100) | Applies `MODEL_WEIGHTS` to produce the weighted score |
| `classifyScore(score)` | `HEALTH_BANDS` entry | Maps a numeric score to its band label, colour, and advice |
| `generateRecommendations(features, meta)` | `string[]` (max 3) | Produces personalised improvement tips |
| `computeAndStoreHealthScore(userId, groupId)` | `Promise<result>` | Full pipeline: fetch → score → persist → return |
| `getHealthScore(userId, groupId)` | `Promise<result>` | Cached read with recompute fallback |
| `buildHealthScoreHTML(result)` | `string` (HTML) | Builds the widget markup for injection into the page |

#### Widget UI

- Embedded in `dashboard.html` and `payment.html`
- SVG ring gauge (r = 36) with animated `stroke-dashoffset` transition
- Five feature progress bars colour-coded: green ≥ 70 % · amber 40–69 % · red < 40 %
- Score number overlaid in the centre of the SVG gauge
- Personalised tips rendered below the feature bars
- CSS classes: `.health-score-widget`, `.health-score-gauge`, `.health-score-gauge__label`,
  `.health-feature__bar-wrap`, `.health-feature__bar`, `.health-tips`, `.health-tip`

### Payment Reminders (`payment-reminders.js`)

Smart reminder bar that surfaces due/overdue contributions.

- Injected into `payment.html`
- Dismissible per session; respects quiet hours
- Urgency tiers: overdue (red) · due today (amber) · upcoming (blue)

### Payment Receipt (`payment-receipt.js`)

- Full receipt view linked from the payment history table
- Download as PDF or share via Web Share API

---

## 8. Accessibility

All accessibility attributes are verified by automated tests in `tests/payment-ui.test.js`.

| Element | Attribute |
|---|---|
| Modal overlay | `role="dialog"`, `aria-modal="true"`, `aria-labelledby="payment-modal-title"` |
| Step indicator | `role="list"` + `role="listitem"` on each step |
| Amount display | `aria-live="polite"` — updates announced to screen readers |
| Form / confirm error alerts | `aria-live="assertive"` — errors announced immediately |
| Processing screen | `aria-live="polite"` — status updates announced |
| Failed screen | `aria-live="assertive"` — failure announced immediately |
| Offline banner | `role="alert"`, `aria-live="assertive"` |
| Close button | `aria-label="Close payment modal"` |
| File upload zone | `tabindex="0"` + Enter / Space keyboard handler |
| Payment method options | `aria-labelledby="pm-method-label"` |
| File input | `aria-label="Choose payment proof file"` |

Keyboard: Escape key closes the modal from any screen.

### Manual Accessibility Checklist (perform in browser)

- [ ] All interactive controls have visible `:focus` rings
- [ ] Error messages are announced by screen reader (NVDA / VoiceOver)
- [ ] Offline banner fires immediately when device goes offline
- [ ] Tab order is logical: Form → Confirm → Processing
- [ ] Keyboard navigation completes the full 6-screen flow without mouse

---

## 9. Mobile Responsiveness

Breakpoints in `payment.css`:

| Breakpoint | Rule | Effect |
|---|---|---|
| `max-width: 520px` | `.payment-modal` | Snap to bottom of screen (bottom sheet pattern) |
| `max-width: 520px` | `.payment-overlay` | `align-items: flex-end`, `padding: 0` |
| `max-width: 360px` | Various | Tighter spacing for very small devices |

All layout values use relative units (`rem`, `%`, `vw`, `vh`). The modal has a
`max-width` cap so it never stretches to an unreadable width on tablet.

### Manual Mobile Checklist (DevTools or real device)

- [ ] Modal fills viewport with no horizontal scroll at 375 px width
- [ ] Step indicator wraps gracefully on narrow screens
- [ ] Buttons meet 44 px minimum touch-target height
- [ ] Recovery-steps list is readable without zooming
- [ ] Offline banner text does not overflow

---

## 10. Testing

### Running the tests

```bash
# All tests in the project
npm test

# Payment tests only
npx jest --testPathPatterns="payment"

# Payment tests with full per-test output
npx jest --testPathPatterns="payment" --verbose

# Watch mode during development
npx jest --testPathPatterns="payment" --watch
```

### Test results — latest run (2 May 2026)

```
Test Suites: 3 passed, 3 total
Tests:       111 passed, 111 passed, 0 skipped, 0 failed
Time:        ~16.5 s
```

---

### Test suite 1 — `tests/payment-validator.test.js`

**Purpose:** Unit tests for `frontend/js/payment-validator.js` — all pure functions,
no DOM, no network. Uses Node's `vm` module to run the ESM source in a controlled sandbox.

**Total: 35 tests**

#### `validatePaymentContext()` — 13 tests

| Test | Asserts |
|---|---|
| Complete, well-formed context | `{ valid: true, error: null }` |
| String amount that parses to a number | Accepts `'250.50'` |
| Amount exactly at the maximum | Accepts `1_000_000` |
| Null context | `valid: false`, error matches `/context is missing/i` |
| Undefined context | `valid: false` |
| Missing `userId` (empty string) | `valid: false`, error matches `/authentication/i` |
| Falsy `userId` (null) | `valid: false` |
| Missing `groupId` | `valid: false`, error matches `/group/i` |
| Missing `contributionId` | `valid: false`, error matches `/contribution/i` |
| Amount of 0 | `valid: false`, error matches `/greater than zero/i` |
| Negative amount | `valid: false` |
| Non-numeric string amount | `valid: false` |
| Amount above R 1,000,000 | `valid: false`, error matches `/maximum/i` |

#### `validatePaymentMethod()` — 7 tests

| Test | Asserts |
|---|---|
| Accepts `'card'` | `{ valid: true, error: null }` |
| Accepts `'eft'` | `{ valid: true, error: null }` |
| Rejects empty string | `valid: false`, error matches `/select a payment method/i` |
| Rejects uppercase `'CARD'` | `valid: false` (case-sensitive) |
| Rejects unknown method | `valid: false` |
| Rejects null | `valid: false` |
| Rejects undefined | `valid: false` |

#### `isNetworkAvailable()` — 2 tests

| Test | Asserts |
|---|---|
| `navigator.onLine = true` | Returns `true` |
| `navigator.onLine = false` | Returns `false` |

#### `categorizePaymentError()` — 16 tests

| Test | Asserts |
|---|---|
| Return-value shape | All 5 keys present (`title`, `message`, `steps[]`, `retryable`, `actionLabel`) |
| `context: 'timeout'` | Title: "Verification Timed Out", `retryable: false`, `actionLabel: 'View History'`, steps not empty |
| Browser offline | Title: "Connection Problem", `retryable: true`, `actionLabel: 'Retry'` |
| `"NetworkError …"` message | Title: "Connection Problem" |
| `"Failed to fetch"` message | Title: "Connection Problem" |
| `"Request timeout exceeded"` message | Title: "Connection Problem", steps mention Wi-Fi |
| `"not authenticated"` message | Title: "Session Expired", `retryable: false`, `actionLabel: 'Log In'` |
| `"Permission denied"` | Title: "Session Expired" |
| `"403 Forbidden"` | Title: "Session Expired" |
| `"Card declined by issuer"` | Title: "Payment Declined", `retryable: true` |
| `"Insufficient funds"` | Title: "Payment Declined" |
| `"Limit exceeded"` | Title: "Payment Declined" |
| `context: 'poll'` generic error | Title: "Payment Declined" |
| Unknown error string | Title: "Payment Failed", `retryable: true` |
| Null error with `'initiate'` context | Title: "Payment Failed", steps not empty |
| Raw error message in generic fallback | `message` contains the original error text |

---

### Test suite 2 — `tests/payment-api-mock.test.js`

**Purpose:** Unit tests for `frontend/js/payment-api-mock.js` — the mock backend that
mirrors Developer A's API contract. Tests run with real async timers (simulation delays
set to 10 ms in the timer tests).

**Total: 20 tests**

#### `initiatePayment()` — 11 tests

| Test | Asserts |
|---|---|
| Resolves with a `paymentId` string | Non-empty string |
| Resolves with a `checkoutUrl` string | String present |
| Resolves with a future `expiresAt` | Timestamp > `Date.now()` before call |
| Returns unique IDs on successive calls | Two calls produce different `paymentId` values |
| Throws when `userId` is missing | Rejects with `/missing required/i` |
| Throws when `groupId` is missing (null) | Rejects with `/missing required/i` |
| Throws when `contributionId` is missing | Rejects with `/missing required/i` |
| Throws when `amount` is 0 | Rejects with `/positive number/i` |
| Throws when `amount` is negative | Rejects with `/positive number/i` |
| Throws when `amount` is a string | Rejects with `/positive number/i` (type guard) |
| Defaults `currency` to `'ZAR'` | Resolves without throwing when currency omitted |

#### `getPaymentStatus()` — 4 tests

| Test | Asserts |
|---|---|
| Returns `'pending'` immediately after initiation | `status === 'pending'` |
| Returns full status object shape | Has `paymentId`, `status`, `amount`, `transactionId`, `updatedAt` |
| `transactionId` is null for a pending payment | `null` before success simulation |
| Throws for unknown `paymentId` | Rejects with `/not found/i` |

#### `simulatePaymentSuccess()` — 3 tests

| Test | Asserts |
|---|---|
| Transitions status to `'completed'` after delay | `status === 'completed'` after `wait(50)` |
| Sets a non-null `transactionId` after success | String, not null |
| Unknown `paymentId` does nothing | Does not throw |

#### `simulatePaymentFailure()` — 2 tests

| Test | Asserts |
|---|---|
| Transitions status to `'failed'` after delay | `status === 'failed'` |
| Status remains `'pending'` before any failure is scheduled | Initial state check |

---

### Test suite 3 — `tests/payment-ui.test.js`

**Purpose:** Static analysis tests for `frontend/components/payment-modal.js` (template
HTML) and `frontend/css/payment.css`. No browser or DOM required — tests read the file
source as a string and assert the presence of required attributes, IDs, and CSS rules.

**Total: 52 tests**

#### ARIA Roles & Semantics — 7 tests

| Test | Checks |
|---|---|
| `role="dialog"` on overlay | Present in template |
| `aria-modal="true"` | Present |
| `aria-labelledby="payment-modal-title"` + matching `id` | Both present |
| `role="list"` on step indicator | Present |
| `role="listitem"` on step items | Present |
| `aria-labelledby="pm-method-label"` on radio group | Present |
| `aria-label="Choose payment proof file"` on file input | Present |

#### ARIA Live Regions — 6 tests

| Test | Checks |
|---|---|
| `#pm-amount-display` has `aria-live="polite"` | Present |
| `#pm-form-error` has `aria-live="assertive"` | Present in surrounding HTML |
| `#pm-confirm-error` has `aria-live="assertive"` | Present |
| Processing screen has `aria-live` | Present |
| Failed screen has `aria-live="assertive"` | Present |
| Offline banner has `role="alert"` + `aria-live="assertive"` | Both present |

#### Close Button & Keyboard Accessibility — 5 tests

| Test | Checks |
|---|---|
| Close button has `aria-label="Close payment modal"` | Present |
| Close button is a `<button>` element | Keyboard focusable by default |
| Escape key handler wired | `e.key === 'Escape'` + `this.close()` in source |
| Proof upload zone has `tabindex="0"` | Present |
| Upload zone handles Enter + Space | Both key literals present |

#### Required Element IDs — 17 tests

All IDs that the JavaScript references via `querySelector` are asserted to exist
in the template:

`pm-amount-display` · `pm-group-display` · `pm-confirm-list` · `pm-pay-btn` ·
`pm-form-error` · `pm-confirm-error` · `pm-processing-title` · `pm-processing-sub` ·
`pm-receipt-list` · `pm-failed-title` · `pm-failed-reason` · `pm-failed-steps` ·
`pm-failed-action-btn` · `pm-upload-proof-btn` · `pm-upload-zone` · `pm-file-input` ·
`pm-offline-banner`

#### All 6 Screens Present — 7 tests

`payment-screen-form` · `payment-screen-confirm` · `payment-screen-processing` ·
`payment-screen-receipt` · `payment-screen-failed` · `payment-screen-proof` ·
+ every screen has an `aria-label`

#### Mobile CSS — 6 tests

| Test | Checks |
|---|---|
| At least one `@media max-width` query | Present |
| `520px` breakpoint exists | Present |
| `520px` breakpoint targets the modal | Present |
| Bottom-sheet breakpoint sets `align-items: flex-end` | Present inside `@media (max-width: 520px)` |
| Responsive length units used | `rem`, `%`, `vw`, or `vh` found in layout rules |
| `max-width` cap on modal container | Present |

#### Offline Banner CSS — 3 tests

| Test | Checks |
|---|---|
| `.payment-offline-banner` rule defined | Present |
| Amber background colour `#fef3c7` | Present in rule |
| `[hidden]` override hides banner by default | `.payment-offline-banner[hidden]` present |

#### Failed Screen Recovery Steps CSS — 2 tests

| Test | Checks |
|---|---|
| `.payment-failed__steps` rule defined | Present |
| `li` items have a styled marker | `::before` pseudo-element present |

---

### Code Coverage

The test suite uses Node's `vm` sandbox approach (same as `tests/sa-data.test.js`) to
execute the source files directly, rather than importing them. This achieves full
functional coverage of every exported function with no build step required.

| Source file | Functions exported | Test coverage |
|---|---|---|
| `frontend/js/payment-validator.js` | 4 / 4 | ✅ 100% of exported functions |
| `frontend/js/payment-api-mock.js` | 5 / 5 | ✅ 100% of exported functions |
| `frontend/components/payment-modal.js` | Template HTML + CSS | ✅ All IDs, all ARIA attrs, all screens |
| `frontend/css/payment.css` | Responsive + component CSS | ✅ Media queries, offline banner, error steps |

> **Note:** Jest code coverage (`--coverage` flag) is not configured for this project
> because the source files use browser ESM (CDN imports) incompatible with Jest's
> default transformer. The `vm`-sandbox approach provides equivalent functional
> coverage without needing Babel or a bundler.

---

## 11. Git Branch Strategy

```
main
 └─ Sindy-Sprint3  (Developer B working branch)
       ├─ feature/payment-frontend    ← all Sprint 3 frontend work (pushed ✅)
       └─ feature/payment-integration ← staging branch for A+B merge (pushed ✅)
```

### Workflow

1. Developer A merges `feature/payment-backend` → `feature/payment-integration`
2. Developer B merges `feature/payment-frontend` → `feature/payment-integration`
3. Full integration tests run on `feature/payment-integration`
4. Final PR: `feature/payment-integration` → `main`

### Running tests on the integration branch

```bash
git checkout feature/payment-integration
npm install
npm test
```

---

## 12. Production Migration Notes

- Replace `simulatePaymentSuccess()` with a real Yoco checkout redirect
- Replace mock `getPaymentStatus()` with a backend endpoint that queries the Yoco Events API
- Replace `payment-api-mock.js` entirely — the exported function signatures are
  identical to what the real module should export, so `payment-modal.js` needs no changes
- `navigator.onLine` is a fast pre-check only; the real connectivity confirmation
  always comes from the API response
- Firebase Storage upload in `payment-upload.js` is already wired to real Firebase —
  no mock to replace there

- The online/offline detection via `navigator.onLine` is a fast pre-check only. The real confirmation is always the API response.
