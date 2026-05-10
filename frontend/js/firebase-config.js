// js/firebase-config.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-analytics.js";

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyBPhe_IXilwwYXnWwOEm80dho7laI6LGTw",
    authDomain: "stokvel-database.firebaseapp.com",
    databaseURL: "https://stokvel-database-default-rtdb.firebaseio.com",
    projectId: "stokvel-database",
    storageBucket: "stokvel-database.firebasestorage.app",
    messagingSenderId: "997328421094",
    appId: "1:997328421094:web:455ddfc7f5d71f96d97b27",
    measurementId: "G-00W5B7R4KZ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db, analytics };