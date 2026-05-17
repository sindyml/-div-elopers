// js/firebase-config.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-analytics.js";

// Fetch from Render backend - NOT localhost
const response = await fetch('https://div-elopers.onrender.com/api/getFirebaseConfig');

if (!response.ok) {
    throw new Error(`Firebase configuration is not available (HTTP ${response.status})`);
}

const firebaseConfig = await response.json();

// Initialize Firebase
const app = initializeApp(firebaseConfig);

const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db, analytics };
