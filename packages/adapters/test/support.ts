import { randomUUID } from "node:crypto";
import { Pool } from "pg";

import { hashDrawnSignature, sha256 } from "@sig/core";
import type { DrawnSignature, SignatureRecord, SigningPayload } from "@sig/core";

import { postgresConfigFromEnv, s3ConfigFromEnv } from "../src/config.ts";
import { ensureSchema, waitForPostgres } from "../src/postgres/client.ts";
import { S3DocumentStore } from "../src/s3/document-store.ts";
import {
  DeleteBucketCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";

/**
 * Integration tests run against the same Postgres and MinIO that `make up`
 * started, but never against the same tables or bucket the demo is using -
 * a test run must not wipe the document you are about to show someone.
 *
 * Isolation is per-run: a throwaway Postgres schema, and a throwaway bucket
 * for each store the contract suite asks for.
 */

export async function makeIsolatedPool(): Promise<{
  pool: Pool;
  drop: () => Promise<void>;
}> {
  const schema = `test_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const { connectionString } = postgresConfigFromEnv();

  const admin = new Pool({ connectionString });
  await waitForPostgres(admin);
  await admin.query(`create schema if not exists "${schema}"`);
  await admin.end();

  const pool = new Pool({
    connectionString,
    options: `-c search_path=${schema}`,
  });
  await ensureSchema(pool);

  return {
    pool,
    drop: async () => {
      await pool.end();
      const cleanup = new Pool({ connectionString });
      await cleanup.query(`drop schema if exists "${schema}" cascade`);
      await cleanup.end();
    },
  };
}

const scratchBuckets: string[] = [];

export async function makeScratchStore(): Promise<S3DocumentStore> {
  const config = s3ConfigFromEnv();
  const bucket = `test-${randomUUID()}`;
  scratchBuckets.push(bucket);
  const store = new S3DocumentStore({ ...config, bucket });
  await store.waitUntilReady();
  return store;
}

/**
 * Removes every scratch bucket a run created. Without this the MinIO console
 * fills with test-<uuid> buckets, which is exactly what you do not want on
 * screen while showing someone the stored document.
 */
export async function removeScratchBuckets(): Promise<void> {
  const config = s3ConfigFromEnv();
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  for (const bucket of scratchBuckets) {
    try {
      const listed = await client.send(
        new ListObjectsV2Command({ Bucket: bucket }),
      );
      const objects = (listed.Contents ?? [])
        .map((object) => object.Key)
        .filter((key): key is string => Boolean(key))
        .map((Key) => ({ Key }));
      if (objects.length > 0) {
        await client.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: objects },
          }),
        );
      }
      await client.send(new DeleteBucketCommand({ Bucket: bucket }));
    } catch {
      // Best effort - a leftover scratch bucket is untidy, not a test failure.
    }
  }
  scratchBuckets.length = 0;
}

export const A_SIGNATURE: DrawnSignature = {
  width: 400,
  height: 150,
  strokes: [
    [
      { x: 10, y: 100 },
      { x: 40, y: 40 },
    ],
    [{ x: 90, y: 60 }],
  ],
};

export function makeRecord(overrides: {
  id: string;
  documentId: string;
}): SignatureRecord {
  const payload: SigningPayload = {
    version: 1,
    documentId: overrides.documentId,
    documentSha256: sha256(new TextEncoder().encode("whatever")),
    signerId: "rob@sploosh.ai",
    signedAt: "2026-09-03T19:00:00.000Z",
    drawnSignatureSha256: hashDrawnSignature(A_SIGNATURE),
  };
  return {
    id: overrides.id,
    payload,
    algorithm: "ed25519",
    publicKeyId: "test-key",
    signature: "c2lnbmF0dXJl",
    drawnSignature: A_SIGNATURE,
  };
}
