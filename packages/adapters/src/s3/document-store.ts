import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import { sha256 } from "@sig/core";
import type { DocumentRef, DocumentStore } from "@sig/core";

import type { S3Config } from "../config.ts";

/**
 * Written against the AWS SDK, not a MinIO-specific client. MinIO speaks the
 * S3 API, so moving this to real S3 is an endpoint and a credential - see
 * docs/adr/0001-minio-for-document-storage.md.
 */
export class S3DocumentStore implements DocumentStore {
  readonly #client: S3Client;
  readonly #bucket: string;

  constructor(config: S3Config) {
    this.#bucket = config.bucket;
    this.#client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  /** Idempotent: safe to call on every boot. */
  async ensureBucket(): Promise<void> {
    try {
      await this.#client.send(new HeadBucketCommand({ Bucket: this.#bucket }));
      return;
    } catch {
      // Falls through to create. A HeadBucket failure here means "not there or
      // not visible to us", and CreateBucket will report the real problem.
    }
    try {
      await this.#client.send(
        new CreateBucketCommand({ Bucket: this.#bucket }),
      );
    } catch (error) {
      const name = (error as { name?: string }).name;
      if (name !== "BucketAlreadyOwnedByYou" && name !== "BucketAlreadyExists") {
        throw error;
      }
    }
  }

  async waitUntilReady({ attempts = 30, delayMs = 500 } = {}): Promise<void> {
    let lastError: unknown;
    for (let i = 0; i < attempts; i++) {
      try {
        await this.ensureBucket();
        return;
      } catch (error) {
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    throw new Error(
      `Object storage did not become ready after ${attempts} attempts: ${String(lastError)}`,
    );
  }

  #key(id: string): string {
    return `documents/${id}`;
  }

  async put(input: {
    id: string;
    filename: string;
    contentType: string;
    bytes: Uint8Array;
  }): Promise<DocumentRef> {
    const bytes = Uint8Array.from(input.bytes);
    await this.#client.send(
      new PutObjectCommand({
        Bucket: this.#bucket,
        Key: this.#key(input.id),
        Body: bytes,
        ContentType: input.contentType,
        // S3 has no schema, so the descriptive fields ride along as metadata.
        Metadata: { filename: input.filename },
      }),
    );
    return {
      id: input.id,
      filename: input.filename,
      contentType: input.contentType,
      byteLength: bytes.byteLength,
      sha256: sha256(bytes),
    };
  }

  async getBytes(id: string): Promise<Uint8Array | null> {
    try {
      const result = await this.#client.send(
        new GetObjectCommand({ Bucket: this.#bucket, Key: this.#key(id) }),
      );
      if (!result.Body) return null;
      return new Uint8Array(await result.Body.transformToByteArray());
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async getRef(id: string): Promise<DocumentRef | null> {
    try {
      const result = await this.#client.send(
        new GetObjectCommand({ Bucket: this.#bucket, Key: this.#key(id) }),
      );
      if (!result.Body) return null;
      const bytes = new Uint8Array(await result.Body.transformToByteArray());
      return {
        id,
        filename: result.Metadata?.["filename"] ?? id,
        contentType: result.ContentType ?? "application/octet-stream",
        byteLength: bytes.byteLength,
        // Recomputed from the bytes, never read from metadata. A ref whose
        // hash was cached at upload time would keep claiming a document is
        // intact after someone edited the object underneath it, which is
        // exactly the failure this demo is about.
        sha256: sha256(bytes),
      };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async list(): Promise<DocumentRef[]> {
    const result = await this.#client.send(
      new ListObjectsV2Command({
        Bucket: this.#bucket,
        Prefix: "documents/",
      }),
    );
    const ids = (result.Contents ?? [])
      .map((object) => object.Key?.slice("documents/".length))
      .filter((id): id is string => Boolean(id));

    const refs = await Promise.all(ids.map((id) => this.getRef(id)));
    return refs.filter((ref): ref is DocumentRef => ref !== null);
  }
}

function isNotFound(error: unknown): boolean {
  const name = (error as { name?: string }).name;
  const status = (error as { $metadata?: { httpStatusCode?: number } })
    .$metadata?.httpStatusCode;
  return name === "NoSuchKey" || name === "NotFound" || status === 404;
}
