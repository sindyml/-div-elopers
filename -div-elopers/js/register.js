// js/register.js
import { auth, db } from "./firebase-config.js";
import { 
  createUserWithEmailAndPassword, 
  GoogleAuthProvider, 
  GithubAuthProvider,
  signInWithPopup 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

console.log("register is running");

// Helper function to handle OAuth sign in
async function handleOAuthSignIn(provider, providerName) {
  try {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    
    const userDoc = await getDoc(doc(db, "users", user.uid));
    
    if (!userDoc.exists()) {
      const role = prompt("Select your role: Member, Treasurer, or Admin");
      
      if (role && ["Member", "Treasurer", "Admin"].includes(role)) {
        await setDoc(doc(db, "users", user.uid), {
          email: user.email,
          role: role,
          provider: providerName,
          createdAt: new Date().toISOString()
        });
        alert("Account created successfully!");
        window.location.href = "dashboard.html";
      } else {
        await user.delete();
        alert("Invalid role selection. Registration cancelled.");
        return;
      }
    } else {
      alert("Welcome back!");
      window.location.href = "dashboard.html";
    }
    
  } catch (error) {
    console.error(`${providerName} error:`, error);
    alert(error.message);
  }
}

// EMAIL/PASSWORD REGISTRATION
const form = document.getElementById("registerForm");

if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;
    const role = document.getElementById("role").value;

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      await setDoc(doc(db, "users", user.uid), {
        email: email,
        role: role,
        provider: "email",
        createdAt: new Date().toISOString()
      });

      alert("User registered successfully!");
      window.location.href = "login.html";

    } catch (error) {
      alert(error.message);
    }
  });
}

// GOOGLE OAUTH
const googleBtn = document.getElementById("googleRegisterBtn");
if (googleBtn) {
  googleBtn.addEventListener("click", () => {
    handleOAuthSignIn(new GoogleAuthProvider(), "google");
  });
}

// GITHUB OAUTH
const githubBtn = document.getElementById("githubRegisterBtn");
if (githubBtn) {
  githubBtn.addEventListener("click", () => {
    handleOAuthSignIn(new GithubAuthProvider(), "github");
  });
}

// LINKEDIN OAUTH
const linkedinBtn = document.getElementById("linkedinRegisterBtn");
if (linkedinBtn) {
  linkedinBtn.addEventListener("click", () => {
    // LinkedIn requires additional setup
    const provider = new OAuthProvider("linkedin.com");
    handleOAuthSignIn(provider, "linkedin");
  });
}