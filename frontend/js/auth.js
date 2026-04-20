// js/auth.js

// Import Firebase services - auth for user session, db for Firestore
import { auth, db } from "./firebase-config.js";
// Import Firestore functions - doc() creates reference, getDoc() reads data
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// FUNCTION 1: Check if user is logged in
// Used by privateRoute() and other pages to protect content
export function isAuthenticated() {
  // auth.currentUser is null when no one is logged in
  // Returns true if user exists, false if not
  return auth.currentUser !== null;
}

// FUNCTION 2: Get current user's role from Firestore
// Used by roleGuard() to check permissions
export async function getCurrentUserRole() {
  const user = auth.currentUser;

  // No user logged in? Return null
  if (!user) return null;

  // Create reference to the user's document in Firestore
  const docRef = doc(db, "users", user.uid);
  // Fetch the document
  const docSnap = await getDoc(docRef);

  // Return just the role field (e.g., "Admin", "Member", "Treasurer")
  return docSnap.data().role;
}

// FUNCTION 3: Protect pages (redirect if not logged in)
// Call this on any page that requires authentication
export function privateRoute() {
  if (!isAuthenticated()) {
    // Not logged in? Send them to login page
    window.location.href = "login.html";
  }
}

// FUNCTION 4: Role-based guard
// Call this on pages that require specific roles
// Example: roleGuard("Admin") on the Create Group page
export async function roleGuard(requiredRole) {
  // Get the logged-in user's role from Firestore
  const role = await getCurrentUserRole();

  // If their role doesn't match what's required
  if (role !== requiredRole) {
    window.alert("403: Access denied");  // Tell them they can't access
    window.location.href = "dashboard.html";  // Send them back to dashboard
  }
}