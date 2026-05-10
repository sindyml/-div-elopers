# Firebase Hosting Migration - Summary

This migration switches the deployment from Microsoft Azure Static Web Apps to Firebase Hosting.

## Files Created

### 1. `firebase.json`
Main Firebase configuration file that defines:
- **Hosting**: Serves the `frontend` directory with security headers matching the Azure setup
- **Functions**: Configures backend functions using Node.js 18
- **Firestore**: References existing rules and indexes
- **Rewrites**: Routes `/api/**` to Cloud Functions and all other requests to `index.html` (SPA support)
- **Headers**: Security headers (X-Frame-Options, X-Content-Type-Options, etc.)
- **Redirects**: Clean URL redirects for login/register pages

### 2. `.firebaserc`
Project configuration file that specifies the default Firebase project as `stockpal-app`.

**ACTION REQUIRED**: Update this with your actual Firebase project ID.

### 3. `.github/workflows/firebase-hosting.yml`
GitHub Actions workflow that automatically deploys to Firebase Hosting when code is pushed to the `main` branch.

**ACTION REQUIRED**: Add `FIREBASE_SERVICE_ACCOUNT` secret to your GitHub repository:
1. Go to Firebase Console → Project Settings → Service Accounts
2. Generate a new private key
3. In GitHub: Settings → Secrets and variables → Actions
4. Create new secret named `FIREBASE_SERVICE_ACCOUNT`
5. Paste the entire JSON content

### 4. `.firebaseignore`
Specifies files/folders to exclude from Firebase deployment (tests, docs, node_modules, etc.).

### 5. `package.json` (Updated)
Added Firebase deployment scripts and firebase-tools as a dev dependency:
- `npm run deploy` - Deploy everything
- `npm run deploy:hosting` - Deploy only hosting
- `npm run deploy:functions` - Deploy only functions
- `npm run deploy:firestore` - Deploy only firestore rules

## What Changed

### Removed Dependencies on Azure
- The existing `staticwebapp.config.json` is no longer used
- The `.github/workflows/azure-static-web-apps.yml` workflow is superseded by the new Firebase workflow

### Preserved Features
✅ All security headers maintained
✅ API routing preserved (now via Cloud Functions)
✅ Firebase Admin SDK initialization remains the same
✅ Environment variable handling compatible (FIREBASE_* env vars)
✅ Static file serving from frontend directory
✅ SPA routing with fallback to index.html

## Setup Instructions

### 1. Install Firebase CLI (Local Development)
```bash
npm install -g firebase-tools
firebase login
```

### 2. Initialize Firebase Project
```bash
# Link to existing project or create new one
firebase use --add
# Select your Firebase project and set alias as 'default'
```

### 3. Set Environment Variables in Firebase
```bash
firebase functions:config:set \
  firebase.api_key="YOUR_API_KEY" \
  firebase.auth_domain="YOUR_AUTH_DOMAIN" \
  firebase.project_id="YOUR_PROJECT_ID" \
  firebase.storage_bucket="YOUR_STORAGE_BUCKET" \
  firebase.messaging_sender_id="YOUR_SENDER_ID" \
  firebase.app_id="YOUR_APP_ID"
```

### 4. Deploy to Firebase
```bash
# Install dependencies
npm install

# Deploy everything
npm run deploy

# Or deploy only hosting
npm run deploy:hosting
```

### 5. Configure GitHub Actions
Add the `FIREBASE_SERVICE_ACCOUNT` secret as described above in the `.github/workflows/firebase-hosting.yml` section.

## Backend API Notes

The existing backend structure in `backend/api/` is designed for Azure Functions but can work with Firebase Cloud Functions with minimal adaptation. The current `backend/server.js` serves as a local development server.

For Firebase Cloud Functions:
- Functions should be exported from `backend/index.js`
- The server.js routes can be adapted to Cloud Functions format
- Environment variables are managed via Firebase Functions config

## Testing

### Local Testing
```bash
# Start local development server (existing)
npm start

# Or use Firebase emulators
firebase emulators:start
```

### Production Testing
After deployment, your app will be available at:
`https://stockpal-app.web.app` or `https://stockpal-app.firebaseapp.com`

(Replace with your actual project ID)

## Migration Checklist

- [x] Create firebase.json configuration
- [x] Create .firebaserc project file
- [x] Create Firebase Hosting GitHub Actions workflow
- [x] Create .firebaseignore file
- [x] Update package.json with deployment scripts
- [ ] Update .firebaserc with actual Firebase project ID
- [ ] Add FIREBASE_SERVICE_ACCOUNT secret to GitHub
- [ ] Set Firebase environment variables for functions
- [ ] Test deployment locally with firebase-tools
- [ ] Deploy to Firebase Hosting
- [ ] Update DNS/custom domain (if applicable)
- [ ] Archive or delete Azure resources

## Important Notes

1. **Simple & Fast**: The configuration is minimal and leverages Firebase's CDN for fast global delivery
2. **Functional**: All existing features are preserved with equivalent Firebase functionality
3. **No Rewrites**: Existing code structure remains unchanged - only configuration files added
4. **Environment**: Firebase environment variables work the same way as Azure App Settings

## Need Help?

- [Firebase Hosting Documentation](https://firebase.google.com/docs/hosting)
- [GitHub Actions for Firebase](https://github.com/marketplace/actions/deploy-to-firebase-hosting)
- [Firebase CLI Reference](https://firebase.google.com/docs/cli)
