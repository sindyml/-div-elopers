// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";

// NOTE: This file uses npm-style imports and is intended for use
// with a bundler (e.g. webpack, Vite) that replaces process.env
// at build time.  Browser code that loads directly via <script>
// should use firebase-config.js (ES module with top-level await)
// or firebase-compat-init.js (compat SDK) instead.
const firebaseConfig = {
  apiKey:            process.env.FIREBASE_API_KEY            || '',
  authDomain:        process.env.FIREBASE_AUTH_DOMAIN        || '',
  databaseURL:       process.env.FIREBASE_DATABASE_URL       || '',
  projectId:         process.env.FIREBASE_PROJECT_ID         || '',
  storageBucket:     process.env.FIREBASE_STORAGE_BUCKET     || '',
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
  appId:             process.env.FIREBASE_APP_ID             || '',
  measurementId:     process.env.FIREBASE_MEASUREMENT_ID     || '',
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

export const db = getFirestore(app);