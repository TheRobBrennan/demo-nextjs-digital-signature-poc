import { describe, expect, it } from "vitest";

import { verifyAuditChain } from "../audit";
import type { AuditLog, DocumentStore, SignatureRepository } from "../ports";
import type { SignatureRecord } from "../model";

/**
 * Contract suites. Every implementation of a port must pass these - the
 * in-memory fakes here in core, and the Postgres/MinIO adapters in
 * `packages/adapters`.
 *
 * Core owns the contract because core owns the port. An adapter that passes
 * these is substitutable; one that does not is a bug in the adapter, not a
 * reason to weaken the suite.
 */

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

export function describeDocumentStoreContract(
  name: string,
  makeStore: () => Promise<DocumentStore> | DocumentStore,
): void {
  describe(`DocumentStore contract: ${name}`, () => {
    it("returns null for a document that was never stored", async () => {
      const store = await makeStore();
      expect(await store.getBytes("nope")).toBeNull();
      expect(await store.getRef("nope")).toBeNull();
    });

    it("round-trips bytes unchanged", async () => {
      const store = await makeStore();
      const content = bytes("Agreement v1\nSigned by nobody yet.\n");
      await store.put({
        id: "doc_1",
        filename: "agreement.txt",
        contentType: "text/plain",
        bytes: content,
      });
      expect(await store.getBytes("doc_1")).toEqual(content);
    });

    it("reports a ref whose hash and length describe the stored bytes", async () => {
      const store = await makeStore();
      const content = bytes("hello");
      const ref = await store.put({
        id: "doc_1",
        filename: "hello.txt",
        contentType: "text/plain",
        bytes: content,
      });
      expect(ref.byteLength).toBe(content.byteLength);
      // sha256("hello")
      expect(ref.sha256).toBe(
        "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
      );
    });

    it("does not alias caller-owned buffers", async () => {
      const store = await makeStore();
      const content = bytes("original");
      await store.put({
        id: "doc_1",
        filename: "a.txt",
        contentType: "text/plain",
        bytes: content,
      });
      content.fill(0);
      const stored = await store.getBytes("doc_1");
      expect(stored).not.toEqual(content);
    });

    it("lists what it holds", async () => {
      const store = await makeStore();
      await store.put({
        id: "doc_1",
        filename: "a.txt",
        contentType: "text/plain",
        bytes: bytes("a"),
      });
      await store.put({
        id: "doc_2",
        filename: "b.txt",
        contentType: "text/plain",
        bytes: bytes("b"),
      });
      const ids = (await store.list()).map((ref) => ref.id).sort();
      expect(ids).toEqual(["doc_1", "doc_2"]);
    });
  });
}

export function describeSignatureRepositoryContract(
  name: string,
  makeRepository: () => Promise<SignatureRepository> | SignatureRepository,
  makeRecord: (overrides: {
    id: string;
    documentId: string;
  }) => SignatureRecord,
): void {
  describe(`SignatureRepository contract: ${name}`, () => {
    it("returns null for an unknown signature", async () => {
      const repository = await makeRepository();
      expect(await repository.get("nope")).toBeNull();
    });

    it("round-trips a record", async () => {
      const repository = await makeRepository();
      const record = makeRecord({ id: "sig_1", documentId: "doc_1" });
      await repository.save(record);
      expect(await repository.get("sig_1")).toEqual(record);
    });

    it("lists only the signatures for the requested document", async () => {
      const repository = await makeRepository();
      await repository.save(makeRecord({ id: "sig_1", documentId: "doc_1" }));
      await repository.save(makeRecord({ id: "sig_2", documentId: "doc_1" }));
      await repository.save(makeRecord({ id: "sig_3", documentId: "doc_2" }));

      const ids = (await repository.listForDocument("doc_1"))
        .map((record) => record.id)
        .sort();
      expect(ids).toEqual(["sig_1", "sig_2"]);
      expect(await repository.listForDocument("doc_3")).toEqual([]);
    });
  });
}

export function describeAuditLogContract(
  name: string,
  makeLog: () => Promise<AuditLog> | AuditLog,
): void {
  describe(`AuditLog contract: ${name}`, () => {
    it("starts empty", async () => {
      const log = await makeLog();
      expect(await log.list()).toEqual([]);
    });

    it("numbers events from 1, in append order", async () => {
      const log = await makeLog();
      await log.append({
        type: "document.uploaded",
        at: "2026-09-03T19:00:00.000Z",
        actor: "rob",
        data: {},
      });
      await log.append({
        type: "document.viewed",
        at: "2026-09-03T19:00:01.000Z",
        actor: "rob",
        data: {},
      });
      expect((await log.list()).map((event) => event.seq)).toEqual([1, 2]);
    });

    it("produces a chain that verifies", async () => {
      const log = await makeLog();
      for (let i = 0; i < 5; i++) {
        await log.append({
          type: "document.viewed",
          at: new Date(Date.UTC(2026, 8, 3, 19, 0, i)).toISOString(),
          actor: "rob",
          data: { i },
        });
      }
      expect(verifyAuditChain(await log.list())).toEqual({
        ok: true,
        length: 5,
      });
    });

    it("links each event to the one before it", async () => {
      const log = await makeLog();
      const first = await log.append({
        type: "document.uploaded",
        at: "2026-09-03T19:00:00.000Z",
        actor: "rob",
        data: {},
      });
      const second = await log.append({
        type: "signature.created",
        at: "2026-09-03T19:00:05.000Z",
        actor: "rob",
        data: {},
      });
      expect(second.prevHash).toBe(first.hash);
    });
  });
}
