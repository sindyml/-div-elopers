// js/firebase-config.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBPhe_IXilwwYXnWwOEm80dho7laI6LGTw",
  authDomain: "stokvel-database.firebaseapp.com",
  projectId: "stokvel-database",
  storageBucket: "stokvel-database.firebasestorage.app",
  messagingSenderId: "997328421094",
  appId: "1:997328421094:web:9f88bf8ac720b118d97b27"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// ✅ EXPORT THESE
export const auth = getAuth(app);
export const db = getFirestore(app);