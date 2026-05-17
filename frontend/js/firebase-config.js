// js/firebase-config.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-analytics.js";

// Use direct config (hardcoded for static Firebase Hosting)
const firebaseConfig = {
  apiKey: "AIzaSyBPhe_IXilwwYXnWwOEm80dho7laI6LGTw",
  authDomain: "stokvel-database.firebaseapp.com",
  databaseURL: "https://stokvel-database-default-rtdb.firebaseio.com",
  projectId: "stokvel-database",
  storageBucket: "stokvel-database.firebasestorage.app",
  messagingSenderId: "997328421094",
  appId: "1:997328421094:web:9f88bf8ac720b118d97b27",
  measurementId: "G-2D5G4K33SP"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db, analytics };
