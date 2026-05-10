/* ============================================================
   Vercel Serverless Function: getFirebaseConfig

   Returns the Firebase client configuration from Vercel
   environment variables.

   All values are safe for browser use — they identify the
   Firebase project but do not grant privileged access.
   Firestore Security Rules and Firebase Auth enforce access
   control on the backend.
   ============================================================ */

module.exports = (req, res) => {
  const config = {
    apiKey:            process.env.FIREBASE_API_KEY            || '',
    authDomain:        process.env.FIREBASE_AUTH_DOMAIN        || '',
    databaseURL:       process.env.FIREBASE_DATABASE_URL       || '',
    projectId:         process.env.FIREBASE_PROJECT_ID         || '',
    storageBucket:     process.env.FIREBASE_STORAGE_BUCKET     || '',
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
    appId:             process.env.FIREBASE_APP_ID             || '',
    measurementId:     process.env.FIREBASE_MEASUREMENT_ID     || '',
  };

  // Validate all required Firebase config fields
  const missing = [];
  if (!config.apiKey) missing.push('FIREBASE_API_KEY');
  if (!config.authDomain) missing.push('FIREBASE_AUTH_DOMAIN');
  if (!config.projectId) missing.push('FIREBASE_PROJECT_ID');
  if (!config.appId) missing.push('FIREBASE_APP_ID');

  if (missing.length > 0) {
    res.setHeader('Content-Type', 'application/json');
    res.status(500).json({
      error: `Firebase configuration is incomplete. Missing: ${missing.join(', ')}. Add FIREBASE_* environment variables in Vercel settings.`
    });
    return;
  }

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.status(200).json(config);
};
