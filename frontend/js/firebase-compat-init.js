// js/firebase-compat-init.js
// ─────────────────────────────────────────────────────────────
// FETCH FIREBASE CONFIG FROM API
// ─────────────────────────────────────────────────────────────

(function() {
  // Use relative path for portability across environments
  fetch('/api/getFirebaseConfig')
    .then(response => {
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      return response.json();
    })
    .then(config => {
      // Initialize Firebase Compat SDK
      firebase.initializeApp(config);
      console.log("✅ Firebase Compat initialized via API config");

      // Dispatch a custom event so other scripts know Firebase is ready
      window.dispatchEvent(new CustomEvent('firebase-compat-ready'));
    })
    .catch(error => {
      console.error('❌ Failed to load Firebase config:', error);
    });
})();
