import {
  InMemoryAuditLog,
  InMemoryDocumentStore,
  InMemorySignatureRepository,
  describeAuditLogContract,
  describeDocumentStoreContract,
  describeSignatureRepositoryContract,
} from "../src/testkit";
import { makeRecord } from "./support";

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
