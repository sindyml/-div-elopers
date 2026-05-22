# Project Plan & Roadmap: Stockpal

This document outlines the development trajectory of the Stockpal platform, mapping technical milestones to the agile sprint cycles.

## 1. Project Timeline Overview

| Phase | Milestone | Focus Area | Dates | Status |
|---|---|---|---|---|
| **Phase 1** | Foundation | Auth & User Roles | Apr 1 – Apr 14 | Completed |
| **Phase 2** | Governance | Group & Meeting Management | Apr 15 – Apr 30 | Completed |
| **Phase 3** | Financials | PayFast Integration & Tracking | May 1 – May 14 | Completed |
| **Phase 4** | Optimization | Dashboard UX & AI Chatbot | May 15 – May 30 | In Progress |
| **Phase 5** | Intelligence | Analytics & Automated Payouts | Jun 1 – Jun 14 | Planning |

---

## 2. Sprint Details

### Sprint 1: Identity & Access (Completed)
- **Goal:** Establish secure entry points and role-based foundations.
- **Key Deliverables:**
    - Firebase Auth setup (Email/Password).
    - User profile creation in Firestore.
    - Application-level RBAC (Admin, Treasurer, Member).

### Sprint 2: The Stokvel Model (Completed)
- **Goal:** Implement the logic for managing savings groups.
- **Key Deliverables:**
    - Group creation and invitation system.
    - 12-month payout sequence generator.
    - Meeting scheduler with real-time minutes tracking.

### Sprint 3: Payment Gateway Migration (Completed)
- **Goal:** Move from Yoco to PayFast for ZAR EFT/Card support.
- **Key Deliverables:**
    - `payfastService` for secure ITN handling.
    - Manual proof-of-payment upload workflow.
    - Firestore-backed transaction history.

### Sprint 4: UX & AI Assistance (Current)
- **Goal:** Refine the financial dashboard and provide real-time support.
- **Key Deliverables:**
    - Fix Auth header display and session persistence.
    - Standardize financial fields (`totalBalance`).
    - Deploy the Gemini-powered AI Support Widget.
    - Initiate Stripe integration for broader card support.

### Sprint 5: Analytics & Scaling (Next)
- **Goal:** Provide actionable financial insights and automate disbursements.
- **Key Deliverables:**
    - Comprehensive financial health scoring module.
    - PDF report generation for treasurers.
    - Final UAT and production deployment on Azure.

---

## 3. Resource Allocation (Core Team)
- **Frontend Lead:** Sindy (Dashboard, Payments UI)
- **Backend Lead:** Kwezi (API Routing, Stripe Integration)
- **Auth & Security:** Alondwe (Firebase Rules, Claims)
- **Feature Devs:** Owen (Groups), Athandwa (Contributions), Ziya (Meetings/AI)

## 4. Risk Management
- **Security:** Financial data handled via backend transactions only.
- **Compliance:** POPIA compliance for user data storage in South Africa.
- **Uptime:** Azure Static Web Apps provide high availability for the global frontend.
