import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Ed25519Signer } from "../src/crypto/ed25519-signer.ts";

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

describe("Ed25519Signer", () => {
  it("verifies what it signed", async () => {
    const signer = Ed25519Signer.generate();
    const payload = bytes("the exact payload");
    const signature = await signer.sign(payload);

    expect(
      await signer.verify({ bytes: payload, signature, keyId: signer.keyId }),
    ).toBe(true);
  });

  it("rejects a signature over different bytes", async () => {
    const signer = Ed25519Signer.generate();
    const signature = await signer.sign(bytes("original"));

    expect(
      await signer.verify({
        bytes: bytes("modified"),
        signature,
        keyId: signer.keyId,
      }),
    ).toBe(false);
  });

  it("rejects a signature from another key", async () => {
    const mine = Ed25519Signer.generate();
    const theirs = Ed25519Signer.generate();
    const payload = bytes("payload");
    const theirSignature = await theirs.sign(payload);

    // Both the key id check and the cryptography must reject it.
    expect(
      await mine.verify({
        bytes: payload,
        signature: theirSignature,
        keyId: theirs.keyId,
      }),
    ).toBe(false);
    expect(
      await mine.verify({
        bytes: payload,
        signature: theirSignature,
        keyId: mine.keyId,
      }),
    ).toBe(false);
  });

  it("rejects malformed base64 without throwing", async () => {
    const signer = Ed25519Signer.generate();
    expect(
      await signer.verify({
        bytes: bytes("payload"),
        signature: "not-a-real-signature",
        keyId: signer.keyId,
      }),
    ).toBe(false);
  });

  it("derives the same key id from the same key material", () => {
    const dir = mkdtempSync(join(tmpdir(), "sigdemo-pem-"));
    const path = join(dir, "key.pem");

    const original = Ed25519Signer.fromFile(path);
    // Rebuilt from the PEM on disk, not from a fresh keypair. The signer
    // deliberately does not expose its private key, so the file is the seam.
    const rebuilt = new Ed25519Signer(readFileSync(path, "utf8"));

    expect(rebuilt.keyId).toBe(original.keyId);
  });

  it("gives different keys different ids", () => {
    expect(Ed25519Signer.generate().keyId).not.toBe(
      Ed25519Signer.generate().keyId,
    );
  });

  it("generates a key on first use and reuses it after", () => {
    const dir = mkdtempSync(join(tmpdir(), "sigdemo-keys-"));
    const path = join(dir, "nested", "signing-key.pem");

    const first = Ed25519Signer.fromFile(path);
    const second = Ed25519Signer.fromFile(path);

    expect(second.keyId).toBe(first.keyId);
    expect(readFileSync(path, "utf8")).toContain("BEGIN PRIVATE KEY");
  });

  it("survives a signature round trip across instances", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sigdemo-rt-"));
    const path = join(dir, "key.pem");

    const signing = Ed25519Signer.fromFile(path);
    const signature = await signing.sign(bytes("persisted payload"));

    const verifying = Ed25519Signer.fromFile(path);
    expect(
      await verifying.verify({
        bytes: bytes("persisted payload"),
        signature,
        keyId: signing.keyId,
      }),
    ).toBe(true);
  });
});
