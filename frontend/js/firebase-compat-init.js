// js/firebase-compat-init.js
// CLIENT-SIDE FIREBASE INITIALIZATION (No API call required)
(function () {
  /* global firebase */
  if (typeof firebase === 'undefined' || typeof firebase.initializeApp !== 'function') {
    console.error('[firebase-compat-init] Firebase compat SDK not loaded.');
    return;
  }

  if (firebase.apps && firebase.apps.length > 0) {
    return;
  }

  try {
    // TODO: Replace with your actual Firebase project configuration
    // Get these values from Firebase Console > Project Settings > General
    const firebaseConfig = {
      apiKey: "YOUR_API_KEY",
      authDomain: "stockpal-app.firebaseapp.com",
      projectId: "stockpal-app",
      storageBucket: "stockpal-app.appspot.com",
      messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
      appId: "YOUR_APP_ID",
      measurementId: "YOUR_MEASUREMENT_ID"
    };

    firebase.initializeApp(firebaseConfig);
    console.log('[firebase-compat-init] Firebase initialized successfully');
  } catch (e) {
    console.error('[firebase-compat-init] Failed to initialize Firebase:', e);
  }
})();
