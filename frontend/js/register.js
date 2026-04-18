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
  GoogleAuthProvider, 
  GithubAuthProvider,
  signInWithPopup 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// STEP 3: Import Firestore functions
// doc = reference to a specific document, setDoc = create/update, getDoc = read
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Just to verify the script is loading properly
console.log("register is running");

// STEP 4: Helper function that handles ALL OAuth sign-ins (Google, GitHub, LinkedIn)
// I made this to avoid repeating the same code for each provider
// provider = the OAuth service (Google, GitHub, etc.), providerName = just a label
async function handleOAuthSignIn(provider, providerName) {
  try {
    // Opens a popup window for the user to sign in with their chosen account
    const result = await signInWithPopup(auth, provider);
    const user = result.user;  // Firebase gives us the user object
    
    // Check if this user already exists in our Firestore database
    const userDoc = await getDoc(doc(db, "users", user.uid));
    
    if (!userDoc.exists()) {
      // FIRST TIME USER: Ask them to choose a role
      const role = prompt("Select your role: Member, Treasurer, or Admin");
      
      // Validate that they picked a valid role
      if (role && ["Member", "Treasurer", "Admin"].includes(role)) {
        // Save their info to Firestore so other pages know their role
        await setDoc(doc(db, "users", user.uid), {
          email: user.email,
          displayName: user.displayName || "",
          role: role,
          provider: providerName,  // Track which OAuth they used
          createdAt: new Date().toISOString()  // Timestamp for record keeping
        });
        alert("Account created successfully!");
        window.location.href = "dashboard.html";  // Send them to the main app
      } else {
        // They picked an invalid role - delete the auth account to keep things clean
        await user.delete();
        alert("Invalid role selection. Registration cancelled.");
        return;
      }
    } else {
      // RETURNING USER: Just welcome them back and redirect
      alert("Welcome back!");
      window.location.href = "dashboard.html";
    }
    
  } catch (error) {
  console.error(`${providerName} error:`, error);
  //When a user is trying to register with a github account that already exists
  if (error.code === 'auth/account-exists-with-different-credential') {
    alert('An account already exists with this email.Redirecting you to login....');
    window.location.href = "login.html";
  } else {
    alert(error.message);
  }
}
}

// STEP 5: EMAIL/PASSWORD REGISTRATION (traditional signup)
const form = document.getElementById("registerForm");

if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();  // Stop the page from refreshing

    // Grab the values the user typed into the form
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;
    const role = document.getElementById("role").value;  // From dropdown

    try {
      // Create the account in Firebase Authentication
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Store their role in Firestore (same as OAuth users)
      await setDoc(doc(db, "users", user.uid), {
        email: email,
        role: role,
        provider: "email",  // Mark that they used email/password, not OAuth
        createdAt: new Date().toISOString()
      });

      alert("User registered successfully!");
      window.location.href = "login.html";  // Send them to login page (not dashboard because they need to sign in)

    } catch (error) {
      alert(error.message);  // Show error like "email already exists" or "weak password"
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

// STEP 8: LINKEDIN OAUTH BUTTON
// NOTE: LinkedIn requires extra setup in Firebase Console (OpenID Connect)
// The code is ready but won't work until a teammate adds the credentials
const linkedinBtn = document.getElementById("linkedinRegisterBtn");
if (linkedinBtn) {
  linkedinBtn.addEventListener("click", () => {
    const provider = new OAuthProvider("linkedin.com");
    handleOAuthSignIn(provider, "linkedin");
  });
}