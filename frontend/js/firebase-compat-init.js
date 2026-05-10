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
    // Firebase configuration for stokvel-database project
    const firebaseConfig = {
      apiKey: "AIzaSyBPhe_IXilwwYXnWwOEm80dho7laI6LGTw",
      authDomain: "stokvel-database.firebaseapp.com",
      databaseURL: "https://stokvel-database-default-rtdb.firebaseio.com",
      projectId: "stokvel-database",
      storageBucket: "stokvel-database.firebasestorage.app",
      messagingSenderId: "997328421094",
      appId: "1:997328421094:web:9f88bf8ac720b118d97b27",
      measurementId: "G-XXXXXXXXXX"
    };

    firebase.initializeApp(firebaseConfig);
    console.log('[firebase-compat-init] Firebase initialized successfully');
  } catch (e) {
    console.error('[firebase-compat-init] Failed to initialize Firebase:', e);
  }
})();
