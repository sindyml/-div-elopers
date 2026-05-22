# Project Plan & Roadmap: Stockpal (Sprints 1-4)

This document outlines the development trajectory of the Stockpal platform through its first four sprints.

## 1. Project Timeline

| Sprint | Phase | Focus Area | Status |
|---|---|---|---|
| **Sprint 1** | Foundation | Identity, Auth & RBAC | Completed |
| **Sprint 2** | Governance | Groups, Meetings & Payout Order | Completed |
| **Sprint 3** | Financials | PayFast Integration & Contribution Tracking | Completed |
| **Sprint 4** | Optimization | UI Refinement, AI Support & Stripe Transition | Completed |

---

## 2. Sprint Deliverables

### Sprint 1: Identity & Access
- **Focus:** Secure onboarding and role foundations.
- **Key Results:**
    - Firebase Auth integration.
    - Global `users` collection with `Admin`, `Treasurer`, and `Member` roles.
    - Private route guarding in `auth.js`.

### Sprint 2: The Stokvel Model
- **Focus:** Digitalizing group savings logic.
- **Key Results:**
    - Group creation workflow with contribution amount setup.
    - Automated 12-month payout sequence generation.
    - Real-time meeting scheduling and minutes tracking via Firestore.

### Sprint 3: Payment Gateway (ZAR)
- **Focus:** Integration of PayFast for South African ZAR transactions.
- **Key Results:**
    - Backend `payfastService.js` for ITN (webhook) handling.
    - Frontend payment redirection flow.
    - Manual proof-of-payment upload and treasurer verification.

### Sprint 4: UX & AI Refinement
- **Focus:** Enhancing user experience and support.
- **Key Results:**
    - Standardized `totalBalance` field across the platform.
    - AI-powered support widget (`stokvel-widget-chatbot.html`).
    - Accessibility audit (Semantic HTML5 conversion).
    - Initiation of Stripe integration for expanded payment options.

---

## 3. Tech Stack at Sprint 4 Completion
- **Database:** Cloud Firestore
- **Auth:** Firebase Auth
- **Frontend:** Vanilla JS / ES Modules
- **Backend:** Node.js (Azure Functions / Express Proxy)
- **Payments:** PayFast (Live) / Stripe (Integrated)
