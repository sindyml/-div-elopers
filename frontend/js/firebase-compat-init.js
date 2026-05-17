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

  // FETCH FROM RENDER BACKEND - NOT RELATIVE PATH
  fetch('https://div-elopers.onrender.com/api/getFirebaseConfig')
    .then((res) => {
      if (!res.ok) {
        throw new Error('Firebase config request failed');
      }
      return res.json();
    })
    .then((firebaseConfig) => {
      firebase.initializeApp(firebaseConfig);
      console.log('[firebase-compat-init] Firebase initialized successfully.');
    })
    .catch((e) => {
      console.error(
        '[firebase-compat-init] Failed to initialize Firebase:',
        e
      );
    });

})();
