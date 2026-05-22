# Product Backlog: Stockpal (End of Sprint 4)

This backlog tracks the remaining prioritized items for the Stockpal platform as of the completion of Sprint 4.

## 1. High Priority (Immediate Post-Sprint 4)

| ID | Title | Description | Category | Status |
|---|---|---|---|---|
| BP-01 | Stripe Webhook Finalization | Complete the atomic update logic for Firestore when Stripe payments are successful. | Backend | In Progress |
| BP-02 | Legacy Field Refactor | Rename all `currentBalance` instances to `totalBalance` across the frontend widgets. | Technical Debt | Pending |
| BP-03 | Analytics UAT | Conduct user acceptance testing for the Compliance and Payout reporting panels. | Testing | Pending |
| BP-04 | Role-Based Navigation | Ensure the UI dynamically hides "Treasurer" and "Admin" menus for standard Members. | UI/UX | In Progress |

## 2. Future Enhancements (Post-MVP)

| ID | Title | Description | Category | Status |
|---|---|---|---|---|
| BP-05 | Email Notification Engine | Automated emails for upcoming meetings, payment reminders, and payout alerts. | Feature | Backlog |
| BP-06 | Multi-Currency Support | Allow groups to define contributions in currencies other than ZAR (e.g., USD, EUR) using live rates. | Feature | Backlog |
| BP-07 | Automated Payout Disbursement | Integrate Stripe Payouts API to automatically send funds to member bank accounts. | Feature | Backlog |
| BP-08 | Meeting Recording Upload | Allow Treasurers to upload audio/video recordings of meetings to Firestore. | Feature | Backlog |
| BP-09 | Performance Optimization | Implement lazy loading for large transaction histories and meeting logs. | Performance | Backlog |
| BP-10 | PDF Statement Export | Generate professional monthly statements for members to download. | Feature | Backlog |

## 3. Maintenance & Tech Debt

- **Unit Testing:** Increase coverage for the `financial-health.js` logic.
- **Dependency Audit:** Review `firebase-admin` and `stripe` package versions.
- **Documentation:** Maintain consistency between code comments and the TDD.
