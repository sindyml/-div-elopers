# 🏦 Stockpal – Stokvel Management Platform

> A web-based stokvel management system that enables members to track contributions, monitor payout schedules, communicate, and gain financial insights – designed for South African savings groups.

**Project name:** Stockpal (voted team favourite)

---

## 👥 Team (6 members)

This project is a group effort. Every member has contributed to the design, development, testing, and deployment. Recognition to all:

| ID | Name | Primary Responsibility | Feature Area | Stack Focus |
|----|------|------------------------|--------------|--------------|
| **P1** | Alondwe | Project Lead + Auth (Firebase setup) | Auth | HTML/CSS/JS + Firebase |
| **P2** | Kwezi | Auth RBAC + CI/CD Lead | Auth / CI | HTML/CSS/JS + Firebase |
| **P3** | Owen | Group Management | Groups | HTML/CSS/JS + Firebase |
| **P4** | Athandwa | Contribution Tracking | Contributions | HTML/CSS/JS + Firebase |
| **P5** | Ziya | Meeting Management | Meetings | HTML/CSS/JS + Firebase |
| **P6** | Sindiswa | Landing Page + Azure Deployment | Landing / Deploy | HTML/CSS/JS + Firebase 

---

## 📋 Project Brief (Abridged)

**Context:** Stokvels are a cornerstone of South African financial culture. This platform replaces manual spreadsheets/messaging apps with a transparent, automated system.

**Objectives:** Agile methodology, CI/CD, test-driven development, publicly accessible web app.

**Core requirements:**

| Requirement | Description |
|-------------|-------------|
| User Verification | 3rd party identity provider; roles: Member, Treasurer, Admin |
| Group Management | Create/configure stokvel groups, contribution amounts, payout order, meeting frequency |
| Contribution Tracking | View contributions (members); confirm payments, flag missed contributions, manage payout schedule (treasurers) |
| Meeting Management | Schedule meetings, post agendas, record minutes; member notifications |
| Payments | 3rd party payment gateway for contributions & payout disbursements |
| **SA Data Integration** | Display current SA prime lending rate & repo rate from a live/reliable public dataset. Projected savings growth derived from this data |
| Analytics | 3 dashboards (contribution compliance, payout history/projections, custom view) + CSV/PDF export |
| Bonus (ML) | Financial health scoring for members |

**Special constraints (from brief):**
- **Sprint Review Viva:** Individual members must explain specific code they authored.
- **Individual Sprint Retrospectives:** 200–400 words per sprint, cross-referenced with git history.
- **Commit scrutiny:** Incremental commits across sprint; no last-minute spikes.
- **Mid-sprint requirement change (Sprint 3):** New requirement introduced at planning – team must adapt.
- **SA Data Integration:** Team researches & documents a real South African dataset (justification in backlog).
---

## 🛠️ Tech Stack

| Layer | Technology | Owner |
|-------|------------|-------|
| Frontend | HTML / CSS / JavaScript | Everyone |
| Auth & DB | Firebase Auth + Cloud Firestore | P1 (setup), P2 (guards) |
| CI/CD | GitHub Actions | P2 |
| Hosting | Azure Static Web Apps | P6 (infra), P2 (pipeline) |
| Testing | Jest (code coverage) | P2 |
| Project tracking | GitHub Projects | P1 |

---


## 🚀 Getting Started

### Prerequisites
- Node.js (v18+) 
- Git
- Firebase account (free tier)
- Azure account (free tier for Static Web Apps)

### Installation (Sprint 1)

```bash
# Clone the repo
git clone https://github.com/your-org/stockpal.git
cd stockpal

# No build step – open index.html locally or serve with live server
# For Firebase: create a project, copy your config into a firebase-config.js file
