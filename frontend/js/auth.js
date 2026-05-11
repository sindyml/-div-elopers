// js/auth.js
import { auth } from "./firebase-config.js";
import { getUserProfile } from "./userService.js";

// FUNCTION 1: Check if user is logged in
export function isAuthenticated() {
  return auth.currentUser !== null;
}

// FUNCTION 2: Get current user's role from Firestore
export async function getCurrentUserRole() {
  const user = auth.currentUser;
  if (!user) return null;
  const profile = await getUserProfile(user.uid);
  return profile ? profile.role : null;
}

// FUNCTION 3: Protect pages
export function privateRoute() {
  if (!isAuthenticated()) {
    window.location.href = "login.html";
  }
}

// FUNCTION 4: Role-based guard
export async function roleGuard(requiredRole) {
  const role = await getCurrentUserRole();
  if (role !== requiredRole) {
    alert("403: Access denied");
    window.location.href = "dashboard.html";
  }
}
