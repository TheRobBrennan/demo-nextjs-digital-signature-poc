import { describe, expect, it } from "vitest";

import { DocumentNotFoundError, EmptySignatureError } from "../src/errors.ts";
import { hashDrawnSignature, sha256 } from "../src/hash.ts";
import { signDocument, verifyDocument, verifySignature } from "../src/signing.ts";
import { A_SIGNATURE, SAMPLE_DOCUMENT, makeHarness, utf8 } from "./support.ts";

describe("signDocument", () => {
  it("signs the bytes currently stored, not the metadata", async () => {
    const deps = await makeHarness();
    const record = await signDocument(deps, {
      documentId: "doc_1",
      signerId: "rob@sploosh.ai",
      drawnSignature: A_SIGNATURE,
    });

    expect(record.payload.documentSha256).toBe(sha256(SAMPLE_DOCUMENT));
    expect(record.payload.drawnSignatureSha256).toBe(
      hashDrawnSignature(A_SIGNATURE),
    );
    expect(record.payload.signerId).toBe("rob@sploosh.ai");
    expect(record.payload.signedAt).toBe("2026-09-03T19:00:00.000Z");
  });

  it("rejects an empty signature rather than signing a blank canvas", async () => {
    const deps = await makeHarness();
    await expect(
      signDocument(deps, {
        documentId: "doc_1",
        signerId: "rob@sploosh.ai",
        drawnSignature: { width: 400, height: 150, strokes: [[], []] },
      }),
    ).rejects.toThrow(EmptySignatureError);
  });

  it("refuses to sign a document that does not exist", async () => {
    const deps = await makeHarness();
    await expect(
      signDocument(deps, {
        documentId: "missing",
        signerId: "rob@sploosh.ai",
        drawnSignature: A_SIGNATURE,
      }),
    ).rejects.toThrow(DocumentNotFoundError);
  });

  it("records the signing in the audit log", async () => {
    const deps = await makeHarness();
    const record = await signDocument(deps, {
      documentId: "doc_1",
      signerId: "rob@sploosh.ai",
      drawnSignature: A_SIGNATURE,
    });

    const events = await deps.audit.list();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      seq: 1,
      type: "signature.created",
      actor: "rob@sploosh.ai",
      data: { signatureId: record.id, documentId: "doc_1" },
    });
  });

  it("does not persist a signature it could not produce", async () => {
    const deps = await makeHarness();
    await expect(
      signDocument(deps, {
        documentId: "missing",
        signerId: "rob@sploosh.ai",
        drawnSignature: A_SIGNATURE,
      }),
    ).rejects.toThrow();
    expect(await deps.signatures.listForDocument("missing")).toEqual([]);
    expect(await deps.audit.list()).toEqual([]);
  });
});

describe("verifySignature", () => {
  it("verifies an untouched document", async () => {
    const deps = await makeHarness();
    const record = await signDocument(deps, {
      documentId: "doc_1",
      signerId: "rob@sploosh.ai",
      drawnSignature: A_SIGNATURE,
    });
    expect(await verifySignature(deps, record)).toEqual({ status: "VERIFIED" });
  });

  // The thesis of the demo. If this test goes green while the behavior is
  // broken, the whole exercise is theater.
  it("reports TAMPERED when a single byte of the document changes", async () => {
    const deps = await makeHarness();
    const record = await signDocument(deps, {
      documentId: "doc_1",
      signerId: "rob@sploosh.ai",
      drawnSignature: A_SIGNATURE,
    });

    deps.documents.tamperWith(
      "doc_1",
      utf8(
        "SERVICES AGREEMENT\n\nThe Provider agrees to deliver services for $90,000.\n",
      ),
    );

    const result = await verifySignature(deps, record);
    expect(result).toMatchObject({
      status: "TAMPERED",
      reason: "document-hash-mismatch",
      expected: sha256(SAMPLE_DOCUMENT),
    });
  });

  it("reports TAMPERED when the drawn signature is swapped out", async () => {
    const deps = await makeHarness();
    const record = await signDocument(deps, {
      documentId: "doc_1",
      signerId: "rob@sploosh.ai",
      drawnSignature: A_SIGNATURE,
    });

    const forged = {
      ...record,
      drawnSignature: {
        width: 400,
        height: 150,
        strokes: [[{ x: 1, y: 1 }, { x: 2, y: 2 }]],
      },
    };

    expect(await verifySignature(deps, forged)).toMatchObject({
      status: "TAMPERED",
      reason: "drawn-signature-mismatch",
    });
  });

  // Distinct from TAMPERED on purpose: here the record itself is a forgery,
  // rather than an authentic signature over a document that later changed.
  it("reports INVALID_SIGNATURE when the payload was edited after signing", async () => {
    const deps = await makeHarness();
    const record = await signDocument(deps, {
      documentId: "doc_1",
      signerId: "rob@sploosh.ai",
      drawnSignature: A_SIGNATURE,
    });

    const forged = {
      ...record,
      payload: { ...record.payload, signerId: "someone.else@example.com" },
    };

    expect(await verifySignature(deps, forged)).toEqual({
      status: "INVALID_SIGNATURE",
    });
  });

  it("reports INVALID_SIGNATURE when the signature came from another key", async () => {
    const deps = await makeHarness();
    const record = await signDocument(deps, {
      documentId: "doc_1",
      signerId: "rob@sploosh.ai",
      drawnSignature: A_SIGNATURE,
    });

    expect(
      await verifySignature(deps, { ...record, publicKeyId: "other-key" }),
    ).toEqual({ status: "INVALID_SIGNATURE" });
  });

  it("checks authenticity before document state", async () => {
    // A forged record pointing at a tampered document is INVALID_SIGNATURE,
    // not TAMPERED - the record was never trustworthy to begin with.
    const deps = await makeHarness();
    const record = await signDocument(deps, {
      documentId: "doc_1",
      signerId: "rob@sploosh.ai",
      drawnSignature: A_SIGNATURE,
    });
    deps.documents.tamperWith("doc_1", utf8("something else entirely"));

    const forged = {
      ...record,
      payload: { ...record.payload, signerId: "mallory@example.com" },
    };
    expect(await verifySignature(deps, forged)).toEqual({
      status: "INVALID_SIGNATURE",
    });
  });
});

describe("verifyDocument", () => {
  it("verifies every signature on a document", async () => {
    const deps = await makeHarness();
    await signDocument(deps, {
      documentId: "doc_1",
      signerId: "rob@sploosh.ai",
      drawnSignature: A_SIGNATURE,
    });
    await signDocument(deps, {
      documentId: "doc_1",
      signerId: "steph@example.com",
      drawnSignature: A_SIGNATURE,
    });

    const results = await verifyDocument(deps, "doc_1");
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.result.status === "VERIFIED")).toBe(true);
  });

  it("invalidates every signature at once when the document changes", async () => {
    const deps = await makeHarness();
    await signDocument(deps, {
      documentId: "doc_1",
      signerId: "rob@sploosh.ai",
      drawnSignature: A_SIGNATURE,
    });
    await signDocument(deps, {
      documentId: "doc_1",
      signerId: "steph@example.com",
      drawnSignature: A_SIGNATURE,
    });

    deps.documents.tamperWith("doc_1", utf8("rewritten"));

    const results = await verifyDocument(deps, "doc_1");
    expect(results.map((r) => r.result.status)).toEqual([
      "TAMPERED",
      "TAMPERED",
    ]);
  });

  it("returns nothing for a document nobody signed", async () => {
    const deps = await makeHarness();
    expect(await verifyDocument(deps, "doc_1")).toEqual([]);
  });
});
