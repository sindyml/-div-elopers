# Security Policy

This document describes the security incidents discovered in the StokPal codebase, the remediation steps taken, and the practices now in place to keep secrets safe going forward.

---

## 1. What Was Exposed

During a codebase audit (PR [#51](https://github.com/SindyMl/-div-elopers/pull/51)), **hardcoded Firebase client configuration values** were found in four source files that were committed to the repository:

| File | What was exposed |
|---|---|
| `frontend/js/firebase-config.js` | Full Firebase config object (API key, project ID, app ID, etc.) |
| `frontend/js/firebase.js` | Same full Firebase config object |
| `frontend/dashboard.html` | Inline `<script>` block containing the Firebase config |
| `services/firebase.js` | Full Firebase config object |

The exposed values included the Firebase **Web API key**, **Auth domain**, **Database URL**, **Project ID**, **Storage bucket**, **Messaging sender ID**, **App ID**, and **Measurement ID**.

> **Severity note:** Firebase client configuration values are designed to be used in browser code and do not, by themselves, grant administrative access. Access control is enforced server-side by [Firestore Security Rules](firebase/firestore.rules) and Firebase Authentication. However, committing these values to a public repository is still a bad practice because it exposes project identifiers and can facilitate targeted abuse (quota exhaustion, phishing, etc.). No server-side secrets (service account keys, admin tokens) were found in the repository.

---

## 2. What Was Done to Fix It

All fixes were shipped in commit [`3c3987f`](https://github.com/SindyMl/-div-elopers/commit/3c3987f) and follow-up [`560a048`](https://github.com/SindyMl/-div-elopers/commit/560a048), merged via PR [#51](https://github.com/SindyMl/-div-elopers/pull/51).

### 2.1 Removed hardcoded secrets from source code

Every inline Firebase config object was deleted from the four files listed above.

### 2.2 Created `/api/getFirebaseConfig` Azure Function

A new Azure Function (`backend/api/getFirebaseConfig/index.js`) was added. It reads each `FIREBASE_*` environment variable from Azure Static Web Apps **Application Settings** and returns them as JSON. If the critical `FIREBASE_API_KEY` variable is missing, the function returns HTTP 500 with a clear error message so misconfigurations are caught early.

### 2.3 Updated frontend config loading

Two loading strategies now replace the hardcoded objects:

| Strategy | Used by | How it works |
|---|---|---|
| **ES module top-level `await`** | `frontend/js/firebase-config.js` (login, register, contributions pages) | `await fetch("/api/getFirebaseConfig")` fetches config at import time |
| **Compat synchronous XHR** | `frontend/js/firebase-compat-init.js` (dashboard, index, meetings, group-create pages) | Synchronous `XMLHttpRequest` to `/api/getFirebaseConfig` ensures config is available before dependent scripts run |

### 2.4 Updated Node.js service modules

`frontend/js/firebase.js` and `services/firebase.js` now read from `process.env.FIREBASE_*` variables. These files are intended for use with a bundler (webpack, Vite) that injects environment variables at build time.

### 2.5 Prevented future leaks

| Control | Detail |
|---|---|
| **`.gitignore`** | `.env`, `.env.local`, and `.env.*.local` are ignored so local secret files are never committed |
| **`.env.example`** | Template listing every required variable with placeholder values — safe to commit |
| **README documentation** | "Secrets & Azure Key Vault" section added explaining env var setup, Azure Key Vault for server-side secrets, and BFG Repo Cleaner steps for scrubbing history |

### 2.6 Git history cleanup (recommended)

Because the secrets existed in earlier commits, they remain in the Git history even after removal from the working tree. The README documents how to use **BFG Repo Cleaner** to scrub these values from history and force-push. All team members must re-clone or `git pull --rebase` after a force-push.

---

## 3. How Secrets Are Managed Going Forward

### 3.1 Client-side Firebase configuration

- All `FIREBASE_*` values are stored as **Azure Static Web Apps Application Settings** (environment variables), never in source code.
- The `/api/getFirebaseConfig` Azure Function serves them to the browser at runtime.
- For local development, developers copy `.env.example` to `.env` and fill in values from the Firebase Console. The `.env` file is git-ignored.

### 3.2 Server-side secrets

For secrets that **must not** be exposed to the browser (e.g., Firebase Admin SDK service account keys, third-party API tokens):

- Store them in **Azure Key Vault** (resource: `stockpal-kv`).
- Grant the Static Web App's managed identity **Get** and **List** permissions on secrets.
- Retrieve them at runtime in Azure Functions using `@azure/identity` and `@azure/keyvault-secrets` — never via environment variables or checked-in files.

### 3.3 CI/CD secrets

- The Azure deployment publish profile is stored as a **GitHub Actions repository secret** (`AZURE_WEBAPP_PUBLISH_PROFILE`) and referenced in the workflow via `${{ secrets.AZURE_WEBAPP_PUBLISH_PROFILE }}`.
- No secrets are logged or echoed in CI workflows.

### 3.4 Security headers

The `staticwebapp.config.json` file sets the following global response headers to reduce common web vulnerabilities:

| Header | Value |
|---|---|
| `Cache-Control` | `no-store` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |

### 3.5 Route protection

All routes except `/`, `/login.html`, `/register.html`, static assets (`/css/*`, `/js/*`, `/components/*`), and API endpoints (`/api/*`) require an **authenticated** session. Unauthenticated requests receive a 302 redirect to `/login.html`.

### 3.6 Firestore Security Rules

Access to the Firestore database is controlled by rules defined in `firebase/firestore.rules`. These rules should be reviewed and tightened before production use to enforce per-user and per-role access.

---

## 4. Reporting a Vulnerability

If you discover a security issue in this project, please **do not** open a public issue. Instead, contact the repository owner directly via the email listed on their GitHub profile so the issue can be assessed and patched before disclosure.
