import { expect, test } from "@playwright/test";

/**
 * The pre-demo checks from docs/demo-script.md, run as a test instead of by
 * hand. `make preflight` runs this headed and slowed so the presenter watches
 * each check happen rather than trusting a green tick.
 *
 * It asserts the state the demo STARTS from - a seeded document with nothing
 * signed - so a stack left dirty from a rehearsal fails here rather than
 * halfway through the walkthrough.
 */

const MINIO_CONSOLE =
  process.env["MINIO_CONSOLE_URL"] ?? "http://localhost:9001";

test.describe("pre-flight", () => {
  test("the app is up and serving the seeded document", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "services-agreement.txt" }),
    ).toBeVisible();

    // The fee the whole demo turns on. If this is already $90,000 the stack is
    // dirty from a previous run - `make clean && make up`.
    await expect(page.locator(".doc")).toContainText("$10,000");
    await expect(page.locator(".doc")).not.toContainText("$90,000");

    // A live SHA-256, not a placeholder.
    await expect(page.getByText(/sha256 [0-9a-f]{64}/)).toBeVisible();
  });

  test("nothing is signed yet", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: /SIGNATURES \(0\)/i }),
    ).toBeVisible();
    await expect(page.getByText("Nothing signed yet")).toBeVisible();
  });

  test("the audit chain is intact", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.locator(".badge", { hasText: "CHAIN INTACT" }),
    ).toBeVisible();
  });

  test("the signing controls are ready", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("canvas")).toBeVisible();
    // Disabled until something is drawn - blank canvases must not be signable.
    await expect(page.getByRole("button", { name: "Sign document" })).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Tamper with document" }),
    ).toBeEnabled();
  });

  test("the MinIO console is reachable", async ({ page }) => {
    const response = await page.goto(MINIO_CONSOLE, { waitUntil: "commit" });
    expect(response?.status(), `MinIO console at ${MINIO_CONSOLE}`).toBeLessThan(
      400,
    );
  });
});
