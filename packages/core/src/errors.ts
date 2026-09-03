export class DocumentNotFoundError extends Error {
  readonly documentId: string;

  constructor(documentId: string) {
    super(`No document with id ${documentId}`);
    this.documentId = documentId;
    this.name = "DocumentNotFoundError";
  }
}

export class SignatureNotFoundError extends Error {
  readonly signatureId: string;

  constructor(signatureId: string) {
    super(`No signature with id ${signatureId}`);
    this.signatureId = signatureId;
    this.name = "SignatureNotFoundError";
  }
}

export class EmptySignatureError extends Error {
  constructor() {
    super("A signature must contain at least one stroke");
    this.name = "EmptySignatureError";
  }
}
