import { afterAll, beforeAll } from "vitest";
import type { Pool } from "pg";

import {
  describeAuditLogContract,
  describeDocumentStoreContract,
  describeSignatureRepositoryContract,
} from "@sig/core/testkit";

import { PostgresAuditLog } from "../src/postgres/audit-log.ts";
import { PostgresSignatureRepository } from "../src/postgres/signature-repository.ts";
import {
  makeIsolatedPool,
  makeRecord,
  makeScratchStore,
  removeScratchBuckets,
} from "./support.ts";

/**
 * The point of this file: the real adapters run the exact contract suites the
 * in-memory fakes run in packages/core. If Postgres and the fake disagree
 * about what a SignatureRepository does, this fails - which is what makes a
 * unit test written against a fake worth anything.
 */

let pool: Pool;
let drop: () => Promise<void>;

beforeAll(async () => {
  ({ pool, drop } = await makeIsolatedPool());
});

afterAll(async () => {
  await drop();
  await removeScratchBuckets();
});

describeDocumentStoreContract("S3DocumentStore (MinIO)", () =>
  makeScratchStore(),
);

describeSignatureRepositoryContract(
  "PostgresSignatureRepository",
  async () => {
    await pool.query("truncate table signatures");
    return new PostgresSignatureRepository(pool);
  },
  makeRecord,
);

describeAuditLogContract("PostgresAuditLog", async () => {
  await pool.query("truncate table audit_events");
  return new PostgresAuditLog(pool);
});
