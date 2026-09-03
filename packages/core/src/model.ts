/**
 * Domain model. Plain data, no behavior, no I/O.
 *
 * The distinction this whole demo rests on lives here: a `DrawnSignature` is
 * what a human recognizes as a signature, and a `SigningPayload` is what a
 * machine can actually verify. The record binds them together.
 */

/** Lowercase hex SHA-256. */
export type Sha256Hex = string;

/** Base64-encoded detached signature. */
export type Base64 = string;

export interface DocumentRef {
  readonly id: string;
  readonly filename: string;
  readonly contentType: string;
  readonly byteLength: number;
  /** Hash of the exact bytes stored. This is what gets signed. */
  readonly sha256: Sha256Hex;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * Strokes captured from the signature canvas, in normalized coordinates so the
 * same signature hashes identically regardless of device pixel ratio.
 */
export interface DrawnSignature {
  readonly strokes: ReadonlyArray<ReadonlyArray<Point>>;
  readonly width: number;
  readonly height: number;
}

/**
 * The bytes that are actually signed. Note what is in here: the document hash,
 * who signed, when, and a hash of the drawn strokes. Swapping the image out
 * later changes `drawnSignatureSha256` and breaks verification, so the picture
 * and the cryptography cannot drift apart.
 */
export interface SigningPayload {
  readonly version: 1;
  readonly documentId: string;
  readonly documentSha256: Sha256Hex;
  readonly signerId: string;
  /** ISO-8601, always UTC. */
  readonly signedAt: string;
  readonly drawnSignatureSha256: Sha256Hex;
}

export interface SignatureRecord {
  readonly id: string;
  readonly payload: SigningPayload;
  readonly algorithm: string;
  readonly publicKeyId: string;
  readonly signature: Base64;
  readonly drawnSignature: DrawnSignature;
}

export type VerificationStatus = "VERIFIED" | "TAMPERED" | "INVALID_SIGNATURE";

export type TamperReason =
  | "document-hash-mismatch"
  | "drawn-signature-mismatch";

export type VerificationResult =
  | { readonly status: "VERIFIED" }
  /** The signature is authentic, but the thing it points at has changed. */
  | {
      readonly status: "TAMPERED";
      readonly reason: TamperReason;
      readonly expected: Sha256Hex;
      readonly actual: Sha256Hex;
    }
  /** The payload was not signed by the key it claims, or was edited. */
  | { readonly status: "INVALID_SIGNATURE" };

export type AuditEventType =
  | "document.uploaded"
  | "document.viewed"
  | "signature.created"
  | "signature.verified"
  | "document.tampered";

export interface AuditEvent {
  readonly seq: number;
  readonly id: string;
  readonly type: AuditEventType;
  readonly at: string;
  readonly actor: string;
  readonly data: Readonly<Record<string, unknown>>;
  /** Hash of the previous event; `GENESIS_PREV_HASH` for the first. */
  readonly prevHash: Sha256Hex;
  /** Hash over this event's content, including `prevHash`. */
  readonly hash: Sha256Hex;
}

export type NewAuditEvent = Omit<AuditEvent, "seq" | "id" | "prevHash" | "hash">;

export type ChainBreakReason =
  | "sequence-gap"
  | "prev-hash-mismatch"
  | "content-hash-mismatch";

export type ChainVerification =
  | { readonly ok: true; readonly length: number }
  | {
      readonly ok: false;
      readonly brokenAt: number;
      readonly reason: ChainBreakReason;
    };
