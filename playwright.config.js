// playwright.config.js
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  // ── Where your spec files live ───────────────────────────────────────────
  // Must match the actual folder name in your repo (case-sensitive on Linux/CI)
  testDir: "./e2e",

  // Glob that matches your spec files — covers .spec.js / .spec.ts
  testMatch: "**/*.spec.{js,ts}",

  timeout: 30_000,
  retries: 1,
  reporter: [["html", { open: "never" }], ["list"]],

  use: {
    baseURL: "http://localhost:8080",
    headless: true,
    screenshot: "only-on-failure",
    video:      "retain-on-failure",
    trace:      "retain-on-failure",
  },

  // ── Static file server ───────────────────────────────────────────────────
  // Uses http-server (lightweight, no install prompt, works reliably in CI).
  // Make sure to add it to devDependencies: npm install --save-dev http-server
  //
  // "." serves the project root. If login.html is in a sub-folder like
  // "frontend/", change "." to "./frontend" and update LOGIN_PATH in the spec.
  webServer: {
    command: "npx http-server . --port 8080 --silent",
    url: "http://localhost:8080",
    reuseExistingServer: !process.env.CI, // always start fresh on CI
    timeout: 20_000,
  },

  // ── Run only Chromium on CI to keep the workflow fast ────────────────────
  // The full 5-browser matrix runs locally. Set CI=true in the workflow env.
  projects: process.env.CI
    ? [
        { name: "chromium", use: { ...devices["Desktop Chrome"] } },
      ]
    : [
        { name: "chromium",      use: { ...devices["Desktop Chrome"]  } },
        { name: "firefox",       use: { ...devices["Desktop Firefox"] } },
        { name: "webkit",        use: { ...devices["Desktop Safari"]  } },
        { name: "mobile-chrome", use: { ...devices["Pixel 5"]        } },
        { name: "mobile-safari", use: { ...devices["iPhone 12"]      } },
      ],
});