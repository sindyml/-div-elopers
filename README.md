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
| **Payment Integration** | PayFast payment gateway for secure card and EFT payments (ZAR only) |
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
| Payments | PayFast Payment Gateway (ZAR transactions) |
| Server | Node.js static file server + `/api/getSAData` proxy + `/api/payments` |
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
├── backend/                        # Server-side code
│   ├── server.js                   # Node.js static server + SA data API proxy
│   └── api/
│       └── getSAData/              # Azure Function — SA data proxy
│           ├── index.js
│           └── function.json
│
├── frontend/                       # All browser-facing code
│   ├── index.html                  # Landing page
│   ├── login.html                  # Sign-in page
│   ├── register.html               # Registration page
│   ├── dashboard.html              # Member dashboard
│   ├── meetings.html               # Meeting management
│   ├── groupCreate.html            # Group creation form
│   │
│   ├── js/
│   │   ├── firebase-config.js      # Firebase initialisation and exports
│   │   ├── auth.js                 # Auth helpers (privateRoute, roleGuard)
│   │   ├── dashboard.js            # Dashboard controller (SA data widget)
│   │   ├── login.js                # Sign-in logic
│   │   ├── register.js             # Registration logic
│   │   ├── meetings.js             # Meeting CRUD + real-time notifications
│   │   ├── sa-data.js              # SA financial data fetch/cache layer
│   │   └── firebase.js             # Firebase compat SDK bootstrap
│   │
│   ├── css/
│   │   ├── theme.css               # Design system (colours, fonts, spacing)
│   │   ├── app.css                 # Authenticated page layout
│   │   ├── dashboard.css           # Dashboard-specific styles
│   │   ├── meetings.css            # Meetings page styles
│   │   ├── landing.css             # Landing page styles
│   │   └── register.css            # Login/register/group-create styles
│   │
│   ├── components/
│   │   ├── navbar.js               # Shared navbar (auth-aware)
│   │   └── footer.js               # Shared footer
│   │
│   ├── contributions/              # Contribution tracking pages
│   │   ├── my.html                 # Member's contribution history
│   │   ├── manage.html             # Treasurer contribution management
│   │   ├── payout.html             # Payout schedule view
│   │   ├── contributions.js        # Contribution data logic
│   │   ├── contributions.css       # Contribution page styles
│   │   └── mock-data.js            # Mock data for development
│   │
│   └── pages/
│       └── dashboard.html          # Additional dashboard page
│
├── services/                       # Firebase service modules (npm-based imports)
│   ├── firebase.js                 # Firebase app initialisation
│   ├── auth.js                     # Auth listener + invite checker
│   ├── dashboardService.js         # Group data queries
│   └── groupService.js             # Group creation + treasurer assignment
│
├── firebase/                       # Firebase configuration files
│   ├── firestore.rules             # Firestore security rules
│   ├── firestore.indexes.json      # Composite index definitions
│   └── dataconnect/
│       ├── dataconnect.yaml
│       ├── seed_data.gql
│       ├── schema/schema.gql       # Firebase Data Connect GraphQL schema
│       └── example/
│           ├── connector.yaml
│           └── queries.gql
│
├── docs/                           # Documentation and schema references
│   ├── Firestore meeting schema
│   ├── schema_representation.txt
│   └── data-model.txt
│
├── tests/
│   └── auth.tests.js               # Auth utility unit tests
│
├── package.json
├── staticwebapp.config.json        # Azure routing and auth config
└── README.md
```

---

## Getting Started

### Prerequisites

- Node.js v18 or later
- Git
- A Firebase project (free Spark tier is sufficient)
- An Azure account (free tier for Static Web Apps)
- A PayFast account ([sign up here](https://www.payfast.co.za/)) or use sandbox for testing

### Local Setup

```bash
# 1. Clone the repository
git clone https://github.com/SindyMl/-div-elopers.git
cd -div-elopers

# 2. Install dependencies
npm install

# 3. Copy the environment template and fill in your values
cp .env.example .env
# Edit .env with:
#   - Firebase values from Firebase Console → Project Settings → General
#   - PayFast credentials from PayFast Dashboard → Settings → Integration
#   - Or use sandbox credentials for testing (already in .env.example)

# 4. Start the local server
npm start
# App is served at http://localhost:8080
```

> **Firebase config:** Firebase credentials are **not** stored in source code. They are loaded at runtime from environment variables via the `/api/getFirebaseConfig` Azure Function. See `.env.example` for the required variables and the [Secrets & Key Vault](#secrets--azure-key-vault) section below for production setup.

> **PayFast config:** For local testing, use the sandbox credentials provided in `.env.example`. For production, get your credentials from the [PayFast Dashboard](https://www.payfast.co.za/login). See [docs/payfast-integration-guide.md](docs/payfast-integration-guide.md) for detailed setup instructions.

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

## Secrets & Azure Key Vault

### Environment Variables

All Firebase and PayFast configuration is supplied through **environment variables** — never committed to source code.

| Variable | Description |
|---|---|
| `FIREBASE_API_KEY` | Firebase Web API key |
| `FIREBASE_AUTH_DOMAIN` | e.g. `your-project.firebaseapp.com` |
| `FIREBASE_DATABASE_URL` | Realtime Database URL |
| `FIREBASE_PROJECT_ID` | Firebase project ID |
| `FIREBASE_STORAGE_BUCKET` | Cloud Storage bucket |
| `FIREBASE_MESSAGING_SENDER_ID` | FCM sender ID |
| `FIREBASE_APP_ID` | Firebase Web app ID |
| `FIREBASE_MEASUREMENT_ID` | Google Analytics measurement ID |
| `PAYFAST_MERCHANT_ID` | PayFast Merchant ID (sandbox: `10000100`) |
| `PAYFAST_MERCHANT_KEY` | PayFast Merchant Key (sandbox: `46f0cd694581a`) |
| `PAYFAST_PASSPHRASE` | PayFast security passphrase |
| `BASE_URL` | Your application URL (e.g., `https://yourdomain.com`) |
| `NODE_ENV` | `development` or `production` |

**Local development:** copy `.env.example` → `.env` and fill in values from the Firebase Console and PayFast Dashboard.

**Azure Static Web Apps:** add the same variables as **Application Settings** in the Azure portal (Settings → Configuration → Application settings).

### Azure Key Vault (server-side secrets)

For any server-side secrets that must not be exposed to the browser (e.g. Firebase Admin SDK service account keys, third-party API tokens), use **Azure Key Vault**.

| Item | Value |
|---|---|
| **Key Vault resource name** | `stockpal-kv` (create in the same resource group as the Static Web App) |
| **Access policy** | Grant the Static Web App's managed identity **Get** and **List** permissions on secrets |

#### Setup steps

1. Create the Key Vault in the Azure portal (or via CLI):
   ```bash
   az keyvault create --name stockpal-kv --resource-group <your-rg> --location <region>
   ```
2. Store secrets:
   ```bash
   az keyvault secret set --vault-name stockpal-kv --name "FirebaseServiceAccountKey" --file service-account.json
   ```
3. Enable the Static Web App's system-assigned managed identity and grant it access:
   ```bash
   az keyvault set-policy --name stockpal-kv \
     --object-id <managed-identity-object-id> \
     --secret-permissions get list
   ```
4. In Azure Functions (API), retrieve secrets at runtime using the `@azure/identity` and `@azure/keyvault-secrets` packages instead of reading from environment variables or files.

### Cleaning Git History

If secrets were previously committed, remove them from the entire Git history using [BFG Repo Cleaner](https://rtyley.github.io/bfg-repo-cleaner/):

```bash
# 1. Install BFG (requires Java)
# 2. Create a file listing the secret strings to remove
echo "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" > /tmp/secrets.txt

# 3. Run BFG to replace secrets in history
bfg --replace-text /tmp/secrets.txt

# 4. Clean up and force-push
git reflog expire --expire=now --all && git gc --prune=now --aggressive
git push --force
```

> ⚠️ **After force-pushing, all team members must re-clone or run `git pull --rebase` to sync with the cleaned history.**

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
