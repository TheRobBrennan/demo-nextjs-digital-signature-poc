/**
 * Loads the sample agreement into object storage if it is not already there.
 * Idempotent - `make up` runs it on every start.
 */
import { wireFromEnv } from "../src/index.ts";
import {
  SAMPLE_DOCUMENT,
  SAMPLE_DOCUMENT_ID,
  SAMPLE_FILENAME,
} from "./sample.ts";

const wiring = await wireFromEnv();

try {
  const existing = await wiring.documents.getRef(SAMPLE_DOCUMENT_ID);
  if (existing) {
    console.log(
      `Sample document already present (${existing.sha256.slice(0, 12)}...). Nothing to seed.`,
    );
  } else {
    const ref = await wiring.documents.put({
      id: SAMPLE_DOCUMENT_ID,
      filename: SAMPLE_FILENAME,
      contentType: "text/plain",
      bytes: new TextEncoder().encode(SAMPLE_DOCUMENT),
    });
    await wiring.audit.append({
      type: "document.uploaded",
      at: new Date().toISOString(),
      actor: "seed",
      data: { documentId: ref.id, sha256: ref.sha256 },
    });
    console.log(
      `Seeded ${ref.filename} (${ref.byteLength} bytes, sha256 ${ref.sha256.slice(0, 12)}...)`,
    );
  }
} finally {
  await wiring.close();
}
