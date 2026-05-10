# Firebase Deployment Setup Instructions

## ✅ Changes Made

1. **Updated `.firebaserc`**: Changed project from `stokvel-database` to `stockpal-app` to match GitHub Actions workflow
2. **Converted to client-side Firebase config**: Removed dependency on `/api/getFirebaseConfig` endpoint
3. **Updated both initialization files**:
   - `frontend/js/firebase-compat-init.js` (for compat SDK pages)
   - `frontend/js/firebase-config.js` (for modular SDK pages)

## 🔧 Required: Add Your Firebase Configuration

You need to replace the placeholder values in **both** files with your actual Firebase project configuration.

### Step 1: Get Your Firebase Config

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: **stockpal-app**
3. Click the gear icon ⚙️ → **Project settings**
4. Scroll down to **Your apps** section
5. If you don't have a web app, click **Add app** → **Web** (</> icon)
6. Copy the `firebaseConfig` object

### Step 2: Update firebase-compat-init.js

Edit `frontend/js/firebase-compat-init.js` and replace these values:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",              // Replace with actual value
  authDomain: "stockpal-app.firebaseapp.com",
  projectId: "stockpal-app",
  storageBucket: "stockpal-app.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",  // Replace with actual value
  appId: "YOUR_APP_ID",                // Replace with actual value
  measurementId: "YOUR_MEASUREMENT_ID" // Replace with actual value (optional)
};
```

### Step 3: Update firebase-config.js

Edit `frontend/js/firebase-config.js` and use the **same values** as Step 2.

### Step 4: Deploy to Firebase

```bash
# Install Firebase CLI if you haven't
npm install -g firebase-tools

# Login to Firebase
firebase login

# Verify you're using the correct project
firebase use

# Deploy everything
firebase deploy
```

Or just push to `main` branch and GitHub Actions will deploy automatically.

## 🔍 Troubleshooting

### White page still showing?

1. **Check browser console** (F12 → Console tab):
   - Look for Firebase initialization errors
   - Look for "YOUR_API_KEY" in errors (means you forgot to replace placeholders)

2. **Verify Firebase project ID**:
   - `.firebaserc` should say `"stockpal-app"`
   - GitHub Actions workflow should say `projectId: stockpal-app`

3. **Check Firebase Hosting**:
   ```bash
   firebase hosting:sites:list
   ```
   Should show your site URL

4. **Deploy Firestore rules**:
   ```bash
   firebase deploy --only firestore:rules
   ```

### Authentication not working?

Make sure you've enabled authentication providers in Firebase Console:
- Go to **Authentication** → **Sign-in method**
- Enable: Email/Password, Google, GitHub, Microsoft

## 📝 Note

The old approach (fetching config from `/api/getFirebaseConfig`) required Azure Functions or Firebase Cloud Functions. The new approach uses client-side configuration which is simpler and doesn't require backend API endpoints.

**Important**: The Firebase config values (API key, app ID, etc.) are safe to expose in client-side code. Firebase security is enforced through Firestore Security Rules and Authentication, not by hiding these values.
