import { defineConfig, devices } from "@playwright/test";

/**
 * Runs against an already-running stack (`make up` plus `make web`) rather
 * than starting one. Starting Postgres and MinIO from a test runner would
 * duplicate what the Makefile already does, and the demo machine has the stack
 * up anyway.
 *
 * PWDEBUG-style headed runs are driven by HEADED=1 / SLOWMO, which the
 * `make preflight` and `make demo` targets set.
 */
const headed = process.env["HEADED"] === "1";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  // The specs share one database and one document; running them at once would
  // have them signing and tampering out from under each other.
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: process.env["APP_URL"] ?? "http://localhost:3000",
    headless: !headed,
    launchOptions: {
      slowMo: Number(process.env["SLOWMO"] ?? (headed ? 400 : 0)),
    },
    viewport: { width: 1200, height: 1000 },
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
