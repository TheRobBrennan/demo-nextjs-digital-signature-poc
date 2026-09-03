/**
 * The presenter's demo, as one command.
 *
 * Brings the stack up from nothing, starts the app, opens a browser the client
 * watches, and steps through the walkthrough one beat at a time - you press
 * Enter to advance, so the pacing is yours and there is no autoplay running
 * away from your narration.
 *
 * Each beat prints its talk track to the terminal (for you) and paints a
 * caption over the page (for them).
 *
 * Run it with `pnpm demo`. Ctrl-C at any point is safe; it tears down the app
 * process it started and leaves Docker running.
 */
import { chromium, type Browser, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const APP_URL = process.env["APP_URL"] ?? "http://localhost:3000";
const MINIO_URL = process.env["MINIO_CONSOLE_URL"] ?? "http://localhost:9001";
const REPO_URL =
  "https://github.com/TheRobBrennan/demo-nextjs-digital-signature-poc";

/**
 * Interactive when there is a terminal to type into, which is the real use.
 * Piped or redirected stdin (CI, a scripted rehearsal) auto-advances instead,
 * so the same script can run unattended - set STEP_DELAY to change the pace.
 */
const interactive = Boolean(stdin.isTTY);
const stepDelayMs = Number(process.env["STEP_DELAY"] ?? 4000);
const rl = interactive
  ? createInterface({ input: stdin, output: stdout })
  : undefined;
const started: ChildProcess[] = [];
let browser: Browser | undefined;

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

/** Runs a command with its output attached, and resolves on clean exit. */
function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${command} ${args.join(" ")} exited ${code}`)),
    );
  });
}

/** Runs a command and returns its output, for beats that show CLI evidence. */
function capture(command: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn(command, args);
    let out = "";
    child.stdout.on("data", (d) => (out += String(d)));
    child.stderr.on("data", (d) => (out += String(d)));
    // Non-zero is expected from `make verify` after tampering.
    child.on("exit", () => resolve(out));
  });
}

/** Reads the stored document's hash straight from object storage. */
async function storedHash(): Promise<string> {
  const out = await capture("node", [
    "--env-file=.env",
    "packages/adapters/scripts/inspect.ts",
  ]);
  return out.trim();
}

async function waitForApp(timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const response = await fetch(APP_URL, { signal: AbortSignal.timeout(2000) });
      if (response.ok) return;
    } catch {
      // not up yet
    }
    if (Date.now() > deadline) {
      throw new Error(`The app did not come up at ${APP_URL} within 60s`);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}

/**
 * Paints a caption over the page so the audience sees the point of the beat,
 * not just the presenter's cursor moving.
 */
async function caption(page: Page, title: string, detail: string): Promise<void> {
  await page.evaluate(
    ({ title, detail }) => {
      let bar = document.getElementById("__demo_caption");
      if (!bar) {
        bar = document.createElement("div");
        bar.id = "__demo_caption";
        Object.assign(bar.style, {
          position: "fixed",
          left: "0",
          right: "0",
          bottom: "0",
          zIndex: "2147483647",
          background: "rgba(10,12,16,.97)",
          borderTop: "2px solid #58a6ff",
          color: "#e6e9ef",
          padding: "14px 22px",
          maxHeight: "30vh",
          overflowY: "auto",
          font: '16px/1.5 ui-sans-serif, -apple-system, "Segoe UI", sans-serif',
          boxShadow: "0 -10px 30px rgba(0,0,0,.5)",
        });
        document.body.appendChild(bar);
      }
      // Reserve space so the caption never sits on top of page content.
      document.body.style.paddingBottom = "120px";
      bar.innerHTML = "";
      const h = document.createElement("div");
      h.textContent = title;
      Object.assign(h.style, {
        fontWeight: "700",
        color: "#58a6ff",
        fontSize: "13px",
        letterSpacing: ".08em",
        textTransform: "uppercase",
        marginBottom: "3px",
      });
      const p = document.createElement("div");
      p.textContent = detail;
      bar.append(h, p);
    },
    { title, detail },
  );
}

/**
 * Centres an element in the window rather than merely bringing it on screen.
 * `scrollIntoViewIfNeeded` is happy to leave a target flush against the bottom
 * edge, hidden behind the caption bar.
 */
async function scrollIntoMiddle(page: Page, text: string): Promise<void> {
  await page.getByText(text).first().evaluate((el) => {
    el.scrollIntoView({ block: "center", behavior: "smooth" });
  });
  await page.waitForTimeout(400);
}

/**
 * Blocks until the presenter is ready to move on. Auto-advances when stdin is
 * not a terminal, which is how the autoplay run works.
 */
async function waitForPresenter(indent = "     "): Promise<void> {
  if (interactive) {
    console.log(dim(`${indent}[Enter] to continue, q to quit, or just close the window`));
    abortSteps = new AbortController();
    let answer: string;
    try {
      answer = await rl!.question(indent, { signal: abortSteps.signal });
    } catch {
      // Aborted because the browser window was closed.
      throw new BrowserClosedSignal();
    }
    if (browserClosed) throw new BrowserClosedSignal();
    if (answer.trim().toLowerCase() === "q") throw new QuitSignal();
  } else {
    console.log(dim(`${indent}(auto-advancing in ${stepDelayMs}ms)`));
    await new Promise((r) => setTimeout(r, stepDelayMs));
  }
}

let beat = 0;

/** Prints the talk track, captions the page, and waits for Enter. */
async function step(
  page: Page,
  title: string,
  say: string,
  action?: () => Promise<void>,
): Promise<void> {
  beat++;
  console.log("");
  console.log(cyan(`  ${beat}. ${bold(title)}`));
  console.log(`     ${say}`);
  await waitForPresenter();

  await caption(page, title, say);
  if (action) await action();
}

class QuitSignal extends Error {}
/** The presenter closed the demo window. Treated as "we are done". */
class BrowserClosedSignal extends Error {}

/**
 * Resolves when the demo browser goes away, so a step waiting on Enter does
 * not sit there forever after the window is closed. Without this, closing the
 * window leaves the script blocked on stdin and the app still running.
 */
let abortSteps: AbortController | undefined;
function watchForBrowserClose(browser: Browser): void {
  browser.on("disconnected", () => {
    browserClosed = true;
    abortSteps?.abort();
  });
}
let browserClosed = false;

/** Draws a signature with real mouse input. */
async function drawSignature(page: Page): Promise<void> {
  const box = await page.locator("canvas").boundingBox();
  if (!box) throw new Error("no signature canvas on the page");

  const strokes = [
    [[0.06, 0.75], [0.13, 0.35], [0.19, 0.2], [0.25, 0.55], [0.31, 0.8]],
    [[0.36, 0.7], [0.42, 0.3], [0.48, 0.65], [0.54, 0.25], [0.6, 0.68]],
    [[0.26, 0.5], [0.69, 0.48]],
  ];

  for (const stroke of strokes) {
    const [first, ...rest] = stroke;
    await page.mouse.move(box.x + box.width * first![0]!, box.y + box.height * first![1]!);
    await page.mouse.down();
    for (const [x, y] of rest) {
      await page.mouse.move(box.x + box.width * x!, box.y + box.height * y!);
      await page.waitForTimeout(35);
    }
    await page.mouse.up();
    await page.waitForTimeout(120);
  }
}

async function main(): Promise<void> {
  console.log("");
  console.log(bold("  Digital signature demo"));
  console.log(dim("  Postgres, MinIO and the app all come up in Docker from nothing,"));
  console.log(dim("  then you drive the walkthrough. NATIVE=1 for a host dev server."));
  console.log("");

  // --- 1. Clean slate -------------------------------------------------------
  console.log(cyan("  Resetting Docker (containers, volumes, signing key)..."));
  await run("make", ["clean"]);

  // --- 2. The tests, before anything is running -----------------------------
  console.log("");
  console.log(cyan(`  ${bold("The domain suite, with nothing running")}`));
  console.log(
    "  packages/core has no I/O and no framework - no database, no object store,",
  );
  console.log(
    "  no browser. It is the rules about what makes a signature valid, and it is",
  );
  console.log("  provable on its own. Docker is not even up yet.");
  console.log("");
  await run("make", ["test-unit"]);
  await waitForPresenter("  ");

  // --- 3. Everything in containers ------------------------------------------
  // NATIVE=1 falls back to a dev server on the host, which is faster to
  // iterate on but is not the thing being demonstrated.
  if (process.env["NATIVE"] === "1") {
    console.log(cyan("  Starting Postgres and MinIO, applying schema, seeding..."));
    await run("make", ["up"]);
    console.log(cyan("  Starting the app (native dev server)..."));
    // Own process group, so the dev server and its children can all be stopped.
    const web = spawn("make", ["web"], { stdio: "ignore", detached: true });
    started.push(web);
  } else {
    console.log(
      cyan("  Building and starting Postgres, MinIO and the app - all containers..."),
    );
    await run("make", ["up-full"]);
  }

  await waitForApp();
  console.log(green(`  App ready at ${APP_URL}`));
  if (process.env["NATIVE"] !== "1") {
    const containers = await capture("docker", [
      "compose",
      "--env-file",
      ".env",
      "-f",
      "infra/docker-compose.yml",
      "--profile",
      "full",
      "ps",
      "--format",
      "{{.Service}} :: {{.Status}}",
    ]);
    for (const line of containers.split("\n").filter(Boolean)) {
      console.log(dim(`    ${line}`));
    }
  }

  // --- 4. The adapters, against the real services ---------------------------
  console.log("");
  console.log(cyan(`  ${bold("The adapter suite, against the real services")}`));
  console.log(
    "  The same contract tests the in-memory fakes pass, run against the Postgres",
  );
  console.log(
    "  and MinIO that just started. That is what makes a fast unit test written",
  );
  console.log("  against a fake mean something.");
  console.log("");
  await run("make", ["test-integration"]);
  await waitForPresenter("  ");

  // --- 5. The browser the client watches ------------------------------------
  browser = await chromium.launch({
    headless: false,
    args: ["--window-size=1400,1000", "--window-position=40,40"],
  });
  watchForBrowserClose(browser);
  // viewport: null makes the page use the real window size. A fixed viewport
  // taller than the window clips the bottom of the page, which is exactly
  // where the caption bar lives - it went missing on shorter displays.
  const context = await browser.newContext({ viewport: null });
  const page = await context.newPage();
  await page.goto(APP_URL);

  console.log("");
  console.log(dim("  ────────────────────────────────────────────────────────"));

  await step(
    page,
    "The document",
    "A services agreement in object storage. That hash is a SHA-256 of the actual bytes, recomputed on every page load - not stored and trusted. Note the fee: $10,000.",
  );

  await step(
    page,
    "Sign it",
    "This is what everyone expects an e-signature product to do.",
    async () => {
      await drawSignature(page);
      await page.getByRole("button", { name: "Sign document" }).click();
      await page.locator(".badge.ok", { hasText: "VERIFIED" }).waitFor();
    },
  );

  await step(
    page,
    "What was actually signed",
    "Not the image - a payload binding the document hash, who signed, when, and a hash of the strokes. The image is evidence for a human; the payload is evidence for a machine.",
    async () => {
      await scrollIntoMiddle(page, "DOCUMENT HASH SIGNED OVER");
    },
  );

  // Read the object's real hash BEFORE tampering, so the change can be shown
  // as a fact about storage rather than as something the page merely claims.
  const hashBefore = await storedHash();
  console.log("");
  console.log(dim(`     object in storage now: ${hashBefore}`));

  await step(
    page,
    "Someone edits the document",
    "They have the file store but not the database. They cannot forge a signature, so they change the agreement instead. Watch the fee.",
    async () => {
      await page.getByRole("button", { name: "Tamper with document" }).click();
      await page.locator(".badge.bad", { hasText: "TAMPERED" }).waitFor();
      await scrollIntoMiddle(page, "The document no longer matches what was signed.");
    },
  );

  const hashAfter = await storedHash();
  console.log("");
  console.log(dim(`     object in storage was:  ${hashBefore}`));
  console.log(dim(`     object in storage now:  ${hashAfter}`));
  console.log("");

  await step(
    page,
    "The fee now reads $90,000",
    "Nothing about the signature record was touched. The signature is still valid - it just no longer describes this document. Stop talking here and let them read it.",
    async () => {
      // Back to the top: the changed fee and the changed document hash are
      // both up there, and they are the thing to look at on this beat.
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
      await page.waitForTimeout(600);
    },
  );

  await step(
    page,
    "Proof it is the file, not the page",
    "Same answer from outside the browser, reading the bytes straight out of object storage. This is not the UI deciding to show a red badge.",
    async () => {
      const output = await capture("make", ["verify"]);
      console.log("");
      // make's own non-zero-exit noise reads as a crash on a shared screen.
      // The non-zero exit is the point, but the client should not see
      // "*** Error 1" while you are explaining that everything worked.
      const noise = /^make(\[\d+\])?:|^\s*$/;
      for (const line of output.split("\n")) {
        if (noise.test(line)) continue;
        console.log(dim(`     ${line}`));
      }
    },
  );

  await step(
    page,
    "The audit log",
    "Every event carries the hash of the one before it. Editing a past entry breaks the chain and the log names which link broke. It still reads CHAIN INTACT because the log honestly recorded the tampering.",
    async () => {
      await scrollIntoMiddle(page, "document.tampered");
    },
  );

  await step(
    page,
    "Poke around",
    "Opening MinIO and the repo in your own browser. In MinIO: documents bucket, the object, its Last Modified timestamp - that is the edit, on disk. Login sigdemo / sigdemo123. In the repo, docs/adr explains why Postgres for the records and MinIO for the bytes.",
    async () => {
      await run("open", [MINIO_URL]).catch(() => {});
      await run("open", [REPO_URL]).catch(() => {});
    },
  );

  console.log("");
  console.log(green("  Walkthrough complete."));
  console.log("");
  console.log(
    process.env["NATIVE"] === "1"
      ? "  The app and Docker are still running."
      : "  Everything is still running, all in Docker.",
  );
  console.log(dim(`    ${APP_URL}          the demo`));
  console.log(dim(`    ${MINIO_URL}          MinIO console (sigdemo / sigdemo123)`));
  console.log(dim("    make clean && make up-full  reset to a clean document"));
  console.log(dim("    make down                   stop everything"));
  console.log(dim("    make verify                the same result from the terminal"));
  console.log("");
  if (interactive && !browserClosed) {
    console.log(dim("  [Enter] to close the demo browser and stop the app,"));
    console.log(dim("  or just close the window."));
    abortSteps = new AbortController();
    try {
      await rl!.question("  ", { signal: abortSteps.signal });
    } catch {
      // Window closed - same outcome.
    }
  }
}

async function shutdown(): Promise<void> {
  rl?.close();
  await browser?.close().catch(() => {});
  for (const child of started) {
    // The dev server spawns its own children; kill the group.
    try {
      process.kill(-child.pid!, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
  }
}

try {
  await main();
} catch (error) {
  if (error instanceof BrowserClosedSignal) {
    console.log(dim("\n  Demo window closed. Stopping the app; Docker is still up.\n"));
  } else if (error instanceof QuitSignal) {
    console.log(dim("\n  Quit. Docker is still up; run `make clean` to reset.\n"));
  } else {
    console.error(red(`\n  ${error instanceof Error ? error.message : String(error)}\n`));
    console.error(dim("  Recovery: `make ps` to check containers, `make clean && make up` to reset.\n"));
    process.exitCode = 1;
  }
} finally {
  await shutdown();
}
