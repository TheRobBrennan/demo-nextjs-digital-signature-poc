/**
 * Regenerates the PR screenshots in assets/.
 *
 * Run it against the CONTAINERIZED app (`make up-full`), not `make web` - the
 * dev server paints a Next.js dev indicator into the corner of every capture,
 * which has no business in a PR.
 *
 * Full-page captures at deviceScaleFactor 2, so they are retina-sharp and
 * cropped to the content instead of padded with dead space.
 */
import { chromium } from '@playwright/test';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
await page.screenshot({ path: 'assets/ui-verified.png', fullPage: true });
console.log('captured ui-verified.png');
await page.getByRole('button', { name: 'Tamper with document' }).click();
await page.locator('.badge.bad', { hasText: 'TAMPERED' }).waitFor();
await page.waitForTimeout(500);
await page.screenshot({ path: 'assets/ui-tampered.png', fullPage: true });
console.log('captured ui-tampered.png');
await b.close();
