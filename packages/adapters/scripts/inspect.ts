/**
 * Prints the SHA-256 of the sample document as it currently exists in object
 * storage, and nothing else, so a script can capture it.
 *
 * Recomputed from the stored bytes on every call - never read from cached
 * metadata, which is the same rule the app follows.
 */
import { wireFromEnv } from "../src/index.ts";
import { SAMPLE_DOCUMENT_ID } from "./sample.ts";

const wiring = await wireFromEnv();
try {
  const ref = await wiring.documents.getRef(SAMPLE_DOCUMENT_ID);
  console.log(ref ? ref.sha256 : "(no document stored)");
} finally {
  await wiring.close();
}
