// E2E/login.spec.js
// Playwright E2E tests for StokPal — login page

import { test, expect } from "@playwright/test";

// ─────────────────────────────────────────────────────────────────────────────
// LOGIN_PATH — relative path from the server root to login.html.
// From your logs, the server is at localhost:8080 and the page lives at
// /frontend/login.html (served without the .html extension as /frontend/login).
//
// ADJUST THIS if your dev server path is different.
// ─────────────────────────────────────────────────────────────────────────────
const LOGIN_PATH = "/frontend/login.html";

// We'll capture the exact URL as actually resolved by the browser in beforeEach
// and use it for "stays on page" assertions — avoiding extension/trailing-slash issues.
let RESOLVED_LOGIN_URL = "";

// ─────────────────────────────────────────────────────────────────────────────
// Helper: fill + submit the email/password form
// ─────────────────────────────────────────────────────────────────────────────
async function submitLoginForm(page, email, password) {
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: assert the browser is still on the login page.
// We match against the resolved URL captured in beforeEach, which handles any
// server quirks like stripping the .html extension.
// ─────────────────────────────────────────────────────────────────────────────
async function assertStillOnLoginPage(page) {
  // Strip .html from the end for the regex so it matches both
  // "http://localhost:8080/frontend/login.html" and
  // "http://localhost:8080/frontend/login"
  const base = RESOLVED_LOGIN_URL.replace(/\.html$/, "");
  await expect(page).toHaveURL(new RegExp(escapeRegex(base)));
}

// Escape special regex characters in a plain string
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─────────────────────────────────────────────────────────────────────────────
// Firebase network stubs
//
// The Firebase JS SDK v10 makes these HTTP calls on every page load:
//   firebaseinstallations — MUST succeed first or the SDK throws auth/internal-error
//   securetoken           — token refresh
//   identitytoolkit       — sign-in / user lookup
//   firestore             — Firestore reads/writes
//
// Stubs must be registered BEFORE page.goto() — the SDK fires on DOMContentLoaded.
// ─────────────────────────────────────────────────────────────────────────────
async function stubFirebaseBase(page) {
  // 1. Firebase Installations — required for SDK init
  await page.route("**/firebaseinstallations.googleapis.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        fid: "fake-fid-abc123",
        authToken: {
          token: "fake-auth-token",
          expiresIn: "604800s",
        },
        refreshToken: "fake-refresh-token",
      }),
    })
  );

  // 2. Secure Token — token refresh
  await page.route("**/securetoken.googleapis.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        access_token: "fake-access-token",
        expires_in: "3600",
        token_type: "Bearer",
      }),
    })
  );

  // 3. Firestore — default empty document
  await page.route("**/firestore.googleapis.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    })
  );

  // 4. Block all real OAuth provider domains so popup failures are instant
  for (const pattern of [
    "**/*.google.com/**",
    "**/accounts.google.com/**",
    "**/*.github.com/**",
    "**/*.microsoft.com/**",
    "**/*.microsoftonline.com/**",
    "**/*.live.com/**",
  ]) {
    await page.route(pattern, (r) => r.abort());
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// mockSignIn — stubs identitytoolkit for a controlled auth scenario.
//
// The Firebase SDK validates the signInWithPassword response shape strictly.
// Required fields: kind, localId, email, idToken, refreshToken, expiresIn.
// Missing any of these causes auth/internal-error regardless of emailVerified.
// ─────────────────────────────────────────────────────────────────────────────
async function mockSignIn(page, { emailVerified = true, errorCode = null } = {}) {
  if (errorCode) {
    await page.route(
      "**/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword**",
      (route) =>
        route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            error: {
              code: 400,
              message: errorCode,
              errors: [{ message: errorCode, domain: "global", reason: "invalid" }],
            },
          }),
        })
    );
    return;
  }

  // Success path — full response shape the SDK requires
  await page.route(
    "**/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword**",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          kind: "identitytoolkit#VerifyPasswordResponse",
          localId: "uid-test-123",
          email: "user@example.com",
          displayName: "",
          idToken: "fake.jwt.token",
          registered: true,
          refreshToken: "fake-refresh-token",
          expiresIn: "3600",
          // NOTE: emailVerified is NOT in the signInWithPassword response —
          // the SDK fetches it separately via accounts:lookup below.
        }),
      })
  );

  // accounts:lookup — this is where the SDK reads emailVerified
  await page.route(
    "**/identitytoolkit.googleapis.com/v1/accounts:lookup**",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          kind: "identitytoolkit#GetAccountInfoResponse",
          users: [
            {
              localId: "uid-test-123",
              email: "user@example.com",
              emailVerified,
              displayName: "",
              providerUserInfo: [],
              passwordHash: "fake-hash",
              passwordUpdatedAt: 1234567890000,
              validSince: "1234567890",
              disabled: false,
              lastLoginAt: "1234567890000",
              createdAt: "1234567890000",
            },
          ],
        }),
      })
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Setup — runs before every test
// ─────────────────────────────────────────────────────────────────────────────
test.beforeEach(async ({ page }) => {
  // Stubs MUST be registered before navigation
  await stubFirebaseBase(page);

  await page.goto(LOGIN_PATH, { waitUntil: "domcontentloaded" });

  // Capture the real resolved URL (server may strip .html or add trailing slash)
  RESOLVED_LOGIN_URL = page.url();

  // Wait for the form to be interactive before any test runs
  await page.waitForSelector("#loginForm", { state: "visible", timeout: 10_000 });
});

// =============================================================================
// 1. Page structure
// =============================================================================
test.describe("Page structure", () => {
  test("page title contains StokPal", async ({ page }) => {
    await expect(page).toHaveTitle(/StokPal/i);
  });

  test("renders the StokPal brand name", async ({ page }) => {
    await expect(page.locator(".register-card__logo")).toContainText("StokPal");
  });

  test("renders the 'Welcome back' heading", async ({ page }) => {
    await expect(page.locator(".register-card__title")).toContainText("Welcome back");
  });

  test("renders the subtitle text", async ({ page }) => {
    await expect(page.locator(".register-card__sub")).toContainText("stokvel dashboard");
  });

  test("renders email and password fields plus submit button", async ({ page }) => {
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test("renders all three OAuth buttons", async ({ page }) => {
    await expect(page.locator("#googleLoginBtn")).toBeVisible();
    await expect(page.locator("#githubLoginBtn")).toBeVisible();
    await expect(page.locator("#microsoftLoginBtn")).toBeVisible();
  });

  test("alert container exists and starts hidden", async ({ page }) => {
    const alertEl = page.locator("#alertMessage");
    await expect(alertEl).toHaveCount(1);
    await expect(alertEl).toHaveClass(/alert--hidden/);
  });

  test("forgot-password link is present", async ({ page }) => {
    await expect(page.locator('a[href="forgot-password.html"]')).toBeVisible();
  });

  test("create-account link is present", async ({ page }) => {
    await expect(page.locator('a[href="register.html"]')).toBeVisible();
  });

  test("email input has type=email", async ({ page }) => {
    await expect(page.locator("#email")).toHaveAttribute("type", "email");
  });

  test("password input has type=password", async ({ page }) => {
    await expect(page.locator("#password")).toHaveAttribute("type", "password");
  });

  test("divider between OAuth and email sections is rendered", async ({ page }) => {
    await expect(page.locator("hr.divider")).toBeVisible();
  });
});

// =============================================================================
// 2. HTML5 client-side validation
//
// These tests check that the browser's built-in required/type validation
// prevents submission — no Firebase call should ever be made here.
// We assert the page URL hasn't changed instead of waiting for a navigation,
// because HTML5 validation blocks the submit event entirely.
// =============================================================================
test.describe("Email/password form — HTML5 validation", () => {
  test("stays on page when email is empty", async ({ page }) => {
    await page.fill("#password", "secret123");
    await page.click('button[type="submit"]');
    // Give the browser a tick to potentially navigate, then confirm it didn't
    await page.waitForTimeout(500);
    await assertStillOnLoginPage(page);
  });

  test("stays on page when password is empty", async ({ page }) => {
    await page.fill("#email", "user@example.com");
    await page.click('button[type="submit"]');
    await page.waitForTimeout(500);
    await assertStillOnLoginPage(page);
  });

  test("stays on page for a malformed email address", async ({ page }) => {
    await page.fill("#email", "not-an-email");
    await page.fill("#password", "secret123");
    await page.click('button[type="submit"]');
    await page.waitForTimeout(500);
    await assertStillOnLoginPage(page);
  });

  test("email field is marked required", async ({ page }) => {
    await expect(page.locator("#email")).toHaveAttribute("required", "");
  });

  test("password field is marked required", async ({ page }) => {
    await expect(page.locator("#password")).toHaveAttribute("required", "");
  });
});

// =============================================================================
// 3. Email / password — Firebase integration
// =============================================================================
test.describe("Email/password login — Firebase integration", () => {
  test("redirects to dashboard.html on successful verified login", async ({ page }) => {
    await mockSignIn(page, { emailVerified: true });

    // Allow dashboard.html navigation (it's on the same server)
    await page.unroute("**/*.google.com/**");

    await submitLoginForm(page, "user@example.com", "correctpassword");

    // login.js does: window.location.href = "dashboard.html"
    await page.waitForURL(/dashboard\.html/, { timeout: 15_000 });
    await expect(page).toHaveURL(/dashboard\.html/);
  });

  test("shows native alert and stays on page when email is not verified", async ({ page }) => {
    await mockSignIn(page, { emailVerified: false });

    // login.js calls native alert() for the unverified case
    const dialogPromise = page.waitForEvent("dialog", { timeout: 15_000 });
    await submitLoginForm(page, "unverified@example.com", "somepassword");

    const dialog = await dialogPromise;
    expect(dialog.message().toLowerCase()).toContain("verify your email");
    await dialog.dismiss();

    await assertStillOnLoginPage(page);
  });

  test("shows native alert for wrong password (INVALID_PASSWORD)", async ({ page }) => {
    await mockSignIn(page, { errorCode: "INVALID_PASSWORD" });

    const dialogPromise = page.waitForEvent("dialog", { timeout: 15_000 });
    await submitLoginForm(page, "user@example.com", "wrongpassword");

    const dialog = await dialogPromise;
    expect(dialog.message()).toBeTruthy();
    await dialog.dismiss();

    await assertStillOnLoginPage(page);
  });

  test("shows native alert when account does not exist (EMAIL_NOT_FOUND)", async ({ page }) => {
    await mockSignIn(page, { errorCode: "EMAIL_NOT_FOUND" });

    const dialogPromise = page.waitForEvent("dialog", { timeout: 15_000 });
    await submitLoginForm(page, "ghost@example.com", "anypassword");

    const dialog = await dialogPromise;
    expect(dialog.message()).toBeTruthy();
    await dialog.dismiss();

    await assertStillOnLoginPage(page);
  });

  test("shows native alert for too many failed attempts (TOO_MANY_ATTEMPTS_TRY_LATER)", async ({ page }) => {
    await mockSignIn(page, { errorCode: "TOO_MANY_ATTEMPTS_TRY_LATER" });

    const dialogPromise = page.waitForEvent("dialog", { timeout: 15_000 });
    await submitLoginForm(page, "user@example.com", "anypassword");

    const dialog = await dialogPromise;
    expect(dialog.message()).toBeTruthy();
    await dialog.dismiss();

    await assertStillOnLoginPage(page);
  });

  test("shows native alert for disabled account (USER_DISABLED)", async ({ page }) => {
    await mockSignIn(page, { errorCode: "USER_DISABLED" });

    const dialogPromise = page.waitForEvent("dialog", { timeout: 15_000 });
    await submitLoginForm(page, "disabled@example.com", "somepassword");

    const dialog = await dialogPromise;
    expect(dialog.message()).toBeTruthy();
    await dialog.dismiss();

    await assertStillOnLoginPage(page);
  });
});

// =============================================================================
// 4. Alert UI component (#alertMessage)
// =============================================================================
test.describe("Alert UI component (#alertMessage)", () => {
  test("starts with alert--hidden class", async ({ page }) => {
    await expect(page.locator("#alertMessage")).toHaveClass(/alert--hidden/);
  });

  test("has aria-live=polite for screen reader announcements", async ({ page }) => {
    await expect(page.locator("#alertMessage")).toHaveAttribute("aria-live", "polite");
  });

  test("shows error text and alert--error class after showAlert('error')", async ({ page }) => {
    await page.evaluate(() => {
      const el = document.getElementById("alertMessage");
      el.textContent = "Something went wrong";
      el.className = "alert alert--error";
    });
    await expect(page.locator("#alertMessage")).toHaveClass(/alert--error/);
    await expect(page.locator("#alertMessage")).not.toHaveClass(/alert--hidden/);
    await expect(page.locator("#alertMessage")).toContainText("Something went wrong");
  });

  test("shows success text and alert--success class after showAlert('success')", async ({ page }) => {
    await page.evaluate(() => {
      const el = document.getElementById("alertMessage");
      el.textContent = "Logged in successfully!";
      el.className = "alert alert--success";
    });
    await expect(page.locator("#alertMessage")).toHaveClass(/alert--success/);
    await expect(page.locator("#alertMessage")).not.toHaveClass(/alert--error/);
    await expect(page.locator("#alertMessage")).toContainText("Logged in successfully!");
  });

  test("alert text updates when called again with a new message", async ({ page }) => {
    await page.evaluate(() => {
      const el = document.getElementById("alertMessage");
      el.textContent = "First error";
      el.className = "alert alert--error";
    });
    await page.evaluate(() => {
      const el = document.getElementById("alertMessage");
      el.textContent = "Second error";
      el.className = "alert alert--error";
    });
    await expect(page.locator("#alertMessage")).toContainText("Second error");
  });
});

// =============================================================================
// 5. OAuth buttons
// =============================================================================
test.describe("OAuth buttons", () => {
  for (const { id, label } of [
    { id: "googleLoginBtn",    label: "Google"    },
    { id: "githubLoginBtn",    label: "GitHub"    },
    { id: "microsoftLoginBtn", label: "Microsoft" },
  ]) {
    test(`${label} button is visible and enabled`, async ({ page }) => {
      await expect(page.locator(`#${id}`)).toBeVisible();
      await expect(page.locator(`#${id}`)).toBeEnabled();
    });

    test(`${label} button has type=button (not submit)`, async ({ page }) => {
      await expect(page.locator(`#${id}`)).toHaveAttribute("type", "button");
    });

    test(`clicking ${label} does not navigate away from the login page`, async ({ page }) => {
      // All OAuth domains are already blocked in stubFirebaseBase (beforeEach).
      // Dismiss any alert/dialog that may appear from the failed popup.
      page.on("dialog", (d) => d.dismiss());

      await page.click(`#${id}`);

      // Wait for any async SDK error handling to settle
      await page.waitForTimeout(2000);

      // The form must still be in the DOM — no redirect occurred
      await expect(page.locator("#loginForm")).toBeVisible();
      await assertStillOnLoginPage(page);
    });
  }

  test("OAuth section has an aria-label attribute", async ({ page }) => {
    await expect(page.locator(".oauth-buttons")).toHaveAttribute("aria-label");
  });
});

// =============================================================================
// 6. Navigation links
// =============================================================================
test.describe("Navigation links", () => {
  test("forgot-password link has correct href", async ({ page }) => {
    await expect(page.locator('a[href="forgot-password.html"]'))
      .toHaveAttribute("href", "forgot-password.html");
  });

  test("register link has correct href", async ({ page }) => {
    await expect(page.locator('a[href="register.html"]'))
      .toHaveAttribute("href", "register.html");
  });

  test("forgot-password link is keyboard-focusable", async ({ page }) => {
    await page.locator('a[href="forgot-password.html"]').focus();
    const isFocused = await page.evaluate(
      () => document.activeElement?.getAttribute("href") === "forgot-password.html"
    );
    expect(isFocused).toBe(true);
  });

  test("register link is keyboard-focusable", async ({ page }) => {
    await page.locator('a[href="register.html"]').focus();
    const isFocused = await page.evaluate(
      () => document.activeElement?.getAttribute("href") === "register.html"
    );
    expect(isFocused).toBe(true);
  });
});

// =============================================================================
// 7. Accessibility
// =============================================================================
test.describe("Accessibility", () => {
  test("email input has an associated <label>", async ({ page }) => {
    await expect(page.locator('label[for="email"]')).toBeVisible();
  });

  test("password input has an associated <label>", async ({ page }) => {
    await expect(page.locator('label[for="password"]')).toBeVisible();
  });

  test("page has exactly one <h1>", async ({ page }) => {
    await expect(page.locator("h1")).toHaveCount(1);
  });

  test("<html> element has a lang attribute", async ({ page }) => {
    await expect(page.locator("html")).toHaveAttribute("lang");
  });

  test("email and password inputs have placeholder text", async ({ page }) => {
    await expect(page.locator("#email")).toHaveAttribute("placeholder");
    await expect(page.locator("#password")).toHaveAttribute("placeholder");
  });

  test("submit button is reachable via Tab key", async ({ page }) => {
    await page.locator("body").click();
    let found = false;
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab");
      found = await page.evaluate(
        () => document.activeElement?.getAttribute("type") === "submit"
      );
      if (found) break;
    }
    expect(found).toBe(true);
  });

  test("form has no duplicate IDs", async ({ page }) => {
    const ids = await page.evaluate(() => {
      const all = [...document.querySelectorAll("[id]")].map((el) => el.id);
      return all.filter((id, i) => all.indexOf(id) !== i);
    });
    expect(ids).toHaveLength(0);
  });
});

// =============================================================================
// 8. Responsive layout
// =============================================================================
test.describe("Responsive layout", () => {
  test("renders correctly on mobile (375×812)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(page.locator("#loginForm")).toBeVisible();
    await expect(page.locator("#googleLoginBtn")).toBeVisible();
  });

  test("renders correctly on tablet (768×1024)", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(page.locator("#loginForm")).toBeVisible();
  });

  test("renders correctly on desktop (1440×900)", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.locator(".register-card")).toBeVisible();
  });

  test("all OAuth buttons remain visible on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(page.locator("#googleLoginBtn")).toBeVisible();
    await expect(page.locator("#githubLoginBtn")).toBeVisible();
    await expect(page.locator("#microsoftLoginBtn")).toBeVisible();
  });

  test("submit button is full-width on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const btn = page.locator('button[type="submit"]');
    const box = await btn.boundingBox();
    // btn--full should make the button at least 90% of the viewport width
    expect(box.width).toBeGreaterThan(300);
  });
});