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
| **P6** | Sindiswa | Landing Page + Azure Deployment | Landing / Deploy | HTML/CSS/JS + Firebase |

> *Replace "Person X" with actual names. All members have active commit history and participate in sprint reviews.*

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

## 📅 Sprint 1 – Task Breakdown (Stokvel Management Platform)

**Team of 6 • HTML/CSS/JS • Firebase + Azure + GitHub**

### 1. User Verification – Split Between P1 and P2

| **P1 – Firebase Auth + Login/Register UI** | **P2 – RBAC, Protected Routes + CI/CD** |
|---------------------------------------------|------------------------------------------|
| - Set up Firebase project (Auth + Firestore) | - `checkRole()` utility function (reads Firestore role) |
| - Enable Email/Password + Google OAuth | - Apply route guards to all pages by role |
| - Build `login.html` and `register.html` pages | - Logout button + Firebase `signOut()` |
| - Firebase `signInWithEmailAndPassword()` | - Firestore security rules for `users` collection |
| - Write user role doc to Firestore on register | - Write UATs for role enforcement |
| - `onAuthStateChanged()` redirect listener | - GitHub Actions CI/CD deploy to Azure |
| - Write UATs for login / register / logout | - Jest code coverage setup in pipeline |
| | - Create Sprint 1 GitHub Release (v0.1.0) |

### 2. Individual Task Assignments

#### P1 – Person 1 (User Verification – Auth UI)

| # | Task Description | Status | Rubric Area |
|---|------------------|--------|--------------|
| 1 | Create Firebase project; enable Email/Password + Google OAuth | To Do | CI/CD |
| 2 | Build Login page (HTML/CSS/JS) wired to Firebase Auth `signInWithEmailAndPassword()` | To Do | Implementation |
| 3 | Build Register page – collect email, password, display name, role selection | To Do | Implementation |
| 4 | On successful registration write user document to Firestore with uid, name, email, role | To Do | Implementation |
| 5 | Implement `onAuthStateChanged()` listener – redirect unauthenticated users to `/login.html` | To Do | Implementation |
| 6 | Write UATs for login, register, logout flows in Given-When-Then format | To Do | TDD |
| 7 | Set up GitHub Projects board with columns: Backlog / In Progress / Testing / Done | To Do | Requirements |
| 8 | Create full product backlog in GitHub Projects – all requirements as user stories (Who-What-Why) | To Do | Requirements |
| 9 | Document Sprint Planning meeting minutes (date, attendees, decisions, priorities) | To Do | Scrum |
| 10 | Implement password reset flow – Firebase `sendPasswordResetEmail()` to Forgot Password link; confirm reset email works | To Do | Implementation |

#### P2 – Person 2 (User Verification – RBAC + CI/CD)

| # | Task Description | Status | Rubric Area |
|---|------------------|--------|--------------|
| 1 | Write `checkRole(requiredRole)` JS utility – reads user Firestore doc, blocks/redirects unauthorised access | To Do | Implementation |
| 2 | Apply route protection to all pages: Admin-only, Treasurer-only, Member-accessible | To Do | Implementation |
| 3 | Implement logout button + Firebase `signOut()` – clear session, redirect to login | To Do | Implementation |
| 4 | Write Firestore security rules for `users` collection (own doc readable; Admin can read all) | To Do | Implementation |
| 5 | Write UATs for role enforcement (e.g. Member cannot navigate to `/admin.html`) | To Do | TDD |
| 6 | Set up GitHub Actions workflow – auto-build on push to main, deploy to Azure Static Web Apps | To Do | CI/CD |
| 7 | Configure Jest for code coverage; add Jest run step to GitHub Actions pipeline | To Do | CI/CD |
| 8 | Create GitHub Sprint 1 Release tag (v0.1.0) once deployment is confirmed working | To Do | CI/CD |
| 9 | Document CI/CD pipeline steps in repo README.md | To Do | CI/CD |

#### P3 – Person 3 (Group Management)

| # | Task Description | Status | Rubric Area |
|---|------------------|--------|--------------|
| 1 | Build Create Stokvel Group form – group name, contribution amount, payout order, meeting frequency | To Do | Implementation |
| 2 | Save new group document to Firestore `groups` collection, linked to Admin user uid as creator | To Do | Implementation |
| 3 | Build Member Invite flow – Admin enters email; write invite document to `invites` collection | To Do | Implementation |
| 4 | On first login after invite, auto-add user to group members sub-collection if invite exists for their email | To Do | Implementation |
| 5 | Build Group Dashboard page – list all groups the logged-in user belongs to (query by uid) | To Do | Implementation |
| 6 | Write Firestore data model for groups and members sub-collection (fields, paths) | To Do | Requirements |
| 7 | Write UATs for: create group, invite member, member sees their groups | To Do | TDD |
| 8 | Assign all Group Management user stories to Sprint 1 track in GitHub Projects with task statuses | To Do | Requirements |

#### P4 – Person 4 (Contribution Tracking)

| # | Task Description | Status | Rubric Area |
|---|------------------|--------|--------------|
| 1 | Build Member Contribution View page – list own contributions (amount, date, status) from Firestore `contributions` | To Do | Implementation |
| 2 | Build Treasurer Confirmation Panel – table of all member contributions; Treasurer can mark Confirmed or Missed | To Do | Implementation |
| 3 | Build Payout Schedule View – ordered list of members and their payout date from `payouts` collection | To Do | Implementation |
| 4 | Write Firestore data model for `contributions` and `payouts` collections | To Do | Requirements |
| 5 | Seed sample contribution and payout data into Firestore for demo/testing | To Do | Implementation |
| 6 | Write UATs for: member views contributions, Treasurer confirms payment, flags missed, views payout schedule | To Do | TDD |
| 7 | Assign all Contribution Tracking user stories in GitHub Projects with statuses | To Do | Requirements |

#### P5 – Person 5 (Meeting Management)

| # | Task Description | Status | Rubric Area |
|---|------------------|--------|--------------|
| 1 | Build Schedule Meeting form (Treasurer/Admin only) – date, time, location, agenda, linked group | To Do | Implementation |
| 2 | Save meeting document to Firestore `meetings` collection; link to group id | To Do | Implementation |
| 3 | Build Meeting List view for all roles – upcoming meetings with date, time, agenda preview | To Do | Implementation |
| 4 | Implement real-time in-app notification banner using Firestore `onSnapshot()` – alerts member when new meeting scheduled for their group | To Do | Implementation |
| 5 | Build Record Minutes feature – Treasurer can add text minutes to a past meeting document | To Do | Implementation |
| 6 | Write UATs for: schedule meeting, view meeting list, member receives notification, record minutes | To Do | TDD |
| 7 | Assign all Meeting Management user stories in GitHub Projects with statuses | To Do | Requirements |

#### P6 – Person 6 (Landing Page + Shared Components + Azure Deployment + SA Data Integration)

| # | Task Description | Status | Rubric Area |
|---|------------------|--------|--------------|
| 1 | Build landing/home page (index.html) – branding, feature overview, CTA buttons to `/login.html` and `/register.html` | To Do | Polish |
| 2 | Build shared navbar component (navbar.js) included across all pages – shows user name and logout when logged in | To Do | Polish |
| 3 | Build shared footer component across all pages | To Do | Polish |
| 4 | Configure Azure Static Web Apps resource in Azure portal; link to GitHub repo for auto-deploy via GitHub Actions | To Do | CI/CD |
| 5 | Configure `staticwebapp.config.json` – route fallbacks, CORS headers, env vars for Firebase config | To Do | CI/CD |
| 6 | Verify deployed public URL is accessible without login – confirm app not running from localhost | To Do | CI/CD |
| 7 | Apply consistent CSS design system across all pages (colours, fonts, spacing, responsive layout) | To Do | Polish |
| 8 | Write UATs for: landing page loads publicly, nav links work, login CTA redirects correctly | To Do | TDD |

**SA Data Integration – P6 Additional Tasks**

| # | Task Description | Status | Rubric Area |
|---|------------------|--------|--------------|
| 1 | Research available SA financial data sources (SARB, JSE, public APIs) – document accessible endpoints, rate limits | To Do | Requirements |
| 2 | Document SA Data Integration as a user story in GitHub Projects backlog (Who-What-Why) and link to relevant tasks | To Do | Requirements |
| 3 | Write `fetchSAData()` JS function that calls chosen SA data API; implement Azure Function fallback proxy if CORS blocked | To Do | Implementation |
| 4 | Build savings projection widget on dashboard – display live or cached SA data (prime rate, repo rate) with each member's stokvel balance to show projected savings growth | To Do | Implementation |
| 5 | Write UATs for SA Data Integration: widget renders with real/fallback data, Azure Function responds within 3s, widget does not break if API unreachable | To Do | TDD |

### 3. Shared Responsibilities – All 6 Members

| # | Task Description | Status | Rubric Area |
|---|------------------|--------|--------------|
| 1 | Attend and contribute to all 4 required Scrum meetings (Sprint Planning, Daily Standups x3+, Backlog Refinement, Sprint Retrospective) | Ongoing | Scrum /15 |
| 2 | Log GitHub Issues as you encounter problems – open AND close with comments explaining fix | Ongoing | CI/CD /15 |
| 3 | Make regular incremental commits throughout the sprint – NOT a large spike night before deadline | Ongoing | CI/CD /15 |
| 4 | Submit individual written Sprint Retrospective (200-400 words) via LMS before assessment | Before assess. | Retro /10 |
| 5 | Prepare to explain your own code and justify technical decisions during Sprint Review Viva | Before assess. | Viva /15 |
| 6 | Cross-review each other's pull requests – each PR should have at least one reviewer comment | Ongoing | Polish |

### 4. User Acceptance Tests (Given-When-Then)

Every user story must have at least one UAT in this format. Markers will verify these were used to confirm story completion.

| User Story | Given | When | Then |
|------------|-------|------|------|
| User Login | User has a registered account | They enter correct email and password on login page and click Login | They are redirected to their role-appropriate dashboard |
| User Register | User navigates to register page | They fill in all required fields and submit the form | Account created in Firebase Auth, user doc with role written to Firestore, redirected to dashboard |
| Role protection | A logged-in Member user | They attempt to navigate directly to `/admin.html` | They are redirected to `/login.html` or a 403 page |
| Create Group | An Admin user is logged in | They fill in the Create Group form and submit | A new group document appears in Firestore and the group appears on their dashboard |
| Invite Member | An Admin user is on the group management page | They enter a valid email and click Invite | An invite document is created in Firestore for that email address |
| View Contributions | A Member user is logged in | They navigate to the Contributions page | They see a list of their own past contributions with amounts and dates |
| Confirm Payment | A Treasurer is on the Contribution panel | They click Confirm on a member's contribution | The contribution status updates to Confirmed in Firestore in real time |
| Schedule Meeting | A Treasurer is logged in | They fill in the Schedule Meeting form and submit | A meeting document is saved to Firestore and visible in Meeting List for all group members |
| Meeting Notification | A Member is logged in with the app open | A Treasurer schedules a new meeting for their group | A notification banner appears on the Member's screen without a page refresh |
| Public Landing | An unauthenticated user visits the deployed Azure URL | The page loads | The landing page renders fully with working Login and Register CTA buttons |
| SA Data Widget | A logged-in Member navigates to the dashboard | The savings projection widget loads (live data or Azure Function fallback) | SA financial data (e.g. prime rate) is displayed in the widget within 3s and no error is shown |
| Password Reset | A registered user has forgotten their password and clicks Forgot Password link on login.html | They enter their email and click Send Reset Email | Firebase sends a reset email; user resets password and can log in with new credentials |

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+) / Python (3.10+) – *only if you add backend later; Sprint 1 is pure static HTML/CSS/JS + Firebase*
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
