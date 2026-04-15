// js/firebase-config.js

// STEP 1: Import Firebase SDK modules from Google's CDN
// initializeApp = starts Firebase in our app
// getAuth = handles user authentication (login, register, logout)
// getFirestore = handles database operations (reading/writing data)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-analytics.js";

// STEP 2: Firebase configuration object
// These values come from my Firebase project settings
// I got these from Firebase Console -> Project Settings -> General
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

// STEP 3: Initialize Firebase with our config
// This connects our app to the Firebase backend
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// STEP 4: Export auth and db so other files can use them
// auth = used for login, register, logout, checking user status
// db = used for reading/writing to Firestore database
export const auth = getAuth(app);
export const db = getFirestore(app);
