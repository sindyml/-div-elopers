/// js/firebase-config.js

// STEP 1: Import Firebase SDK modules from Google's CDN
// initializeApp = starts Firebase in our app
// getAuth = handles user authentication (login, register, logout)
// getFirestore = handles database operations (reading/writing data)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-analytics.js";

// STEP 2: Fetch Firebase configuration from the server
// The actual values are stored in Azure Static Web Apps Application Settings
// (environment variables) and served by the /api/getFirebaseConfig endpoint.
const response = await fetch("/api/getFirebaseConfig");
if (!response.ok) {
  throw new Error("Failed to load Firebase config from /api/getFirebaseConfig");
}
const firebaseConfig = await response.json();

// STEP 3: Initialize Firebase with our config
// This connects our app to the Firebase backend
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// STEP 4: Export auth and db so other files can use them
// auth = used for login, register, logout, checking user status
// db = used for reading/writing to Firestore database
export const auth = getAuth(app);
export const db = getFirestore(app);