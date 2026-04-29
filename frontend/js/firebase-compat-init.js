// js/firebase-compat-init.js
(async function () {
  /* global firebase */
  if (typeof firebase === 'undefined' || typeof firebase.initializeApp !== 'function') {
    console.error('[firebase-compat-init] Firebase compat SDK not loaded.');
    return;
  }

  if (firebase.apps && firebase.apps.length > 0) {
    return;
  }

  try {
    const response = await fetch('/api/getFirebaseConfig', {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      console.error('[firebase-compat-init] Could not fetch /api/getFirebaseConfig — status', response.status);
      return;
    }

    const config = await response.json();
    firebase.initializeApp(config);
  } catch (e) {
    console.error('[firebase-compat-init] Failed to initialize Firebase:', e);
  }
})();
