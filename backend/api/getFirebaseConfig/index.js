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
    apiKey:            process.env.FIREBASE_API_KEY            ||"AIzaSyBPhe_IXilwwYXnWwOEm80dho7laI6LGTw" ,
    authDomain:        process.env.FIREBASE_AUTH_DOMAIN        || "stokvel-database.firebaseapp.com",
    databaseURL:       process.env.FIREBASE_DATABASE_URL       || "https://stokvel-database-default-rtdb.firebaseio.com",
    projectId:         process.env.FIREBASE_PROJECT_ID         || "stokvel-database",
    storageBucket:     process.env.FIREBASE_STORAGE_BUCKET     || "stokvel-database.firebasestorage.app",
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "997328421094",
    appId:             process.env.FIREBASE_APP_ID             || "1:997328421094:web:455ddfc7f5d71f96d97b27",
    measurementId:     process.env.FIREBASE_MEASUREMENT_ID     || "G-00W5B7R4KZ",
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
