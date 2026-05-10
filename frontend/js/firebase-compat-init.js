// js/firebase-compat-init.js

(function () {
  /* global firebase */

  // Make sure Firebase compat SDK is loaded
  if (
    typeof firebase === 'undefined' ||
    typeof firebase.initializeApp !== 'function'
  ) {
    console.error('[firebase-compat-init] Firebase compat SDK not loaded.');
    return;
  }

  // Prevent duplicate initialization
  if (firebase.apps && firebase.apps.length > 0) {
    return;
  }

  // Firebase configuration
  const firebaseConfig = {
    apiKey: "AIzaSyBPhe_IXilwwYXnWwOEm80dho7laI6LGTw",
    authDomain: "stokvel-database.firebaseapp.com",
    databaseURL: "https://stokvel-database-default-rtdb.firebaseio.com",
    projectId: "stokvel-database",
    storageBucket: "stokvel-database.firebasestorage.app",
    messagingSenderId: "997328421094",
    appId: "1:997328421094:web:455ddfc7f5d71f96d97b27",
    measurementId: "G-00W5B7R4KZ"
  };

  try {
    firebase.initializeApp(firebaseConfig);

    console.log('[firebase-compat-init] Firebase initialized successfully.');

  } catch (e) {

    console.error(
      '[firebase-compat-init] Failed to initialize Firebase:',
      e
    );
  }

})();
