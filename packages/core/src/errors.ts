export class DocumentNotFoundError extends Error {
  constructor(public readonly documentId: string) {
    super(`No document with id ${documentId}`);
    this.name = "DocumentNotFoundError";
  }
}

export class SignatureNotFoundError extends Error {
  constructor(public readonly signatureId: string) {
    super(`No signature with id ${signatureId}`);
    this.name = "SignatureNotFoundError";
  }
}

export class EmptySignatureError extends Error {
  constructor() {
    super("A signature must contain at least one stroke");
    this.name = "EmptySignatureError";
  }
}
