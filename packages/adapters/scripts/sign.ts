/**
 * Signs the sample document from the command line, using a canned set of
 * strokes in place of the canvas. Same core use case the web app will call.
 *
 *   node --env-file=.env packages/adapters/scripts/sign.ts "Rob Brennan"
 */
import { signDocument } from "@sig/core";
import type { DrawnSignature } from "@sig/core";

import { wireFromEnv } from "../src/index.ts";
import { SAMPLE_DOCUMENT_ID } from "./sample.ts";

const signerId = process.argv[2] ?? "rob@sploosh.ai";

/** Stand-in for canvas input - a scribble, not a real capture. */
const strokes: DrawnSignature = {
  width: 400,
  height: 150,
  strokes: [
    [
      { x: 20, y: 110 },
      { x: 55, y: 35 },
      { x: 88, y: 118 },
      { x: 120, y: 40 },
    ],
    [
      { x: 150, y: 70 },
      { x: 235, y: 68 },
    ],
  ],
};

const wiring = await wireFromEnv();

try {
  const record = await signDocument(wiring, {
    documentId: SAMPLE_DOCUMENT_ID,
    signerId,
    drawnSignature: strokes,
  });

  console.log(`Signed by ${record.payload.signerId}`);
  console.log(`  signature id:  ${record.id}`);
  console.log(`  algorithm:     ${record.algorithm}`);
  console.log(`  key:           ${record.publicKeyId}`);
  console.log(`  document hash: ${record.payload.documentSha256}`);
  console.log(`  strokes hash:  ${record.payload.drawnSignatureSha256}`);
  console.log(`  signature:     ${record.signature.slice(0, 32)}...`);
} finally {
  await wiring.close();
}
