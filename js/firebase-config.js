/* ============================================================
   firebase-config.js — Firebase Initialisation
   
   ⚠️  SETUP INSTRUCTIONS FOR YOUR TEAM:
   
   1. Go to https://console.firebase.google.com
   2. Open your project → Project Settings (gear icon)
   3. Scroll to "Your apps" → select the web app (</> icon)
   4. Copy the firebaseConfig object values
   5. Replace the placeholder values below with your real values
   
   ⚠️  SECURITY:
   These keys are safe to include in frontend code — Firebase
   security rules (managed by P2) control what data can be
   accessed. Never commit your Azure or other backend secrets here.
   
   For Azure deployment, these values are also stored as
   environment variables in the Azure Static Web App settings
   so they can be injected at build time.
   ============================================================ */

const firebaseConfig = {
  apiKey:            "AIzaSyBPhe_IXilwwYXnWwOEm80dho7laI6LGTw",
  authDomain:        "stokvel-database.firebaseapp.com",
  projectId:         "stokvel-database",
  storageBucket:     "stokvel-database.firebasestorage.app",
  messagingSenderId: "997328421094",
  appId:             "1:997328421094:web:9f88bf8ac720b118d97b27"
};

// ── Initialise Firebase ──────────────────────────────────────
// Guard against double-initialisation (e.g. during hot reload)
if (!firebase.apps || !firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
} else {
  firebase.app(); // use the existing app
}

// ── Export shortcuts for other scripts ──────────────────────
const db   = firebase.firestore();
const auth = firebase.auth();

/* Usage in other files:
   - auth.onAuthStateChanged(user => { ... })
   - auth.signInWithEmailAndPassword(email, password)
   - db.collection('groups').doc(groupId).get()
*/
