import { createHash } from "node:crypto";

import type { DrawnSignature, Sha256Hex, SigningPayload } from "./model";

/**
 * Hashing is pure computation, so it lives in core. Key material is not - that
 * is behind the `Signer` port.
 */

export function sha256(bytes: Uint8Array): Sha256Hex {
  return createHash("sha256").update(bytes).digest("hex");
}

export function sha256Utf8(text: string): Sha256Hex {
  return sha256(new TextEncoder().encode(text));
}

/**
 * Deterministic JSON: object keys sorted at every depth, no incidental
 * whitespace. Two structurally equal values must produce byte-identical output
 * on any machine, or signatures stop verifying across processes.
 */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`);
  return `{${entries.join(",")}}`;
}

/**
 * Stroke coordinates are rounded before hashing. Canvas input carries float
 * noise that is invisible to a human and fatal to a hash, so the precision is
 * pinned here rather than left to whatever the browser reported.
 */
export const STROKE_PRECISION = 3;

export function canonicalizeDrawnSignature(drawn: DrawnSignature): string {
  const round = (n: number): number =>
    Number(n.toFixed(STROKE_PRECISION));
  return canonicalize({
    width: round(drawn.width),
    height: round(drawn.height),
    strokes: drawn.strokes.map((stroke) =>
      stroke.map((p) => [round(p.x), round(p.y)]),
    ),
  });
}

export function hashDrawnSignature(drawn: DrawnSignature): Sha256Hex {
  return sha256Utf8(canonicalizeDrawnSignature(drawn));
}

/** The exact bytes handed to `Signer.sign`. */
export function payloadBytes(payload: SigningPayload): Uint8Array {
  return new TextEncoder().encode(canonicalize(payload));
}
