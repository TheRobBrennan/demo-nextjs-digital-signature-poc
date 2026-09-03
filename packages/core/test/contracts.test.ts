import {
  InMemoryAuditLog,
  InMemoryDocumentStore,
  InMemorySignatureRepository,
  describeAuditLogContract,
  describeDocumentStoreContract,
  describeSignatureRepositoryContract,
} from "../src/testkit/index.ts";
import { makeRecord } from "./support.ts";

/**
 * The fakes run the same suites the real adapters run in
 * `packages/adapters`. That is what makes a unit test written against a fake
 * mean something.
 */
describeDocumentStoreContract("InMemoryDocumentStore", () => new InMemoryDocumentStore());
describeSignatureRepositoryContract(
  "InMemorySignatureRepository",
  () => new InMemorySignatureRepository(),
  makeRecord,
);
describeAuditLogContract("InMemoryAuditLog", () => new InMemoryAuditLog());
