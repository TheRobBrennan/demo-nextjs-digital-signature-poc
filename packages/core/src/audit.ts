import { canonicalize, sha256Utf8 } from "./hash.ts";
import type {
  AuditEvent,
  ChainVerification,
  NewAuditEvent,
  Sha256Hex,
} from "./model.ts";

/** prevHash of the first event in a chain. */
export const GENESIS_PREV_HASH: Sha256Hex = "0".repeat(64);

/**
 * The hash covers everything that identifies the event *and* the previous
 * hash. Editing any past event changes its hash, which orphans every event
 * after it - that is what makes the log tamper-evident rather than merely
 * append-only by convention.
 */
export function hashAuditEvent(
  event: Omit<AuditEvent, "hash">,
): Sha256Hex {
  return sha256Utf8(
    canonicalize({
      seq: event.seq,
      id: event.id,
      type: event.type,
      at: event.at,
      actor: event.actor,
      data: event.data,
      prevHash: event.prevHash,
    }),
  );
}

/** Builds the next event in a chain. Storage is the adapter's problem. */
export function linkAuditEvent(input: {
  event: NewAuditEvent;
  id: string;
  previous: AuditEvent | null;
}): AuditEvent {
  const seq = input.previous ? input.previous.seq + 1 : 1;
  const prevHash = input.previous ? input.previous.hash : GENESIS_PREV_HASH;
  const unhashed = { ...input.event, seq, id: input.id, prevHash };
  return { ...unhashed, hash: hashAuditEvent(unhashed) };
}

/**
 * Walks the chain and reports the first break, so the UI can say which link
 * failed instead of just "invalid".
 */
export function verifyAuditChain(
  events: readonly AuditEvent[],
): ChainVerification {
  let previous: AuditEvent | null = null;

  for (const event of events) {
    const expectedSeq = previous ? previous.seq + 1 : 1;
    if (event.seq !== expectedSeq) {
      return { ok: false, brokenAt: event.seq, reason: "sequence-gap" };
    }

    const expectedPrevHash = previous ? previous.hash : GENESIS_PREV_HASH;
    if (event.prevHash !== expectedPrevHash) {
      return { ok: false, brokenAt: event.seq, reason: "prev-hash-mismatch" };
    }

    if (hashAuditEvent(event) !== event.hash) {
      return {
        ok: false,
        brokenAt: event.seq,
        reason: "content-hash-mismatch",
      };
    }

    previous = event;
  }

  return { ok: true, length: events.length };
}
