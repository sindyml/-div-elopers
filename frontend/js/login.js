// js/login.js

// Import Firebase services
import { auth, db } from "./firebase-config.js";

// Import auth functions for sign-in
import {
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  GithubAuthProvider,
  OAuthProvider,
  signInWithPopup
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// Import Firestore functions
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

console.log("login.js is running");

// Helper: show alert messages in the UI
function showAlert(message, type = "error") {
  const alertEl = document.getElementById("alertMessage");
  if (!alertEl) return;
  alertEl.textContent = message;
  alertEl.className = type === "success" ? "alert alert--success" : "alert alert--error";
}

// Helper: handle OAuth sign-in for all providers (Google, GitHub, LinkedIn)
// If user has no Firestore doc yet (first-time OAuth), creates one with default "Member" role
async function handleOAuthSignIn(provider, providerName) {
  try {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;

    // Check if this user already has a profile in Firestore
    const userDoc = await getDoc(doc(db, "users", user.uid));

    if (!userDoc.exists()) {
      // First-time OAuth user — create their Firestore profile
      // displayName comes automatically from the OAuth provider (Google, GitHub, etc.)
      await setDoc(doc(db, "users", user.uid), {
        email: user.email,
        displayName: user.displayName || "",
        role: "Member",
        provider: providerName,
        createdAt: new Date().toISOString()
      });
    }

    // Redirect to dashboard
    window.location.href = "dashboard.html";

  } catch (error) {
    console.error(`${providerName} login error:`, error);
    showAlert(error.message);
  }
}

// EMAIL/PASSWORD LOGIN
const form = document.getElementById("loginForm");
if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    try {
      await signInWithEmailAndPassword(auth, email, password);
      window.location.href = "dashboard.html";
    } catch (error) {
      console.error("Email login error:", error);
      showAlert(error.message);
    }
  });
}

// GOOGLE OAUTH
const googleBtn = document.getElementById("googleLoginBtn");
if (googleBtn) {
  googleBtn.addEventListener("click", () => {
    handleOAuthSignIn(new GoogleAuthProvider(), "google");
  });
}

// GITHUB OAUTH
const githubBtn = document.getElementById("githubLoginBtn");
if (githubBtn) {
  githubBtn.addEventListener("click", () => {
    handleOAuthSignIn(new GithubAuthProvider(), "github");
  });
}

// LINKEDIN OAUTH (requires OIDC setup in Firebase Console)
const linkedinBtn = document.getElementById("linkedinLoginBtn");
if (linkedinBtn) {
  linkedinBtn.addEventListener("click", () => {
    handleOAuthSignIn(new OAuthProvider("linkedin.com"), "linkedin");
  });
}