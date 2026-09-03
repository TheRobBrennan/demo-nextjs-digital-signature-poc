import type { Pool } from "pg";

import type { SigningDeps } from "@sig/core";

import {
  postgresConfigFromEnv,
  s3ConfigFromEnv,
  signingKeyPathFromEnv,
} from "./config.ts";
import { createPool, ensureSchema, waitForPostgres } from "./postgres/client.ts";
import { PostgresAuditLog } from "./postgres/audit-log.ts";
import { PostgresSignatureRepository } from "./postgres/signature-repository.ts";
import { S3DocumentStore } from "./s3/document-store.ts";
import { FileEd25519Signer } from "./crypto/ed25519-signer.ts";

/**
 * The composition root - the one place that knows which implementation of each
 * port is in play. Everything downstream takes `SigningDeps` and cannot tell
 * Postgres from an in-memory map.
 */
export interface Wiring extends SigningDeps {
  documents: S3DocumentStore;
  pool: Pool;
  close(): Promise<void>;
}

export async function wireFromEnv(): Promise<Wiring> {
  const pool = await createPool(postgresConfigFromEnv());
  await waitForPostgres(pool);
  await ensureSchema(pool);

  const documents = new S3DocumentStore(s3ConfigFromEnv());
  await documents.waitUntilReady();

  return {
    documents,
    signatures: new PostgresSignatureRepository(pool),
    audit: new PostgresAuditLog(pool),
    // File-backed rather than pinned at construction: `make clean` swaps the
    // key underneath a long-running dev server.
    signer: new FileEd25519Signer(signingKeyPathFromEnv()),
    clock: { now: () => new Date() },
    ids: { next: () => `sig_${crypto.randomUUID()}` },
    pool,
    close: () => pool.end(),
  };
}
