/* ============================================================
   Azure Function: getFirebaseConfig

   Returns the Firebase client configuration from Azure Static
   Web Apps Application Settings (environment variables).

   All values are safe for browser use — they identify the
   Firebase project but do not grant privileged access.
   Firestore Security Rules and Firebase Auth enforce access
   control on the backend.
   ============================================================ */

module.exports = async function (context) {
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

  // Fail fast if the critical key is missing so misconfiguration
  // is obvious during development and deployment.
  if (!config.apiKey) {
    context.res = {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Firebase configuration is not set. Add FIREBASE_* Application Settings in Azure portal.' },
    };
    return;
  }

  context.res = {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
    body: config,
  };
};
