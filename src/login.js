import { login, loginWithGoogle} from "/src/auth.js";
import { isValidPassword } from "./validation.js";


export function setupLogin() {
  const loginBtn = document.getElementById("loginBtn");
  const googleBtn = document.getElementById("googleBtn");

  if (loginBtn) {
    loginBtn.addEventListener("click", async () => {
      const email = document.getElementById("email").value;
      const password = document.getElementById("password").value;

      if (!isValidPassword(password)) {
        alert("Password must be at least 6 characters");
        return;
      }

      try {
        await login(email, password);
        window.location.href = "/dashboard.html";
      } catch (err) {
        alert(err.message);
      }
    });
  }

  if (googleBtn) {
    googleBtn.addEventListener("click", async () => {
      try {
        await loginWithGoogle();
        window.location.href = "/dashboard.html";
      } catch (err) {
        alert(err.message);
      }
    });
  }
}

// 🔥 THIS WAS MISSING
setupLogin();