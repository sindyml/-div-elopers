// js/mock-payment.js

import { auth, db } from "./firebase-config.js";

import {
  collection,
  addDoc,
  doc,
  getDoc,
  updateDoc,
  increment,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ============================================
// ELEMENTS
// ============================================

const paymentForm =
  document.getElementById("paymentForm");

const paymentMessage =
  document.getElementById("paymentMessage");

// ============================================
// GET GROUP ID FROM URL
// Example:
// mock-payment.html?groupId=abc123
// ============================================

const params =
  new URLSearchParams(window.location.search);

const groupId =
  params.get("groupId");

// ============================================
// AUTH CHECK
// ============================================

auth.onAuthStateChanged((user) => {

  if (!user) {

    window.location.href =
      "login.html";
  }
});

// ============================================
// PAYMENT SUBMIT
// ============================================

paymentForm.addEventListener(
  "submit",
  async (e) => {

    e.preventDefault();

    const user =
      auth.currentUser;

    if (!user) {

      paymentMessage.textContent =
        "Please log in.";

      return;
    }

    // ========================================
    // FORM VALUES
    // ========================================

    const cardName =
      document.getElementById("cardName")
        .value
        .trim();

    const cardNumber =
      document.getElementById("cardNumber")
        .value
        .trim();

    const expiry =
      document.getElementById("expiry")
        .value
        .trim();

    const cvv =
      document.getElementById("cvv")
        .value
        .trim();

    // ========================================
    // BASIC VALIDATION
    // ========================================

    if (
      !cardName ||
      !cardNumber ||
      !expiry ||
      !cvv
    ) {

      paymentMessage.textContent =
        "Please complete all payment fields.";

      return;
    }

    if (cardNumber.length < 16) {

      paymentMessage.textContent =
        "Invalid card number.";

      return;
    }

    if (cvv.length < 3) {

      paymentMessage.textContent =
        "Invalid CVV.";

      return;
    }

    // ========================================
    // SHOW LOADING MESSAGE
    // ========================================

    paymentMessage.textContent =
      "⏳ Processing payment...";

    // Disable button while processing
    const submitButton =
      paymentForm.querySelector("button");

    submitButton.disabled = true;

    // ========================================
    // SIMULATE PAYMENT DELAY
    // ========================================

    setTimeout(async () => {

      try {

        // ====================================
        // RANDOM SUCCESS / FAILURE
        // 80% SUCCESS RATE
        // ====================================

        const success =
          Math.random() > 0.2;

        // ====================================
        // TRANSACTION AMOUNT
        // ====================================

        let amount = 500;

        // Optional:
        // Fetch group contribution amount
        if (groupId) {

          const groupDoc =
            await getDoc(
              doc(db, "groups", groupId)
            );

          if (groupDoc.exists()) {

            amount =
              groupDoc.data()
                .contributionAmount || 500;
          }
        }

        // ====================================
        // CREATE TRANSACTION
        // ====================================

        await addDoc(
          collection(db, "transactions"),
          {

            userId: user.uid,

            groupId: groupId || null,

            amount,

            paymentMethod:
              "mock-card",

            status: success
              ? "completed"
              : "failed",

            createdAt:
              serverTimestamp()
          }
        );

        // ====================================
        // UPDATE GROUP BALANCE
        // ONLY IF PAYMENT SUCCEEDED
        // ====================================

        if (
          success &&
          groupId
        ) {

          await updateDoc(
            doc(db, "groups", groupId),
            {
              totalBalance:
                increment(amount)
            }
          );
        }

        // ====================================
        // SUCCESS / FAILURE MESSAGE
        // ====================================

        if (success) {

          paymentMessage.textContent =
            `✅ Payment successful! R${amount} contribution recorded.`;

        } else {

          paymentMessage.textContent =
            "❌ Payment failed. Please try again.";
        }

        // ====================================
        // REDIRECT BACK TO DASHBOARD
        // ====================================

        setTimeout(() => {

          window.location.href =
            "dashboard.html";

        }, 2500);

      } catch (err) {

        console.error(
          "Payment Error:",
          err
        );

        paymentMessage.textContent =
          "❌ An unexpected error occurred.";

      } finally {

        submitButton.disabled =
          false;
      }

    }, 2000);
  }
);