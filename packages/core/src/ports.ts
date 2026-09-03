/**
 * Ports. Core defines these; `packages/adapters` implements them.
 *
 * Nothing in this file mentions Postgres, MinIO, HTTP, or the filesystem, and
 * nothing in `packages/core` imports an implementation of one. That is the
 * rule the demo exists to illustrate - see CLAUDE.md.
 */
import type {
  AuditEvent,
  DocumentRef,
  NewAuditEvent,
  SignatureRecord,
} from "./model";

export interface DocumentStore {
  put(input: {
    id: string;
    filename: string;
    contentType: string;
    bytes: Uint8Array;
  }): Promise<DocumentRef>;
  /** Null when the document does not exist. */
  getBytes(id: string): Promise<Uint8Array | null>;
  getRef(id: string): Promise<DocumentRef | null>;
  list(): Promise<DocumentRef[]>;
}

export interface SignatureRepository {
  save(record: SignatureRecord): Promise<void>;
  get(id: string): Promise<SignatureRecord | null>;
  listForDocument(documentId: string): Promise<SignatureRecord[]>;
}

export interface AuditLog {
  /** Appends and returns the stored event, with seq/prevHash/hash filled in. */
  append(event: NewAuditEvent): Promise<AuditEvent>;
  /** All events, ascending by seq. */
  list(): Promise<AuditEvent[]>;
}

export interface Signer {
  readonly keyId: string;
  readonly algorithm: string;
  sign(bytes: Uint8Array): Promise<string>;
  verify(input: {
    bytes: Uint8Array;
    signature: string;
    keyId: string;
  }): Promise<boolean>;
}

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  next(): string;
}
