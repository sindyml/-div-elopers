## Payment Gateway Implementation Breakdown

### 1. Frontend

#### Pages / UI
- payment.html
- payment-history.html
- payment-return.html

#### Key frontend code
- payment.js
- payment-history.js
- payment-modal.js
- payment-return.html

#### What the user clicks
- On payment.html or payment-history.html, the user clicks the button:
  - `#make-payment-btn`
- That click is wired to:
  - `initiatePayFastRedirect(user)`

#### What happens next
1. The frontend loads the current user and pending contributions from Firestore.
2. It finds the first pending/missed contribution for the user.
3. It builds a request payload with:
   - `amount`
   - `contributionId`
   - `groupId`
   - `groupName`
   - `userEmail`
   - `userName`
   - `metadata.paymentMethod`
4. It gets the Firebase ID token and sends:
   - `POST /api/payments/initiate`

#### Redirect to PayFast
- Backend returns `paymentData` including `paymentUrl`
- Frontend builds a hidden HTML form
- It submits the form to PayFast:
  - `form.action = paymentData.paymentUrl`
  - `form.submit()`

This is the actual gateway handoff.

---

### 2. Backend

#### Main backend route
- index.js

#### Routing
The backend handles:
- `POST /api/payments/initiate`
- `POST /api/payments/notify`
- `GET /api/payments/return`
- `GET /api/payments/cancel`
- `GET /api/payments/status/:paymentId`
- `POST /api/payments/verify`
- `GET /api/payments/history/:userId`

#### Initiate payment
- `initiatePayment(req, res)`
- Creates a Firestore document in `transactions`
- Builds PayFast URLs:
  - `return_url`
  - `cancel_url`
  - `notify_url`
- Uses payfastService.js to create signed PayFast payload
- Returns:
  - `paymentId`
  - `paymentData`
  - `message`

#### ITN / webhook handling
- `handleNotify(req, res)`
- Called by PayFast when payment status changes
- Uses `payfastService.processITN(req.body)` to:
  - validate signature
  - validate payload with PayFast server
  - parse `payment_status`
- Updates Firestore transaction record
- If completed, also updates the linked contribution document:
  - `status: 'confirmed'`
  - `paidAt`
  - `transactionId`
- Logs webhook event to `webhookEvents`

#### Status endpoint
- `getPaymentStatus(req, res)`
- Returns the transaction status for a given `paymentId`
- Used by frontend on the return page to verify final result

---

### 3. PayFast integration details

#### PayFast helper service
- payfastService.js

What it does:
- reads PayFast credentials from environment:
  - `PAYFAST_MERCHANT_ID`
  - `PAYFAST_MERCHANT_KEY`
  - `PAYFAST_PASSPHRASE`
- chooses sandbox vs production URL based on `NODE_ENV`
- generates PayFast request signature
- formats the payload for:
  - `merchant_id`
  - `merchant_key`
  - `return_url`
  - `cancel_url`
  - `notify_url`
  - `name_first`, `name_last`
  - `email_address`
  - `m_payment_id`
  - `amount`
  - `item_name`
  - `item_description`
  - `custom_str1` (user ID)
- verifies ITN signature and validates ITN with PayFast
- normalizes payment status values

#### Environment configuration
From .env.example:
- `PAYFAST_MERCHANT_ID`
- `PAYFAST_MERCHANT_KEY`
- `PAYFAST_PASSPHRASE`
- `PAYFAST_SANDBOX`

---

### 4. End-to-end flow

1. User authenticates in the app.
2. User clicks `Make a Payment`.
3. Frontend finds a pending contribution and calls backend:
   - `POST /api/payments/initiate`
4. Backend creates a transaction record and generates signed PayFast payload.
5. Frontend submits a hidden POST form to PayFast.
6. User completes payment on PayFast’s site.
7. PayFast sends an ITN to backend:
   - `POST /api/payments/notify`
8. Backend verifies the ITN and updates Firestore:
   - transaction `status`
   - `contribution.status` if payment completed
9. PayFast redirects the user to:
   - `payment-return.html?paymentId=...`
   - or `payment-cancel.html?paymentId=...`
10. The frontend return page polls:
    - `GET /api/payments/status/:paymentId`
11. The user sees final payment result:
    - success
    - failure
    - cancelled

---

### 5. User-visible pages in the flow

- payment.html
  - primary payment entry point
- payment-history.html
  - alternative payment button and payment history view
- payment-return.html
  - verifies final status after PayFast redirect
- payment-cancel.html
  - shown when the user cancels checkout
- payment-proof.html
  - for manual proof upload after payment if needed

---

### 6. What is stored in Firestore

Transactions are created in:
- `transactions` collection

Fields include:
- `userId`
- `contributionId`
- `groupId`
- `amount`
- `currency`
- `status` (`pending`, `completed`, `failed`, `cancelled`)
- `provider: 'payfast'`
- `payfastPaymentId`
- `amountGross`
- `amountFee`
- `amountNet`
- timestamps

When payment succeeds:
- `contributions` document may be updated to:
  - `status: 'confirmed'`
  - `paidAt`
  - `transactionId`

---

### 7. Summary

- Frontend starts payment by calling `/api/payments/initiate`
- Backend prepares PayFast payload and writes a Firestore transaction
- Frontend redirects user to PayFast using a hidden form
- PayFast notifies the backend via ITN
- Backend verifies and updates payment status
- Frontend confirms status on payment-return.html

If you want, I can also diagram the exact page/button sequence or map each file to the step where it runs.

Reviewing the payment page flow files to ensure the diagram matches the actual code.

Read [](file:///workspaces/-div-elopers/frontend/js/payment-history.js#1-1), lines 1 to 220

Searched for regex `modal.open|PaymentModal|onPaymentSuccess|onProofUploaded|data-contrib-id|onPaymentFailed` (`**/frontend/js/payment.js`), 8 results

Read [](file:///workspaces/-div-elopers/frontend/js/payment.js#260-260), lines 260 to 340

## Payment flow diagram

```mermaid
flowchart TD
  U[User]
  P1[payment.html]
  P2[payment-history.html]
  B1[frontend/js/payment.js]
  B2[frontend/js/payment-history.js]
  M[frontend/components/payment-modal.js]
  API[/api/payments/initiate]
  S[/api/payments/status/:paymentId]
  N[/api/payments/notify]
  C[backend/api/payments/index.js]
  SVC[backend/services/payfastService.js]
  PF[PayFast gateway]
  R[payment-return.html]
  X[payment-cancel.html]
  DB[Firestore transactions/contributions]

  U -->|click Make a Payment| P1
  U -->|click Make a Payment| P2
  P1 --> B1
  P2 --> B2
  B1 -->|click Pay Now on contribution row| M
  M -->|confirm payment| API
  B2 -->|click Make a Payment| API
  API --> C
  C -->|generate signed payload| SVC
  C -->|create transaction doc| DB
  C -->|return paymentData| B2
  API -->|hidden form submit| PF
  PF --> R
  PF --> N
  N --> C
  N -->|update transaction/contribution| DB
  R --> S
  S --> C
  S --> DB
```

---

## Exact page/button sequence

### 1. payment.html
- Button: `#make-payment-btn`
- Table buttons: `Pay Now` buttons in each pending contribution row
- Files:
  - payment.js
  - payment-modal.js

Flow:
- Page loads and authenticates user via payment.js
- Pending contributions are loaded from Firestore
- User clicks:
  - `#make-payment-btn` → direct redirect flow
  - OR a row’s `Pay Now` button → opens `PaymentModal`
- If using row button:
  - `PaymentModal.open(...)` is called
  - User confirms payment in payment-modal.js
  - Modal posts to `/api/payments/initiate`

### 2. payment-history.html
- Button: `#make-payment-btn`
- Files:
  - payment-history.js

Flow:
- Page loads and authenticates user via payment-history.js
- User clicks `#make-payment-btn`
- `initiatePayFastRedirect(user)` runs
- It finds the first pending contribution
- It posts to `/api/payments/initiate`

---

## Backend sequence

### 3. `POST /api/payments/initiate`
- File:
  - index.js
- What happens:
  - Auth token is verified
  - A Firestore `transactions` document is created
  - PayFast URLs are built:
    - `return_url`
    - `cancel_url`
    - `notify_url`
  - payfastService.js generates signed PayFast payload
  - Backend returns:
    - `paymentId`
    - `paymentData`
    - `paymentUrl`

---

## Gateway handoff

### 4. Redirect to PayFast
- Performed in frontend by submitting a hidden form
- Included fields:
  - `merchant_id`
  - `merchant_key`
  - `return_url`
  - `cancel_url`
  - `notify_url`
  - `m_payment_id`
  - `amount`
  - `item_name`
  - `item_description`
  - `custom_str1` (userId)
  - `signature`

Files involved:
- payment-history.js
- payment.js
- payment-modal.js

---

## PayFast callback / return

### 5. PayFast server callback
- ITN endpoint:
  - `POST /api/payments/notify`
- File:
  - index.js
- Service:
  - payfastService.js

What happens:
- Backend verifies ITN signature
- Backend validates ITN with PayFast
- Backend extracts:
  - `m_payment_id` → internal `paymentId`
  - `pf_payment_id`
  - `payment_status`
  - `amount_gross`
- Backend updates Firestore transaction status
- If completed, it also updates linked contribution status

### 6. User return page
- Success page:
  - payment-return.html
- Cancel page:
  - payment-cancel.html

Return page behavior:
- Reads `paymentId` from URL or `localStorage.pendingPaymentId`
- Polls:
  - `GET /api/payments/status/:paymentId`
- File:
  - payment-return.html (inline script)

---

## Status check

### 7. `GET /api/payments/status/:paymentId`
- File:
  - index.js
- Returns:
  - `paymentId`
  - `status`
  - `amount`
  - `currency`
  - `payfastPaymentId`

This is the endpoint polled by payment-return.html to display final success/failure.

---

## File-to-step mapping

| Step | User action / system event | Files |
|---|---|---|
| Page load | render pending payments | payment.js, payment-history.js |
| Button click | `#make-payment-btn` / `Pay Now` | same as above |
| Payment modal | confirm payment | payment-modal.js |
| Initiate API | create PayFast payload | index.js |
| Sign + format | PayFast request data | payfastService.js |
| Merchant redirect | submit hidden form to PayFast | payment.js, payment-history.js, payment-modal.js |
| Gateway callback | PayFast ITN webhook | index.js |
| Return page | user lands back after payment | payment-return.html |
| Status poll | confirm final payment result | payment-return.html, index.js |

---

## Key pages in the exact sequence

1. payment.html
2. payment-history.html
3. payment-return.html
4. payment-cancel.html

Optional follow-up:
- payment-proof.html and proof upload logic are used after payment if user manually uploads evidence, but the core PayFast sequence is the one above.

