// js/login.js
import { auth, db } from "./firebase-config.js";
import {
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  GithubAuthProvider,
  OAuthProvider,
  signInWithPopup,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc,
  setDoc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

console.log("login.js is running");


// ─────────────────────────────────────────────────
// PENDING OAUTH STATE
// Holds the authenticated user temporarily while
// waiting for them to pick a role in the modal.
// ─────────────────────────────────────────────────
let pendingOAuthUser     = null;
let pendingProviderName  = null;


// ─────────────────────────────────────────────────
// ALERT HELPER
// ─────────────────────────────────────────────────
function showAlert(message, type = "error") {
  const alertEl = document.getElementById("alertMessage");
  if (!alertEl) return;
  alertEl.textContent = message;
  // Remove both classes first, then apply the right one
  alertEl.className = "";
  alertEl.classList.add(type === "success" ? "alert--success" : "alert--error");
}

function clearAlert() {
  const alertEl = document.getElementById("alertMessage");
  if (!alertEl) return;
  alertEl.textContent = "";
  alertEl.className = "";
}


// ─────────────────────────────────────────────────
// ROLE MODAL HELPERS
// Uses aria-hidden to show/hide — keeps focus
// management accessible.
// ─────────────────────────────────────────────────
const roleModal       = document.getElementById("roleModal");
const confirmRoleBtn  = document.getElementById("confirmRoleBtn");

function openRoleModal() {
  roleModal.setAttribute("aria-hidden", "false");
  // Move focus to the modal so screen readers announce it
  confirmRoleBtn.focus();
}

function closeRoleModal() {
  roleModal.setAttribute("aria-hidden", "true");
}

// Close modal on backdrop click
roleModal.addEventListener("click", (e) => {
  if (e.target === roleModal) closeRoleModal();
});

// Close modal on Escape key
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && roleModal.getAttribute("aria-hidden") === "false") {
    closeRoleModal();
  }
});


// ─────────────────────────────────────────────────
// OAUTH SIGN-IN HANDLER
// Authenticates with the provider, then:
//   • Returning user  → straight to dashboard
//   • First-time user → show role modal, save after
// ─────────────────────────────────────────────────
async function handleOAuthSignIn(provider, providerName) {
  clearAlert();
  try {
    const result = await signInWithPopup(auth, provider);
    const user   = result.user;

    const userDoc = await getDoc(doc(db, "users", user.uid));

    if (userDoc.exists()) {
      // Returning user — profile already set up
      window.location.href = "dashboard.html";
      return;
    }

    // First-time user — hold state and ask for role
    pendingOAuthUser    = user;
    pendingProviderName = providerName;
    openRoleModal();

  } catch (error) {
    console.error(`${providerName} sign-in error:`, error);
    showAlert(error.message);
  }
}


// ─────────────────────────────────────────────────
// ROLE FORM SUBMISSION
// Reads the selected radio, writes to Firestore,
// then redirects to the dashboard.
// ─────────────────────────────────────────────────
const roleForm = document.getElementById("roleForm");

roleForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!pendingOAuthUser) return;

  // Read the selected role from the radio group
  const selectedRole = roleForm.elements["role"].value;

  confirmRoleBtn.disabled    = true;
  confirmRoleBtn.textContent = "Saving…";

  try {
    await setDoc(doc(db, "users", pendingOAuthUser.uid), {
      email:       pendingOAuthUser.email,
      displayName: pendingOAuthUser.displayName || "",
      role:        selectedRole,
      provider:    pendingProviderName,
      createdAt:   new Date().toISOString(),
    });

    // Clear pending state before navigating
    pendingOAuthUser    = null;
    pendingProviderName = null;

    window.location.href = "dashboard.html";

  } catch (error) {
    console.error("Error saving user profile:", error);
    showAlert("Failed to save your profile. Please try again.");
    confirmRoleBtn.disabled    = false;
    confirmRoleBtn.textContent = "Confirm & continue";
  }
});


// ─────────────────────────────────────────────────
// EMAIL / PASSWORD LOGIN
// ─────────────────────────────────────────────────
const loginForm = document.getElementById("loginForm");

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearAlert();

  const email    = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user           = userCredential.user;

    if (!user.emailVerified) {
      showAlert(
        "Please verify your email before signing in. Check your inbox for the verification link."
      );
      await auth.signOut();
      return;
    }

    window.location.href = "dashboard.html";

  } catch (error) {
    console.error("Email login error:", error);
    showAlert(error.message);
  }
});


// ─────────────────────────────────────────────────
// OAUTH BUTTON BINDINGS
// ─────────────────────────────────────────────────
const googleBtn = document.getElementById("googleLoginBtn");
if (googleBtn) {
  googleBtn.addEventListener("click", () => {
    handleOAuthSignIn(new GoogleAuthProvider(), "google");
  });
}

const githubBtn = document.getElementById("githubLoginBtn");
if (githubBtn) {
  githubBtn.addEventListener("click", () => {
    handleOAuthSignIn(new GithubAuthProvider(), "github");
  });
}

const microsoftBtn = document.getElementById("microsoftLoginBtn");
if (microsoftBtn) {
  microsoftBtn.addEventListener("click", () => {
    const provider = new OAuthProvider("microsoft.com");
    handleOAuthSignIn(provider, "microsoft");
  });
}
