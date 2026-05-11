// playwright.config.js
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  // ── Point this at wherever your E2E specs live ──────────────────────────────
  // Your logs show tests are in an "E2E" folder, not "tests"
  testDir: "./E2E",

  timeout: 30_000,       // per-test timeout
  retries: 1,            // 1 retry on CI; set to 0 locally while debugging
  reporter: [["html", { open: "never" }], ["list"]],

  use: {
    // All page.goto("/login.html") calls resolve against this
    baseURL: "http://localhost:8080",
    headless: true,
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    trace:  "retain-on-failure",
  },

  // ── Spin up a static file server automatically before any test runs ─────────
  // This serves your project root (where login.html lives) on port 3000.
  // Playwright waits for the server to be ready before starting tests.
  webServer: {
    // "npx serve" ships with every Node install — zero config needed.
    // "." means serve the current directory (your project root).
    // Change "." to the folder that contains login.html if it's in a sub-folder,
    // e.g.: "npx serve ./public" or "npx serve ./src"
    command: "npx serve . --listen 8080 --no-clipboard",
    url: "http://localhost:8080",
    reuseExistingServer: true,   // don't restart if you already have one running
    timeout: 15_000,             // wait up to 15s for the server to boot
  },

  projects: [
    { name: "chromium",      use: { ...devices["Desktop Chrome"]  } },
    { name: "firefox",       use: { ...devices["Desktop Firefox"] } },
    { name: "webkit",        use: { ...devices["Desktop Safari"]  } },
    { name: "mobile-chrome", use: { ...devices["Pixel 5"]        } },
    { name: "mobile-safari", use: { ...devices["iPhone 12"]      } },
  ],
});