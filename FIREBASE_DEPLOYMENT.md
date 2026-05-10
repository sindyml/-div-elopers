# Firebase Hosting Deployment Guide

Complete guide to deploy StokPal on Firebase Hosting - FREE and no regional restrictions!

## Why Firebase Hosting?

✅ **Perfect for your project:**
- Already using Firebase Auth & Firestore
- 100% FREE with generous limits
- No regional restrictions (works on any account)
- Fast global CDN
- Automatic SSL/HTTPS
- Easy deployment: one command
- Works with your course requirement (Firebase is part of Google Cloud/Azure ecosystem)

✅ **Free tier limits:**
- 10 GB storage
- 360 MB/day bandwidth (2x more than Azure Web App F1)
- 125K Cloud Function invocations/month
- Custom domains included

## Prerequisites

- Node.js 18+ installed
- Firebase project (you already have one!)
- Firebase CLI installed

## Step 1: Install Firebase CLI

```bash
npm install -g firebase-tools
```

## Step 2: Login to Firebase

```bash
firebase login
```

This opens your browser to authenticate with Google.

## Step 3: Link to Your Firebase Project

1. **Find your Firebase Project ID:**
   - Go to https://console.firebase.google.com
   - Click on your project
   - Look at the URL: `console.firebase.google.com/project/YOUR-PROJECT-ID`
   - Or go to Project Settings → General → Project ID

2. **Update `.firebaserc`:**
   - Open `.firebaserc` file
   - Replace `"your-firebase-project-id"` with your actual project ID

```json
{
  "projects": {
    "default": "YOUR-ACTUAL-PROJECT-ID"
  }
}
```

## Step 4: Set Up Firebase Functions (for API endpoints)

Your backend API needs to be converted to Firebase Cloud Functions.

### Create functions directory:

```bash
mkdir -p functions
cd functions
npm init -y
npm install firebase-functions firebase-admin
```

### Create functions/index.js:

```javascript
const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

// API: Get SA Data
exports.getSAData = functions.https.onRequest((req, res) => {
  // Copy logic from backend/api/getSAData/index.js
  res.set('Access-Control-Allow-Origin', '*');
  res.json({
    primeRate: 10.25,
    repoRate: 6.75,
    inflationRate: 4.0,
    usdZar: 18.50,
    source: 'Firebase Function',
    lastUpdated: new Date().toISOString()
  });
});

// API: Get Firebase Config
exports.getFirebaseConfig = functions.https.onRequest((req, res) => {
  const config = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
  };

  res.set('Cache-Control', 'public, max-age=3600');
  res.json(config);
});

// API: Payments
exports.payments = functions.https.onRequest((req, res) => {
  // Copy logic from backend/api/payments/index.js
  res.json({ message: 'Payment endpoint' });
});
```

## Step 5: Deploy to Firebase

### Deploy everything:

```bash
firebase deploy
```

### Or deploy specific services:

```bash
# Deploy only hosting
firebase deploy --only hosting

# Deploy only functions
firebase deploy --only functions

# Deploy firestore rules
firebase deploy --only firestore:rules
```

## Step 6: Get Your URL

After deployment, Firebase will show your URL:

```
Hosting URL: https://your-project-id.web.app
```

You also get: `https://your-project-id.firebaseapp.com`

## Step 7: Set Environment Variables (for Functions)

Firebase Functions need environment variables:

```bash
firebase functions:config:set \
  firebase.api_key="YOUR_API_KEY" \
  firebase.auth_domain="YOUR_DOMAIN" \
  firebase.project_id="YOUR_PROJECT_ID" \
  payfast.merchant_id="10000100" \
  payfast.merchant_key="46f0cd694581a"
```

Then redeploy functions:

```bash
firebase deploy --only functions
```

## Alternative: Skip Functions (Simpler)

If you want to avoid Cloud Functions setup, you can:

1. **Use frontend-only deployment:**
   - Keep all API calls going directly to Firebase SDK (Auth, Firestore)
   - Remove `/api/getFirebaseConfig` - hardcode config or use environment variables
   - Remove `/api/getSAData` - fetch directly from client

2. **Deploy only static hosting:**
   - Remove `"functions"` section from `firebase.json`
   - Remove `"rewrites"` for API endpoints
   - Just deploy the frontend

```bash
firebase deploy --only hosting
```

## GitHub Actions Auto-Deploy (Optional)

Create `.github/workflows/firebase-hosting.yml`:

```yaml
name: Deploy to Firebase Hosting

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Deploy to Firebase
        uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: '${{ secrets.GITHUB_TOKEN }}'
          firebaseServiceAccount: '${{ secrets.FIREBASE_SERVICE_ACCOUNT }}'
          channelId: live
          projectId: your-project-id
```

## Troubleshooting

### Issue: "Permission denied"

**Solution:** Make sure you're logged in:
```bash
firebase logout
firebase login
```

### Issue: "Project not found"

**Solution:** Check `.firebaserc` has correct project ID

### Issue: Functions not working

**Solution:**
1. Check function logs: `firebase functions:log`
2. Ensure environment variables are set
3. Check billing is enabled (Functions require Blaze plan for external API calls)

### Issue: Need external API calls in functions

Firebase Functions free tier (Spark) doesn't allow external network requests. For `/api/getSAData` (Frankfurter API), you need:

**Option A:** Upgrade to Blaze plan (pay-as-you-go, but free tier includes 2M invocations)
**Option B:** Call APIs directly from frontend instead of through Cloud Functions

## Cost Comparison

| Service | Free Tier | External APIs | Custom Domain |
|---------|-----------|---------------|---------------|
| Azure Web App F1 | 165 MB/day | Yes | No |
| Azure Static Web Apps | 100 GB/month | Yes | Yes |
| **Firebase Hosting** | **360 MB/day** | **Yes (Blaze)** | **Yes** |
| Vercel | 100 GB/month | Yes | Yes |

## Recommended Approach

**Simplest path:**

1. ✅ Deploy static frontend to Firebase Hosting
2. ✅ Keep using Firebase Auth & Firestore (already working)
3. ✅ Move API calls to frontend (direct Firebase SDK calls)
4. ✅ Deploy with one command: `firebase deploy --only hosting`

**Total setup time: 5 minutes**
**Cost: $0**
**Complexity: Low**

## Next Steps

1. **Update `.firebaserc`** with your project ID
2. **Run `firebase login`**
3. **Run `firebase deploy --only hosting`**
4. **Your site is live!**

---

**Questions?** Check Firebase docs: https://firebase.google.com/docs/hosting

**Your site will be live at:** `https://YOUR-PROJECT-ID.web.app` 🚀
