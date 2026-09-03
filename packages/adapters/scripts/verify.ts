/**
 * Re-verifies every stored signature and the audit chain, from the command
 * line. This is the same core logic the web app calls - no second
 * implementation to drift.
 */
import { verifyAuditChain, verifyDocument } from "@sig/core";

import { wireFromEnv } from "../src/index.ts";

const wiring = await wireFromEnv();
let failures = 0;

try {
  const documents = await wiring.documents.list();
  if (documents.length === 0) {
    console.log("No documents stored. Run `make up` to seed one.");
  }

  for (const document of documents) {
    console.log(`\n${document.filename}  (${document.id})`);
    console.log(`  sha256 now: ${document.sha256}`);

    const results = await verifyDocument(wiring, document.id);
    if (results.length === 0) {
      console.log("  no signatures yet");
      continue;
    }

    for (const { record, result } of results) {
      const signer = record.payload.signerId;
      if (result.status === "VERIFIED") {
        console.log(`  VERIFIED           ${signer}`);
      } else if (result.status === "TAMPERED") {
        failures++;
        console.log(`  TAMPERED           ${signer}  (${result.reason})`);
        console.log(`    signed over: ${result.expected}`);
        console.log(`    found:       ${result.actual}`);
      } else {
        failures++;
        console.log(`  INVALID SIGNATURE  ${signer}`);
      }
    }
  }

  const events = await wiring.audit.list();
  const chain = verifyAuditChain(events);
  console.log(`\naudit log: ${events.length} events`);
  if (chain.ok) {
    console.log("  chain intact");
  } else {
    failures++;
    console.log(`  CHAIN BROKEN at event ${chain.brokenAt} (${chain.reason})`);
  }
} finally {
  await wiring.close();
}

if (failures > 0) {
  console.log(
    `\n${failures} problem(s) found. \`make verify\` exits non-zero when anything fails to verify, so it is usable as a check - the error make prints below is that, not a crash.`,
  );
}

process.exit(failures > 0 ? 1 : 0);
