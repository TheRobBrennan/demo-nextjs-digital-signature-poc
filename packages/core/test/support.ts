import {
  FakeSigner,
  FixedClock,
  InMemoryAuditLog,
  InMemoryDocumentStore,
  InMemorySignatureRepository,
  SequentialIds,
} from "../src/testkit/index.ts";
import type { DrawnSignature, SigningPayload, SignatureRecord } from "../src/model.ts";
import { hashDrawnSignature, sha256 } from "../src/hash.ts";
import type { SigningDeps } from "../src/signing.ts";

export const utf8 = (text: string): Uint8Array =>
  new TextEncoder().encode(text);

export const SAMPLE_DOCUMENT = utf8(
  "SERVICES AGREEMENT\n\nThe Provider agrees to deliver services for $10,000.\n",
);

export const A_SIGNATURE: DrawnSignature = {
  width: 400,
  height: 150,
  strokes: [
    [
      { x: 10, y: 100 },
      { x: 40, y: 40 },
      { x: 70, y: 110 },
    ],
    [
      { x: 90, y: 60 },
      { x: 140, y: 60 },
    ],
  ],
};

export interface Harness extends SigningDeps {
  documents: InMemoryDocumentStore;
  audit: InMemoryAuditLog;
}

export async function makeHarness(): Promise<Harness> {
  const documents = new InMemoryDocumentStore();
  await documents.put({
    id: "doc_1",
    filename: "agreement.txt",
    contentType: "text/plain",
    bytes: SAMPLE_DOCUMENT,
  });
  return {
    documents,
    signatures: new InMemorySignatureRepository(),
    audit: new InMemoryAuditLog(),
    signer: new FakeSigner(),
    clock: new FixedClock(),
    ids: new SequentialIds("sig"),
  };
}

/** A structurally valid record, for repository tests that do not sign. */
export function makeRecord(overrides: {
  id: string;
  documentId: string;
}): SignatureRecord {
  const payload: SigningPayload = {
    version: 1,
    documentId: overrides.documentId,
    documentSha256: sha256(SAMPLE_DOCUMENT),
    signerId: "rob@sploosh.ai",
    signedAt: "2026-09-03T19:00:00.000Z",
    drawnSignatureSha256: hashDrawnSignature(A_SIGNATURE),
  };
  return {
    id: overrides.id,
    payload,
    algorithm: "fake-keyed-sha256",
    publicKeyId: "fake-key-1",
    signature: "not-checked-by-repository-tests",
    drawnSignature: A_SIGNATURE,
  };
}
