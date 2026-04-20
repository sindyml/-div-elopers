// js/firebase-compat-init.js
(function () {
  /* global firebase */
  if (typeof firebase === 'undefined' || typeof firebase.initializeApp !== 'function') {
    console.error('[firebase-compat-init] Firebase compat SDK not loaded.');
    return;
  }

  if (firebase.apps && firebase.apps.length > 0) {
    return;
  }

  var xhr = new XMLHttpRequest();
  xhr.open('GET', '/api/getFirebaseConfig', false);
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
