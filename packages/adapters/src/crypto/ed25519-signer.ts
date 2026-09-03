import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as cryptoSign,
  verify as cryptoVerify,
  createHash,
  type KeyObject,
} from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import type { Signer } from "@sig/core";

/**
 * Ed25519 over the canonical payload bytes.
 *
 * The key is generated on first boot into a gitignored path backed by a Docker
 * volume, so `make clean` produces a fresh identity and previously stored
 * signatures stop verifying - which is the honest outcome, not a bug. A real
 * deployment puts this behind KMS or an HSM, and that is a different
 * implementation of this same interface with no change to `packages/core`.
 */
export class Ed25519Signer implements Signer {
  readonly algorithm = "ed25519";
  readonly keyId: string;

  readonly #privateKey: KeyObject;
  readonly #publicKey: KeyObject;

  constructor(privateKeyPem: string) {
    this.#privateKey = createPrivateKey(privateKeyPem);
    this.#publicKey = createPublicKey(this.#privateKey);
    this.keyId = fingerprint(this.#publicKey);
  }

  /** Loads the key at `path`, generating and persisting one if absent. */
  static fromFile(path: string): Ed25519Signer {
    try {
      return new Ed25519Signer(readFileSync(path, "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }

    const { privateKey } = generateKeyPairSync("ed25519");
    const pem = privateKey
      .export({ type: "pkcs8", format: "pem" })
      .toString();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, pem, { mode: 0o600 });
    return new Ed25519Signer(pem);
  }

  static generate(): Ed25519Signer {
    const { privateKey } = generateKeyPairSync("ed25519");
    return new Ed25519Signer(
      privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    );
  }

  publicKeyPem(): string {
    return this.#publicKey.export({ type: "spki", format: "pem" }).toString();
  }

  async sign(bytes: Uint8Array): Promise<string> {
    // Ed25519 hashes internally, so the algorithm argument is null.
    return cryptoSign(null, bytes, this.#privateKey).toString("base64");
  }

  async verify(input: {
    bytes: Uint8Array;
    signature: string;
    keyId: string;
  }): Promise<boolean> {
    // A signature made by a different key must not verify just because the
    // bytes happen to check out against ours.
    if (input.keyId !== this.keyId) return false;
    try {
      return cryptoVerify(
        null,
        input.bytes,
        this.#publicKey,
        Buffer.from(input.signature, "base64"),
      );
    } catch {
      return false;
    }
  }
}

function fingerprint(publicKey: KeyObject): string {
  const der = publicKey.export({ type: "spki", format: "der" });
  return createHash("sha256").update(der).digest("hex").slice(0, 16);
}

/**
 * A signer that follows the key file rather than pinning whatever it read at
 * construction time.
 *
 * This exists because of a real failure: `make clean` regenerates the signing
 * key, but a long-running `next dev` process had cached the old key in module
 * state. Every signature made afterward then verified against a key that no
 * longer existed and came back INVALID_SIGNATURE - which looks identical to a
 * forgery, and is the single most confusing thing that can happen while
 * demoing tamper detection.
 *
 * Re-reading is gated on mtime, so the steady-state cost is one stat call.
 */
export class FileEd25519Signer implements Signer {
  readonly algorithm = "ed25519";

  readonly #path: string;
  #signer: Ed25519Signer;
  #loadedMtimeMs: number;

  constructor(path: string) {
    this.#path = path;
    this.#signer = Ed25519Signer.fromFile(path);
    this.#loadedMtimeMs = currentMtimeMs(path);
  }

  #current(): Ed25519Signer {
    const mtimeMs = currentMtimeMs(this.#path);
    if (mtimeMs !== this.#loadedMtimeMs) {
      this.#signer = Ed25519Signer.fromFile(this.#path);
      this.#loadedMtimeMs = mtimeMs;
    }
    return this.#signer;
  }

  get keyId(): string {
    return this.#current().keyId;
  }

  publicKeyPem(): string {
    return this.#current().publicKeyPem();
  }

  async sign(bytes: Uint8Array): Promise<string> {
    return this.#current().sign(bytes);
  }

  async verify(input: {
    bytes: Uint8Array;
    signature: string;
    keyId: string;
  }): Promise<boolean> {
    return this.#current().verify(input);
  }
}

/** 0 when the file is absent - fromFile will create it on the next read. */
function currentMtimeMs(path: string): number {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
}
