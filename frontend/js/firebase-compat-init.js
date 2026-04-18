// firebase-compat-init.js — Initialise Firebase compat SDK from server config
//
// Usage (in HTML, AFTER the compat SDK script tags):
//   <script src="js/firebase-compat-init.js"></script>
//
// This replaces any inline firebaseConfig objects.  The actual
// values are served by the /api/getFirebaseConfig Azure Function
// which reads from Application Settings (environment variables).

(function () {
  /* global firebase */
  if (typeof firebase === 'undefined' || typeof firebase.initializeApp !== 'function') {
    console.error('[firebase-compat-init] Firebase compat SDK not loaded. Make sure the compat script tags appear before this file.');
    return;
  }

  // Avoid double-init if another script already called initializeApp
  if (firebase.apps && firebase.apps.length > 0) {
    return;
  }

  var xhr = new XMLHttpRequest();
  xhr.open('GET', '/api/getFirebaseConfig', false);   // synchronous — keeps load order simple
  xhr.setRequestHeader('Accept', 'application/json');
  xhr.send();

  if (xhr.status === 200) {
    try {
      var config = JSON.parse(xhr.responseText);
      firebase.initializeApp(config);
    } catch (e) {
      console.error('[firebase-compat-init] Failed to parse Firebase config:', e);
    }
  } else {
    console.error('[firebase-compat-init] Could not fetch /api/getFirebaseConfig — status', xhr.status);
  }
})();
