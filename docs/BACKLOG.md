# Product Backlog: Stockpal

This backlog tracks the prioritized list of features, enhancements, and technical debt for the Stockpal Stokvel Management Platform.

## 1. High Priority (Sprint 4 & 5)

| ID | Title | Description | Category | Status |
|---|---|---|---|---|
| BP-01 | Stripe Webhook Finalization | Complete the atomic update logic for Firestore when Stripe payments are successful. | Backend | In Progress |
| BP-02 | Legacy Field Refactor | Rename all `currentBalance` instances to `totalBalance` across the frontend widgets. | Technical Debt | Pending |
| BP-03 | Analytics UAT | Conduct user acceptance testing for the Compliance and Payout reporting panels. | Testing | Pending |
| BP-04 | Role-Based Navigation | Ensure the UI dynamically hides "Treasurer" and "Admin" menus for standard Members. | UI/UX | In Progress |
| BP-05 | Mobile UI Optimization | Refine dashboard and contribution tables for better visibility on mobile browsers. | UI/UX | Pending |

## 2. Medium Priority (Sprint 6+)

| ID | Title | Description | Category | Status |
|---|---|---|---|---|
| BP-06 | Multi-Currency Support | Allow groups to define contributions in currencies other than ZAR (e.g., USD, EUR) using live rates. | Feature | Backlog |
| BP-07 | Email Notification Engine | Automated emails for upcoming meetings, payment reminders, and payout alerts. | Feature | Backlog |
| BP-08 | Automated Payout Disbursement | Integrate Stripe Payouts API to automatically send funds to member bank accounts. | Feature | Backlog |
| BP-09 | Meeting Recording Upload | Allow Treasurers to upload audio/video recordings of meetings to Firestore. | Feature | Backlog |
| BP-10 | Performance Optimization | Implement lazy loading for large transaction histories and meeting logs. | Performance | Backlog |

## 3. Low Priority (Future Roadmap)

| ID | Title | Description | Category | Status |
|---|---|---|---|---|
| BP-11 | AI Financial Advisor | Extend the chatbot to provide personalized saving tips based on contribution history. | AI | Backlog |
| BP-12 | PDF Statement Export | Generate professional monthly statements for members to download. | Feature | Backlog |
| BP-13 | External Audit Mode | A read-only role for external auditors to verify stokvel financial health. | Security | Backlog |
| BP-14 | Push Notifications | PWA integration for real-time mobile push notifications. | Feature | Backlog |

## 4. Maintenance & Tech Debt

- **Dependency Updates:** Regular audits of `firebase-admin` and `stripe` packages.
- **Unit Testing:** Increase coverage for the `financial-health.js` logic to 90%+.
- **Documentation:** Keep the TDD and PRD updated as new integrations are added.
