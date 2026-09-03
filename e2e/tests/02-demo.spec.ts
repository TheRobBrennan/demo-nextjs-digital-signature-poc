import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * The demo walkthrough from docs/demo-script.md, executed.
 *
 * This is both the smoke test and the rehearsal: `make demo` runs it headed
 * and slowed so a presenter can watch the whole thing, and CI runs it headless.
 * If the script in the docs changes, change this in the same commit - they are
 * two views of one thing.
 *
 * Assumes a freshly seeded stack (`make clean && make up`), which is why
 * `make test-e2e` resets one first. It signs and then tampers, so it leaves
 * the stack dirty by design - reset before presenting. The numeric filename
 * prefixes keep 01-preflight (which asserts a clean stack) ahead of this one.
 */

/** Draws on the signature canvas with real pointer input. */
async function drawSignature(page: Page): Promise<void> {
  const canvas = page.locator("canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("signature canvas has no layout box");

  const strokes = [
    [
      [0.06, 0.75],
      [0.13, 0.35],
      [0.19, 0.2],
      [0.25, 0.55],
      [0.31, 0.8],
    ],
    [
      [0.36, 0.7],
      [0.42, 0.3],
      [0.48, 0.65],
      [0.54, 0.25],
      [0.6, 0.68],
    ],
    [
      [0.26, 0.5],
      [0.69, 0.48],
    ],
  ];

  for (const stroke of strokes) {
    const [first, ...rest] = stroke;
    await page.mouse.move(
      box.x + box.width * first![0]!,
      box.y + box.height * first![1]!,
    );
    await page.mouse.down();
    for (const [x, y] of rest) {
      await page.mouse.move(box.x + box.width * x!, box.y + box.height * y!);
    }
    await page.mouse.up();
  }
}

test("the whole argument: sign, then tamper", async ({ page }) => {
  await page.goto("/");

  // 1. The document, with the fee the demo turns on.
  await expect(page.locator(".doc")).toContainText("$10,000");
  const signedOverHash = (
    await page.getByText(/sha256 [0-9a-f]{64}/).innerText()
  ).replace("sha256 ", "");

  // 2. Sign it.
  await expect(page.getByRole("button", { name: "Sign document" })).toBeDisabled();
  await drawSignature(page);
  await expect(page.getByRole("button", { name: "Sign document" })).toBeEnabled();
  await page.getByRole("button", { name: "Sign document" }).click();

  await expect(page.locator(".badge.ok", { hasText: "VERIFIED" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /SIGNATURES \(1\)/i }),
  ).toBeVisible();

  // 3. What was actually signed - the payload, not the picture.
  await expect(page.getByText("DOCUMENT HASH SIGNED OVER")).toBeVisible();
  await expect(page.getByText("STROKES HASH")).toBeVisible();

  // 4. Tamper. The signature record is not touched.
  await page.getByRole("button", { name: "Tamper with document" }).click();

  // Scoped to the badge: "TAMPERED" also appears as the document.tampered
  // row in the audit table.
  await expect(page.locator(".badge.bad", { hasText: "TAMPERED" })).toBeVisible();
  await expect(page.locator(".doc")).toContainText("$90,000");
  await expect(
    page.getByText("The document no longer matches what was signed."),
  ).toBeVisible();

  // The hash it was signed over is still reported, next to what is there now.
  await expect(page.getByText(`signed over: ${signedOverHash}`)).toBeVisible();

  // 5. The audit log recorded the tampering, and the chain still verifies -
  // the log is honest about what happened to the document.
  await expect(page.getByText("document.tampered")).toBeVisible();
  await expect(
    page.locator(".badge", { hasText: "CHAIN INTACT" }),
  ).toBeVisible();
});

test("a blank canvas cannot be signed", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Sign document" })).toBeDisabled();
});
