import { DocumentNotFoundError, EmptySignatureError } from "./errors.ts";
import { hashDrawnSignature, payloadBytes, sha256 } from "./hash.ts";
import type {
  AuditLog,
  Clock,
  DocumentStore,
  IdGenerator,
  SignatureRepository,
  Signer,
} from "./ports.ts";
import type {
  DrawnSignature,
  SignatureRecord,
  SigningPayload,
  VerificationResult,
} from "./model.ts";

export interface SigningDeps {
  readonly documents: DocumentStore;
  readonly signatures: SignatureRepository;
  readonly audit: AuditLog;
  readonly signer: Signer;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export interface SignDocumentInput {
  readonly documentId: string;
  readonly signerId: string;
  readonly drawnSignature: DrawnSignature;
}

/**
 * Signs the document *as it exists right now*. The hash is recomputed from the
 * stored bytes rather than trusted from `DocumentRef`, so a store that has
 * drifted from its own metadata cannot produce a signature that looks valid.
 */
export async function signDocument(
  deps: SigningDeps,
  input: SignDocumentInput,
): Promise<SignatureRecord> {
  const hasStrokes = input.drawnSignature.strokes.some(
    (stroke) => stroke.length > 0,
  );
  if (!hasStrokes) {
    throw new EmptySignatureError();
  }

  const bytes = await deps.documents.getBytes(input.documentId);
  if (bytes === null) {
    throw new DocumentNotFoundError(input.documentId);
  }

  const payload: SigningPayload = {
    version: 1,
    documentId: input.documentId,
    documentSha256: sha256(bytes),
    signerId: input.signerId,
    signedAt: deps.clock.now().toISOString(),
    drawnSignatureSha256: hashDrawnSignature(input.drawnSignature),
  };

  const record: SignatureRecord = {
    id: deps.ids.next(),
    payload,
    algorithm: deps.signer.algorithm,
    publicKeyId: deps.signer.keyId,
    signature: await deps.signer.sign(payloadBytes(payload)),
    drawnSignature: input.drawnSignature,
  };

  await deps.signatures.save(record);
  await deps.audit.append({
    type: "signature.created",
    at: payload.signedAt,
    actor: input.signerId,
    data: {
      signatureId: record.id,
      documentId: payload.documentId,
      documentSha256: payload.documentSha256,
    },
  });

  return record;
}

export type VerifyDeps = Pick<SigningDeps, "documents" | "signer">;

/**
 * Three distinct failures, kept distinct because they mean different things:
 * an invalid signature means the record itself was forged or edited, while
 * TAMPERED means the signature is authentic and the document changed under it.
 * Collapsing them into a boolean would throw away the interesting half.
 */
export async function verifySignature(
  deps: VerifyDeps,
  record: SignatureRecord,
): Promise<VerificationResult> {
  const signatureIsAuthentic = await deps.signer.verify({
    bytes: payloadBytes(record.payload),
    signature: record.signature,
    keyId: record.publicKeyId,
  });
  if (!signatureIsAuthentic) {
    return { status: "INVALID_SIGNATURE" };
  }

  const drawnHash = hashDrawnSignature(record.drawnSignature);
  if (drawnHash !== record.payload.drawnSignatureSha256) {
    return {
      status: "TAMPERED",
      reason: "drawn-signature-mismatch",
      expected: record.payload.drawnSignatureSha256,
      actual: drawnHash,
    };
  }

  const bytes = await deps.documents.getBytes(record.payload.documentId);
  if (bytes === null) {
    throw new DocumentNotFoundError(record.payload.documentId);
  }
  const documentHash = sha256(bytes);
  if (documentHash !== record.payload.documentSha256) {
    return {
      status: "TAMPERED",
      reason: "document-hash-mismatch",
      expected: record.payload.documentSha256,
      actual: documentHash,
    };
  }

  return { status: "VERIFIED" };
}

export interface VerifiedSignature {
  readonly record: SignatureRecord;
  readonly result: VerificationResult;
}

export async function verifyDocument(
  deps: VerifyDeps & Pick<SigningDeps, "signatures">,
  documentId: string,
): Promise<VerifiedSignature[]> {
  const records = await deps.signatures.listForDocument(documentId);
  return Promise.all(
    records.map(async (record) => ({
      record,
      result: await verifySignature(deps, record),
    })),
  );
}
