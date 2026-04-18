// frontend/js/forgot-password.js
import { auth } from "./firebase-config.js";
import { sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const form = document.getElementById("resetForm");
const alertDiv = document.getElementById("alertMessage");

function showAlert(message, type) {
  alertDiv.textContent = message;
  alertDiv.className = `alert alert--${type}`;
  setTimeout(() => {
    alertDiv.className = "alert alert--hidden";
  }, 5000);
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  
  const email = document.getElementById("email").value;
  const submitBtn = form.querySelector('button[type="submit"]');
  
  submitBtn.disabled = true;
  submitBtn.textContent = "Sending...";

  try {
    await sendPasswordResetEmail(auth, email);
    showAlert("Password reset email sent! Check your inbox.", "success");
    form.reset();
  } catch (error) {
    let message = error.message;
    if (error.code === "auth/user-not-found") {
      message = "No account found with this email address.";
    } else if (error.code === "auth/invalid-email") {
      message = "Please enter a valid email address.";
    }
    showAlert(message, "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Send reset email";
  }
});