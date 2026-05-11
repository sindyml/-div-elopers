// js/firebase-config.js
// CLIENT-SIDE FIREBASE INITIALIZATION (No API call required)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-analytics.js";

// ============================================================
 // API fetch (for Azure)
// ============================================================
 async function fetchConfig() {
     const response = await fetch("/api/getFirebaseConfig");
     if (!response.ok) {
         throw new Error("Failed to load Firebase config");
     }
     return await response.json();
}

//const firebaseConfig = await fetchConfig();
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

// ============================================================
// HARDCODED CONFIG (for local testing)
// ============================================================
/*const firebaseConfig = {
    apiKey: "AIzaSyBPhe_IXilwwYXnWwOEm80dho7laI6LGTw",
    authDomain: "stokvel-database.firebaseapp.com",
    projectId: "stokvel-database",
    storageBucket: "stokvel-database.firebasestorage.app",
    messagingSenderId: "997328421094",
    appId: "1:997328421094:web:9f88bf8ac720b118d97b27"
};*/

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db, analytics };
