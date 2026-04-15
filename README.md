# Stockpal — Stokvel Management Platform

> A web-based platform for South African savings groups (stokvels) to manage contributions, payout schedules, group meetings, and financial insights — replacing spreadsheets and chat threads with a transparent, role-aware system.

[![Azure Static Web Apps](https://img.shields.io/badge/hosted-Azure%20Static%20Web%20Apps-0078d4?logo=microsoftazure)](https://azure.microsoft.com/en-us/products/app-service/static)
[![Firebase](https://img.shields.io/badge/backend-Firebase%20%2B%20Firestore-FFCA28?logo=firebase&logoColor=black)](https://firebase.google.com)
[![Node.js](https://img.shields.io/badge/server-Node.js%20%3E%3D18-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org)

---

## Table of Contents

1. [Overview](#overview)
2. [Features](#features)
3. [Tech Stack](#tech-stack)
4. [Database Schema](#database-schema)
5. [SA Financial Data Integration](#sa-financial-data-integration)
6. [Project Structure](#project-structure)
7. [Getting Started](#getting-started)
8. [User Roles](#user-roles)
9. [Team](#team)

---

## Overview

Stokvels are a cornerstone of South African financial culture — informal savings clubs where members pool money and take turns receiving the total. Stockpal digitises this process, providing:

- Role-based access for **Members**, **Treasurers**, and **Admins**
- Real-time group and contribution tracking backed by Cloud Firestore
- Meeting scheduling with agenda and minutes management
- A live SA financial data widget (SARB prime rate, repo rate, USD/ZAR)
- Deployed as a public web app on Azure Static Web Apps

---

## Features

| Feature | Description |
|---|---|
| **Authentication** | Firebase Auth with email/password; role-based access control (Admin, Treasurer, Member) |
| **Group Management** | Create stokvel groups with a contribution amount, payout order, and meeting frequency; invite members by email |
| **Contribution Tracking** | Members view contribution history; Treasurers confirm payments and flag missed contributions |
| **Meeting Management** | Schedule meetings (08:00–20:00), post agendas, record minutes; real-time notifications via Firestore `onSnapshot` |
| **SA Data Widget** | Live prime rate, repo rate, inflation rate, and USD/ZAR exchange with a projected savings growth calculator |
| **Dashboard** | Personalised view of group stats, upcoming meetings, and SA financial indicators |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5 / CSS3 / Vanilla JavaScript (ES Modules) |
| Authentication | Firebase Authentication (email/password) |
| Database | Cloud Firestore (NoSQL, real-time) |
| Data Connect | Firebase Data Connect (GraphQL schema) |
| Server | Node.js static file server + `/api/getSAData` proxy |
| SA Data | Frankfurter API (live USD/ZAR); SARB static rates as fallback |
| Hosting | Azure Static Web Apps |
| CI/CD | GitHub Actions |
| Testing | Jest |

---

## Database Schema

### Cloud Firestore Collections

#### `groups`

| Field | Type | Description |
|---|---|---|
| `name` | `string` | Display name of the group |
| `contributionAmount` | `number` | Monthly contribution amount in ZAR |
| `payoutOrder` | `array<uid>` | Ordered list of member UIDs for payout rotation |
| `meetingFrequency` | `string` | e.g. `"monthly"`, `"weekly"` |
| `creatorUid` | `string` | UID of the user who created the group |
| `createdAt` | `timestamp` | Server-side creation time |

##### `groups/{groupId}/members` (subcollection)

| Field | Type | Description |
|---|---|---|
| `uid` | `string` | Firebase Auth UID |
| `role` | `"admin" \| "treasurer" \| "member"` | Permission level within the group |
| `joinedAt` | `timestamp` | When the member joined |

---

#### `meetings`

| Field | Type | Description |
|---|---|---|
| `groupID` | `string` | Reference to the parent group |
| `title` | `string` | Meeting title |
| `date` | `string` | Date of the meeting (`YYYY-MM-DD`) |
| `time` | `string` | Time of the meeting (`HH:MM`), constrained to 08:00–20:00 |
| `location` | `string` | Physical or virtual location |
| `agenda` | `string` | Meeting agenda (free text) |
| `minutes` | `string` | Recorded minutes (added post-meeting) |
| `createdAt` | `timestamp` | Server-side creation time |

---

#### `invites`

| Field | Type | Description |
|---|---|---|
| `email` | `string` | Invitee's email address |
| `groupId` | `string` | Target group ID |
| `invitedBy` | `string` | UID of the inviting user |
| `status` | `"pending" \| "accepted"` | Current invite state |
| `createdAt` | `timestamp` | Server-side creation time |

---

#### `memberships`

Flat lookup table mapping users to groups (used for efficient membership queries).

| Field | Type | Description |
|---|---|---|
| `uid` | `string` | Firebase Auth UID |
| `groupId` | `string` | Associated group ID |

---

#### `users`

User profile documents created on registration.

| Field | Type | Description |
|---|---|---|
| `role` | `"Admin" \| "Treasurer" \| "Member"` | Application-level role |

---

### Firebase Data Connect Schema

A secondary typed schema used with Firebase Data Connect for strongly-typed queries:

```graphql
type User @table {
  email: String!
  displayName: String!
  createdAt: Timestamp!
  photoUrl: String
}

type Group @table {
  name: String!
  createdAt: Timestamp!
  description: String
}

type Membership @table(key: ["user", "group"]) {
  user: User!
  group: Group!
  role: String!
  createdAt: Timestamp!
}

type Meeting @table {
  group: Group!
  title: String!
  scheduledAt: Timestamp!
  createdAt: Timestamp!
  caller: User!
  description: String
  location: String
}
```

---

## SA Financial Data Integration

The dashboard includes a live SA financial data widget. Data is sourced in the following priority order:

1. **Frankfurter API** (`api.frankfurter.dev`) — live USD/ZAR exchange rate; no API key required, CORS-friendly
2. **Azure Function proxy** (`/api/getSAData`) — server-side fallback to avoid browser CORS restrictions
3. **Static fallback** — hardcoded SARB values updated at the start of each sprint

**Current values (SARB MPC decision, March 2026):**

| Indicator | Value |
|---|---|
| Repo Rate | 6.75% |
| Prime Lending Rate | 10.25% |
| Inflation Rate (SARB Q2 forecast) | 4.0% |
| USD/ZAR | Fetched live at runtime |

Exchange rate data is cached in `localStorage` for 4 hours to minimise API requests.

---

## Project Structure

```
stockpal/
├── index.html               # Landing page
├── login.html               # Sign-in page
├── register.html            # Registration page
├── dashboard.html           # Member dashboard
├── meetings.html            # Meeting management
├── groupCreate.html         # Group creation form
├── server.js                # Node.js static server + SA data API proxy
├── firestore.rules          # Firestore security rules
├── firestore.indexes.json   # Composite index definitions
├── staticwebapp.config.json # Azure routing and auth config
│
├── js/
│   ├── firebase-config.js   # Firebase initialisation and exports
│   ├── auth.js              # Auth helpers
│   ├── dashboard.js         # Dashboard controller (SA data widget)
│   ├── login.js             # Sign-in logic
│   ├── register.js          # Registration logic
│   ├── meetings.js          # Meeting CRUD + real-time notifications
│   ├── sa-data.js           # SA financial data fetch/cache layer
│   └── firebase.js          # Firebase compat SDK bootstrap
│
├── css/
│   ├── app.css
│   ├── dashboard.css
│   ├── meetings.css
│   ├── landing.css
│   ├── register.css
│   └── theme.css
│
├── components/
│   ├── navbar.js
│   └── footer.js
│
├── api/
│   └── getSAData/           # Azure Function — SA data proxy
│       ├── index.js
│       └── function.json
│
├── dataconnect/
│   ├── dataconnect.yaml
│   ├── seed_data.gql
│   └── schema/schema.gql    # Firebase Data Connect GraphQL schema
│
└── tests/
    └── auth.tests.js
```

---

## Getting Started

### Prerequisites

- Node.js v18 or later
- Git
- A Firebase project (free Spark tier is sufficient)
- An Azure account (free tier for Static Web Apps)

### Local Setup

```bash
# 1. Clone the repository
git clone https://github.com/SindyMl/-div-elopers.git
cd -div-elopers

# 2. Install dependencies
npm install

# 3. Start the local server
npm start
# App is served at http://localhost:8080
```

> **Firebase config:** Add your Firebase project credentials to `js/firebase-config.js`. The required fields are `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, and `appId`.

### Running Tests

```bash
npm test
```

---

## User Roles

| Role | Permissions |
|---|---|
| **Member** | View group info, contribution history, meetings, and the SA data widget |
| **Treasurer** | All Member permissions + confirm/flag contributions, manage payout schedule, schedule meetings, record minutes |
| **Admin** | All Treasurer permissions + manage group settings, invite/remove members, assign the Treasurer role |

Route protection is enforced via `staticwebapp.config.json` (Azure) and Firestore security rules. All routes except `/`, `/login.html`, `/register.html`, and static assets require an authenticated session.

---

## Team

| # | Name | Responsibility |
|---|---|---|
| P1 | Alondwe | Project Lead · Firebase Auth setup |
| P2 | Kwezi | RBAC · CI/CD pipeline |
| P3 | Owen | Group Management |
| P4 | Athandwa | Contribution Tracking |
| P5 | Ziya | Meeting Management |
| P6 | Sindiswa | Landing Page · Azure Deployment · SA Data Integration |

---

*Built with Firebase and Azure as part of an Agile software engineering module.*
