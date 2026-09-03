import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";

import { signDocument, verifyAuditChain, verifySignature } from "@sig/core";
import type { SigningDeps } from "@sig/core";

import { Ed25519Signer } from "../src/crypto/ed25519-signer.ts";
import { PostgresAuditLog } from "../src/postgres/audit-log.ts";
import { PostgresSignatureRepository } from "../src/postgres/signature-repository.ts";
import type { S3DocumentStore } from "../src/s3/document-store.ts";
import {
  A_SIGNATURE,
  makeIsolatedPool,
  makeScratchStore,
  removeScratchBuckets,
} from "./support.ts";

/**
 * The tamper path against real Postgres, real MinIO, and a real Ed25519 key.
 *
 * Core already proves this with fakes. Proving it again here is deliberate:
 * the interesting failure mode is an adapter that quietly normalizes something
 * - a JSON key order, a timestamp precision, a byte encoding - so that a
 * signature verifies in memory and stops verifying after a round trip through
 * storage. Only a real round trip can catch that.
 */

const ORIGINAL = "SERVICES AGREEMENT\n\nFee: $10,000.\n";
const ALTERED = "SERVICES AGREEMENT\n\nFee: $90,000.\n";

let pool: Pool;
let drop: () => Promise<void>;
let documents: S3DocumentStore;
let deps: SigningDeps;

beforeAll(async () => {
  ({ pool, drop } = await makeIsolatedPool());
  documents = await makeScratchStore();
  deps = {
    documents,
    signatures: new PostgresSignatureRepository(pool),
    audit: new PostgresAuditLog(pool),
    signer: Ed25519Signer.generate(),
    clock: { now: () => new Date() },
    ids: { next: () => `sig_${randomUUID()}` },
  };
});

afterAll(async () => {
  await drop();
  await removeScratchBuckets();
});

async function seedDocument(text: string): Promise<string> {
  const id = `doc_${randomUUID()}`;
  await documents.put({
    id,
    filename: "agreement.txt",
    contentType: "text/plain",
    bytes: new TextEncoder().encode(text),
  });
  return id;
}

describe("full stack", () => {
  it("verifies a signature that round-tripped through Postgres and MinIO", async () => {
    const documentId = await seedDocument(ORIGINAL);
    const signed = await signDocument(deps, {
      documentId,
      signerId: "rob@sploosh.ai",
      drawnSignature: A_SIGNATURE,
    });

    // Deliberately re-read rather than reusing the in-memory record: this is
    // what catches an adapter that mangles the payload on the way out.
    const loaded = await deps.signatures.get(signed.id);
    expect(loaded).not.toBeNull();
    expect(await verifySignature(deps, loaded!)).toEqual({
      status: "VERIFIED",
    });
  });

  it("reports TAMPERED after the stored object is rewritten", async () => {
    const documentId = await seedDocument(ORIGINAL);
    const signed = await signDocument(deps, {
      documentId,
      signerId: "rob@sploosh.ai",
      drawnSignature: A_SIGNATURE,
    });

    // Overwrite the object in MinIO, leaving the signature row untouched -
    // exactly what someone with bucket access but no database access can do.
    await documents.put({
      id: documentId,
      filename: "agreement.txt",
      contentType: "text/plain",
      bytes: new TextEncoder().encode(ALTERED),
    });

    const loaded = await deps.signatures.get(signed.id);
    expect(await verifySignature(deps, loaded!)).toMatchObject({
      status: "TAMPERED",
      reason: "document-hash-mismatch",
      expected: signed.payload.documentSha256,
    });
  });

  it("keeps the audit chain intact across many appends", async () => {
    const documentId = await seedDocument(ORIGINAL);
    for (let i = 0; i < 5; i++) {
      await signDocument(deps, {
        documentId,
        signerId: `signer-${i}@example.com`,
        drawnSignature: A_SIGNATURE,
      });
    }

    const chain = verifyAuditChain(await deps.audit.list());
    expect(chain.ok).toBe(true);
  });

  it("does not fork the chain under concurrent appends", async () => {
    // The append path takes a table lock. Without it, two readers would see
    // the same tail and write two events claiming the same prevHash.
    const before = (await deps.audit.list()).length;
    await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        deps.audit.append({
          type: "document.viewed",
          at: new Date().toISOString(),
          actor: `viewer-${i}`,
          data: { i },
        }),
      ),
    );

    const events = await deps.audit.list();
    expect(events).toHaveLength(before + 8);
    expect(verifyAuditChain(events)).toMatchObject({ ok: true });
  });
});
