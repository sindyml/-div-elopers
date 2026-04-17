/* ============================================================
   firebase-config.js  —  Modular SDK (v9+)
   ============================================================
   HOW TO FILL IN YOUR VALUES:
   1. Go to https://console.firebase.google.com
   2. Open your project → Project Settings (gear icon)
   3. Scroll to "Your apps" → select the web app (</>  icon)
   4. Copy the firebaseConfig object values
   5. Replace the placeholder values below with your real values

   SECURITY:
   These keys are safe to include in frontend code — Firebase
   security rules (managed by you) control what data can be
   accessed. Never commit your Azure or other backend secrets here.

   For Azure deployment, these values are also stored as
   environment variables in the Azure Static Web App settings
   so they can be injected at build time.
   ============================================================ */

/* ── 1. SDK imports ─────────────────────────────────────────
   Import only what you use — tree-shaking removes the rest
   at build time (or the CDN compat shim handles it).          */
import { initializeApp }       from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth }             from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore }        from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';


/* ── 2. Your project credentials ────────────────────────────
   These are the same values from your old firebase.js /
   firebase-config.js — just moved here in one canonical place. */
const firebaseConfig = {
  apiKey:            'AIzaSyBPhe_IXilwwYXnWwOEm80dho7laI6LGTw',
  authDomain:        'stokvel-database.firebaseapp.com',
  projectId:         'stokvel-database',
  storageBucket:     'stokvel-database.firebasestorage.app',
  messagingSenderId: '997328421094',
  appId:             '1:997328421094:web:9f88bf8ac720b118d97b27',
};


/* ── 3. Initialise Firebase (once) ──────────────────────────
   initializeApp() is safe to call once at module load.
   Because this file is an ES module, the browser caches it —
   no risk of double-initialisation the way the old compat
   guard (firebase.apps.length) was protecting against.        */
const app  = initializeApp(firebaseConfig);


/* ── 4. Export service instances ────────────────────────────
   Every other file that needs Firestore or Auth imports these
   named exports. You never call getFirestore() twice.         */
export const db   = getFirestore(app);
export const auth = getAuth(app);