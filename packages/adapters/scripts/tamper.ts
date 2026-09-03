/**
 * Rewrites the stored document out from under its signatures, the way an
 * attacker with bucket access would. Nothing about the signature records is
 * touched - that is the point. Run `make verify` afterward.
 */
import { wireFromEnv } from "../src/index.ts";
import { SAMPLE_DOCUMENT_ID } from "./sample.ts";

const wiring = await wireFromEnv();

try {
  const before = await wiring.documents.getRef(SAMPLE_DOCUMENT_ID);
  if (!before) {
    console.error(`No document ${SAMPLE_DOCUMENT_ID}. Run \`make up\` first.`);
    process.exit(1);
  }

  const original = await wiring.documents.getBytes(SAMPLE_DOCUMENT_ID);
  const text = new TextDecoder().decode(original!);
  if (!text.includes("$10,000")) {
    console.log("Document already tampered with. Run `make clean && make up` to reset.");
    process.exit(0);
  }

  const after = await wiring.documents.put({
    id: SAMPLE_DOCUMENT_ID,
    filename: before.filename,
    contentType: before.contentType,
    bytes: new TextEncoder().encode(text.replace("$10,000", "$90,000")),
  });

  await wiring.audit.append({
    type: "document.tampered",
    at: new Date().toISOString(),
    actor: "make tamper",
    data: { documentId: after.id, was: before.sha256, now: after.sha256 },
  });

  console.log("Rewrote the fee from $10,000 to $90,000.");
  console.log(`  was: ${before.sha256}`);
  console.log(`  now: ${after.sha256}`);
  console.log("\nSignature records were not touched. Run `make verify`.");
} finally {
  await wiring.close();
}
