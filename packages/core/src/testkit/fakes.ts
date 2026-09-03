import { createHash } from "node:crypto";

import { linkAuditEvent } from "../audit";
import { sha256 } from "../hash";
import type {
  AuditEvent,
  DocumentRef,
  NewAuditEvent,
  SignatureRecord,
} from "../model";
import type {
  AuditLog,
  Clock,
  DocumentStore,
  IdGenerator,
  SignatureRepository,
  Signer,
} from "../ports";

/**
 * In-memory implementations of every port.
 *
 * These are not throwaway mocks. They run against the same contract suite in
 * `./contracts` that the Postgres and MinIO adapters run against, so a unit
 * test written on top of a fake is testing behavior the real adapter also
 * exhibits. When the two disagree, the suite fails rather than the fake
 * quietly lying.
 */

export class InMemoryDocumentStore implements DocumentStore {
  readonly #refs = new Map<string, DocumentRef>();
  readonly #bytes = new Map<string, Uint8Array>();

  async put(input: {
    id: string;
    filename: string;
    contentType: string;
    bytes: Uint8Array;
  }): Promise<DocumentRef> {
    const stored = Uint8Array.from(input.bytes);
    const ref: DocumentRef = {
      id: input.id,
      filename: input.filename,
      contentType: input.contentType,
      byteLength: stored.byteLength,
      sha256: sha256(stored),
    };
    this.#bytes.set(input.id, stored);
    this.#refs.set(input.id, ref);
    return ref;
  }

  async getBytes(id: string): Promise<Uint8Array | null> {
    const found = this.#bytes.get(id);
    return found ? Uint8Array.from(found) : null;
  }

  async getRef(id: string): Promise<DocumentRef | null> {
    return this.#refs.get(id) ?? null;
  }

  async list(): Promise<DocumentRef[]> {
    return [...this.#refs.values()];
  }

  /**
   * Test-only: replaces the bytes without touching the stored `DocumentRef`,
   * exactly as an out-of-band edit to the bucket would. This is how the tamper
   * case is reproduced without reaching into the object store.
   */
  tamperWith(id: string, bytes: Uint8Array): void {
    if (!this.#bytes.has(id)) {
      throw new Error(`Cannot tamper with unknown document ${id}`);
    }
    this.#bytes.set(id, Uint8Array.from(bytes));
  }
}

export class InMemorySignatureRepository implements SignatureRepository {
  readonly #records = new Map<string, SignatureRecord>();

  async save(record: SignatureRecord): Promise<void> {
    this.#records.set(record.id, record);
  }

  async get(id: string): Promise<SignatureRecord | null> {
    return this.#records.get(id) ?? null;
  }

  async listForDocument(documentId: string): Promise<SignatureRecord[]> {
    return [...this.#records.values()].filter(
      (record) => record.payload.documentId === documentId,
    );
  }
}

export class InMemoryAuditLog implements AuditLog {
  #events: AuditEvent[] = [];
  #nextId = 1;

  async append(event: NewAuditEvent): Promise<AuditEvent> {
    const linked = linkAuditEvent({
      event,
      id: `evt_${this.#nextId++}`,
      previous: this.#events.at(-1) ?? null,
    });
    this.#events.push(linked);
    return linked;
  }

  async list(): Promise<AuditEvent[]> {
    return [...this.#events];
  }

  /** Test-only: rewrite a stored event in place, as a DB edit would. */
  rewriteEvent(seq: number, patch: Partial<AuditEvent>): void {
    const index = this.#events.findIndex((event) => event.seq === seq);
    if (index === -1) throw new Error(`No event with seq ${seq}`);
    const existing = this.#events[index]!;
    this.#events[index] = { ...existing, ...patch };
  }

  /** Test-only: drop an event, leaving a gap in the chain. */
  deleteEvent(seq: number): void {
    this.#events = this.#events.filter((event) => event.seq !== seq);
  }
}

/**
 * Deterministic stand-in for a real asymmetric signer. Keyed hash, not Ed25519
 * - it satisfies the `Signer` contract without needing key material, so core
 * tests stay fast and hermetic. The real one lives in `packages/adapters`.
 */
export class FakeSigner implements Signer {
  readonly algorithm = "fake-keyed-sha256";

  readonly #secret: string;

  constructor(readonly keyId = "fake-key-1", secret = "test-secret") {
    this.#secret = secret;
  }

  async sign(bytes: Uint8Array): Promise<string> {
    return createHash("sha256")
      .update(this.keyId)
      .update(this.#secret)
      .update(bytes)
      .digest("base64");
  }

  async verify(input: {
    bytes: Uint8Array;
    signature: string;
    keyId: string;
  }): Promise<boolean> {
    if (input.keyId !== this.keyId) return false;
    return (await this.sign(input.bytes)) === input.signature;
  }
}

export class FixedClock implements Clock {
  #current: Date;

  constructor(iso = "2026-09-03T19:00:00.000Z") {
    this.#current = new Date(iso);
  }

  now(): Date {
    return new Date(this.#current);
  }

  advance(ms: number): void {
    this.#current = new Date(this.#current.getTime() + ms);
  }
}

export class SequentialIds implements IdGenerator {
  #n = 0;

  constructor(private readonly prefix = "id") {}

  next(): string {
    return `${this.prefix}_${++this.#n}`;
  }
}
