import { auth } from "./firebase-config";
import { onAuthStateChanged } from "firebase/auth";

onAuthStateChanged(auth, (user) => {
  if (user) {
    console.log("User logged in:", user.email);

    // 👉 Redirect to dashboard if on login page
    if (window.location.pathname.includes("login")) {
      window.location.href = "/dashboard.html";
    }

  } else {
    console.log("No user logged in");

    // 👉 Redirect to login if not authenticated
  //  if (!window.location.pathname.includes("login")) {
   //   window.location.href = "/login.html";
  //  }
  }
});