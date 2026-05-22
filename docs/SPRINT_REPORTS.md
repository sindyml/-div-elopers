# Sprint Progress Reports: Stockpal

## Sprint 3: PayFast Migration & Financial Stability
**Period:** May 1, 2026 – May 14, 2026

### Goal
Replace the legacy Yoco payment integration with PayFast to support South African specific payment methods (Instant EFT) and improve financial reconciliation.

### Accomplishments
- **Backend:** Created `payfastService.js` for MD5 signature generation and ITN (Instant Transaction Notification) verification.
- **API:** Implemented `/api/payments/initiate` and `/api/payments/notify` endpoints.
- **Frontend:** Integrated the PayFast redirect flow into the group dashboard and contribution management pages.
- **Verification:** Successfully implemented `test-integration.js` to simulate the full payment lifecycle in the sandbox environment.

### Status: COMPLETED ✅

---

## Sprint 4: Auth, Dashboard & UX Refinement
**Period:** May 15, 2026 – May 30, 2026 (In Progress)

### Goal
Fix critical authentication bugs, refine the dashboard UI for better financial visibility, and implement AI-assisted support.

### Current Progress
- **Auth Fixes:** Resolved an issue where the logged-in user's name was not displaying correctly in the header after a refresh.
- **UI Refinements:**
    - Updated the dashboard to show a unified `totalBalance` from Firestore.
    - Improved accessibility by implementing semantic HTML5 elements across all main pages.
    - Added a "Back" button to all internal pages via the shared `navbar.js` component.
- **Payment Transition:** Started the implementation of **Stripe** as a secondary payment gateway to expand international payment options while maintaining ZAR support.
- **AI Support:** Deployed the `stokvel-widget-chatbot.html` as a floating action button for real-time user assistance.

### Pending Tasks
- Finalize the Stripe webhook handler for automatic balance updates.
- Complete UAT (User Acceptance Testing) for the analytics report module.
- Refactor legacy `currentBalance` fields to the standardized `totalBalance` in all frontend widgets.

### Current Status: IN PROGRESS 🏃‍♂️
