# Product Requirements Document (PRD): Stockpal

## 1. Project Overview
**Stockpal** is a specialized fintech platform designed to digitize the traditional South African "Stokvel" (savings club) model. The platform replaces manual record-keeping, spreadsheets, and fragmented chat communications with a transparent, secure, and role-aware digital ecosystem. It facilitates contribution tracking, payout scheduling, meeting management, and provides real-time South African financial insights.

## 2. Target Audience
- **Stokvel Members:** Individuals looking for a transparent way to track their savings and payout turns.
- **Treasurers:** Users responsible for managing group funds, verifying payments, and disbursing payouts.
- **Administrators:** Group founders who manage member lists, roles, and group settings.

## 3. User Roles & Permissions
The system implements a three-tier Role-Based Access Control (RBAC) model:

| Role | Description | Key Permissions |
|---|---|---|
| **Admin** | Group Owner | Manage settings, invite/remove members, assign roles, all Treasurer permissions. |
| **Treasurer** | Financial Manager | Confirm contributions, manage payout schedules, record meeting minutes. |
| **Member** | Standard User | View group info, track personal contributions, view payout dates, access financial widget. |

## 4. Functional Requirements

### 4.1 Authentication & Profile Management
- Users must be able to register and login via Firebase Authentication (Email/Password).
- Automatic role assignment during registration (defaulting to Member unless creating a group).
- Secure password recovery flow.

### 4.2 Group Management
- Admins can create groups with defined contribution amounts and payout frequencies.
- Invitation system via email to bring new members into specific groups.
- Real-time updates for member lists using Firestore listeners.

### 4.3 Contribution Tracking & Payments
- **Digital Payments:** Transitioning to **Stripe** (previously PayFast) for secure transactions. Supports ZAR currency.
- **Manual Verification:** Ability for members to upload proof of payment for manual Treasurer approval.
- **History:** Comprehensive view of past and upcoming contributions for each member.

### 4.4 Payout Logic
- Automated generation of 12-month payout sequences upon group creation.
- Treasurer-initiated disbursement flow with status tracking (Pending -> Completed).
- Transparency for all members regarding who is next in the rotation.

### 4.5 Meeting Management
- Scheduling tool with constraints (08:00–20:00).
- Agenda posting and post-meeting minutes recording.
- Real-time notifications for meeting updates.

### 4.6 SA Financial Data Widget
- Live fetching of USD/ZAR exchange rates via Frankfurter API.
- Integration of SARB (South African Reserve Bank) rates: Repo Rate, Prime Lending Rate, and Inflation Rate.
- Projected savings growth calculator based on group contribution amounts.

## 5. Technical Requirements
- **Frontend:** Vanilla JavaScript (ES Modules), HTML5, CSS3.
- **Backend:** Node.js static server with API proxies (Express-based custom router).
- **Database:** Cloud Firestore (Real-time NoSQL).
- **Hosting:** Azure Static Web Apps.
- **Payments:** Stripe (primary), with legacy support for PayFast during transition.

## 6. Success Metrics
- **Transparency:** 100% of members can view the group's `totalBalance` and payout order.
- **Efficiency:** Reduction in time taken for Treasurers to reconcile monthly contributions.
- **Accuracy:** Elimination of manual calculation errors in payout sequences.
- **Compliance:** Secure handling of financial data and proof-of-payment uploads.

## 7. Document Maintenance
This document should be updated at the start of every sprint if new features are added to the backlog or if the technical architecture shifts (e.g., migration of payment gateways).
