# Technical Design Document (TDD): Stockpal

## 1. System Architecture
Stockpal follows a decoupled Client-Server architecture leveraging Managed Services for scalability and real-time capabilities.

- **Frontend:** Single Page Application (SPA) built with Vanilla JavaScript (ES Modules), HTML5, and CSS3. It interacts directly with Firebase for Auth and Real-time Database updates, and with the Node.js backend for sensitive financial operations.
- **Backend:** Node.js server acting as a secure proxy and API gateway. It handles Stripe/PayFast webhooks, manages sensitive Firestore transactions, and interfaces with the Firebase Admin SDK.
- **Database & Auth:** Google Cloud Firestore (NoSQL) and Firebase Authentication.
- **Hosting:** Azure Static Web Apps (Front-end and API).

## 2. Backend Design
The backend is structured as a modular API using a custom HTTP router in `backend/server.js`.

### 2.1 API Routing
Routes are delegated to modular handlers:
- `/api/payments/*`: Handled by `backend/api/payments/index.js`
- `/api/payouts/*`: Handled by `backend/api/payouts/index.js`
- `/api/chatbot/*`: Handled by `backend/api/chatbot/index.js`
- `/api/getSAData`: Proxy for South African financial data.

### 2.2 Payment Integration
The system is currently transitioning from **PayFast** to **Stripe**.
- **Stripe Flow:** Frontend creates a Checkout Session via `/api/payments/create-checkout-session`. The backend listens for `checkout.session.completed` webhooks to atomically update the transaction and contribution status.
- **Security:** All webhooks verify signatures (Stripe-Signature or PayFast MD5) before processing.

## 3. Database Schema (Firestore)

### 3.1 Core Collections
- **`users`**: User profiles and application-level roles.
- **`groups`**: Metadata for stokvels (contribution amounts, payout orders).
- **`memberships`**: Flat mapping of `uid` to `groupId` for fast dashboard queries.
- **`invites`**: Tracking of pending group invitations.

### 3.2 Transactional Collections
- **`transactions`**: Unified record for all financial movements (inflow via Stripe/PayFast).
- **`contributions`**: Tracking individual monthly payments within a group.
- **`payouts`**: Scheduled and completed disbursements to members.
- **`disputes`**: Tracking flagged or missed contributions.

### 3.3 Sub-collections
- **`groups/{groupId}/members`**: Detailed role information (`admin`, `treasurer`, `member`) within a specific group context.

## 4. Frontend Design
The frontend uses a component-based approach with ES Modules.

- **State Management:** Uses Firestore `onSnapshot` for real-time UI updates (e.g., meeting minutes, group balance).
- **Service Layer:** `frontend/js/` contains specialized services (`userService.js`, `groupService.js`, `paymentService.js`) to encapsulate Firestore and API logic.
- **Security:** `auth.js` provides `roleGuard` and `privateRoute` helpers to protect frontend routes based on Firebase Auth state and custom claims.

## 5. Security Model
- **Authentication:** Managed by Firebase Auth (JWT-based).
- **Authorization (RBAC):**
    - Custom Claims are used to store roles for high-security backend operations.
    - Firestore Security Rules enforce data isolation at the database level.
- **Financial Integrity:** All updates to `totalBalance` or `payout` status must occur through backend APIs using **Firestore Transactions** to ensure atomicity.

## 6. Integrations
- **Stripe API:** Used for ZAR payment processing.
- **Frankfurter API:** Fetches live USD/ZAR exchange rates.
- **SARB Fallback:** Static data in `constants.js` updated per sprint for South African interest rates.
- **Azure Key Vault:** Stores sensitive secrets like `STRIPE_SECRET_KEY` and Firebase Service Account keys in production.
