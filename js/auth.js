// js/auth.js

import { auth, db } from "./firebase-config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Check if user is logged in
export function isAuthenticated() {
  return auth.currentUser !== null;
}

// Get current user's role from Firestore
export async function getCurrentUserRole() {
  const user = auth.currentUser;

  if (!user) return null;

  const docRef = doc(db, "users", user.uid);
  const docSnap = await getDoc(docRef);

  return docSnap.data().role;
}

// Protect pages (redirect if not logged in)
export function privateRoute() {
  if (!isAuthenticated()) {
    window.location.href = "login.html";
  }
}

// Role-based guard
export async function roleGuard(requiredRole) {
  const role = await getCurrentUserRole();

  if (role !== requiredRole) {
    alert("403: Access denied");
    window.location.href = "dashboard.html";
  }
}