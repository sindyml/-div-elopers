// js/register.js

// STEP 1: Import Firebase services
// auth = handles user login/signup, db = Firestore database for storing user roles
import { auth, db } from "./firebase-config.js";

// STEP 2: Import specific auth functions we need
// createUserWithEmailAndPassword = email/password signup
// GoogleAuthProvider, GithubAuthProvider = OAuth providers
// signInWithPopup = opens popup window for OAuth login
import { 
  createUserWithEmailAndPassword, 
  sendEmailVerification,
  updateProfile,
  GoogleAuthProvider, 
  GithubAuthProvider,
  OAuthProvider,
  signInWithPopup 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// STEP 3: Import Firestore functions
// doc = reference to a specific document, setDoc = create/update, getDoc = read
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Just to verify the script is loading properly
console.log("register is running");

// STEP 4: Helper function that handles ALL OAuth sign-ins (Google, GitHub, Microsoft)
async function handleOAuthSignIn(provider, providerName) {
  try {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    
    // Check if this user already exists in our Firestore database
    const userDoc = await getDoc(doc(db, "users", user.uid));
    
    if (!userDoc.exists()) {
      // Get name from OAuth or ask for it
      let displayName = user.displayName || "";
      
      if (!displayName) {
        displayName = prompt("Please enter your full name:");
        if (!displayName) {
          await user.delete();
          alert("Name required. Registration cancelled.");
          return;
        }
      }
      
      // Always assign 'Member' role for new OAuth registrations (security fix)
      // Admins can upgrade roles later through admin panel
      await setDoc(doc(db, "users", user.uid), {
        email: user.email,
        displayName: displayName,
        role: 'Member',
        provider: providerName,
        createdAt: new Date().toISOString()
      });
      alert("Account created successfully!");
      window.location.href = "dashboard.html";
    } else {
      // RETURNING USER: Just welcome them back and redirect
      alert("Welcome back!");
      window.location.href = "dashboard.html";
    }
    
  } catch (error) {
    console.error(`${providerName} error:`, error);
    
    // Case 1: Account already exists with different provider
    if (error.code === 'auth/account-exists-with-different-credential') {
      alert('An account already exists with this email. Redirecting you to login...');
      window.location.href = "login.html";
    } 
    // Case 2: Firebase config not found (Azure endpoint missing)
    else if (error.code === 'auth/configuration-not-found' || error.message.includes('config')) {
      alert('Firebase configuration error. Please contact support.');
      console.error('Firebase config issue - check /api/getFirebaseConfig endpoint');
    }
    // Case 3: Popup closed by user
    else if (error.code === 'auth/popup-closed-by-user') {
      alert('Sign in cancelled. Please try again.');
    }
    // Case 4: Everything else
    else {
      alert(error.message);
    }
  }
}

// STEP 5: EMAIL/PASSWORD REGISTRATION (traditional signup)
// EMAIL/PASSWORD REGISTRATION
const form = document.getElementById("registerForm");

if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;
    const displayName = document.getElementById("displayName").value;
    const role = document.getElementById("role").value;

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Update Firebase Auth profile with display name
      await updateProfile(user, { displayName: displayName });

      // Send verification email
      await sendEmailVerification(user);

      // Save to Firestore
      await setDoc(doc(db, "users", user.uid), {
        email: email,
        displayName: displayName,
        role: role,
        provider: "email",
        emailVerified: false,
        createdAt: new Date().toISOString()
      });

      alert("Registration successful! Please check your email to verify your account.");
      window.location.href = "login.html";

    } catch (error) {
      alert(error.message);
    }
  });
}

// STEP 6: GOOGLE OAUTH BUTTON
const googleBtn = document.getElementById("googleRegisterBtn");
if (googleBtn) {
  googleBtn.addEventListener("click", () => {
    handleOAuthSignIn(new GoogleAuthProvider(), "google");
  });
}

// STEP 7: GITHUB OAUTH BUTTON
const githubBtn = document.getElementById("githubRegisterBtn");
if (githubBtn) {
  githubBtn.addEventListener("click", () => {
    handleOAuthSignIn(new GithubAuthProvider(), "github");
  });
}

