import { describe, expect, it } from "vitest";
import { isAbsolute } from "node:path";

import { signingKeyPathFromEnv } from "../src/config.ts";

describe("signingKeyPathFromEnv", () => {
  /**
   * Regression: the web app runs with cwd apps/web while the CLI runs from the
   * repo root. A cwd-relative key path made them use different keys, so
   * CLI-signed documents showed INVALID SIGNATURE in the browser.
   */
  it("resolves to an absolute path so every process agrees", () => {
    expect(isAbsolute(signingKeyPathFromEnv())).toBe(true);
  });

  it("resolves the same path regardless of the current directory", () => {
    const fromRoot = signingKeyPathFromEnv();
    const original = process.cwd();
    try {
      process.chdir("src");
      expect(signingKeyPathFromEnv()).toBe(fromRoot);
    } finally {
      process.chdir(original);
    }
  });

  it("leaves an absolute path alone", () => {
    const original = process.env["SIGNING_KEY_PATH"];
    process.env["SIGNING_KEY_PATH"] = "/tmp/some/key.pem";
    try {
      expect(signingKeyPathFromEnv()).toBe("/tmp/some/key.pem");
    } finally {
      if (original === undefined) delete process.env["SIGNING_KEY_PATH"];
      else process.env["SIGNING_KEY_PATH"] = original;
    }
  });
});
