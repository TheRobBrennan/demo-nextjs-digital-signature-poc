import { NextResponse } from "next/server";

import { getWiring } from "../../../lib/wiring.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Demo affordance: rewrites the stored document without touching a single
 * signature record, the way someone with bucket access but no database access
 * would. Same thing `make tamper` does, wired to a button.
 */
export async function POST(request: Request) {
  const { documentId } = (await request.json()) as { documentId?: string };
  if (!documentId) {
    return NextResponse.json({ error: "documentId is required" }, { status: 400 });
  }

  const wiring = await getWiring();
  const ref = await wiring.documents.getRef(documentId);
  const bytes = await wiring.documents.getBytes(documentId);
  if (!ref || !bytes) {
    return NextResponse.json({ error: "no such document" }, { status: 404 });
  }

  const text = new TextDecoder().decode(bytes);
  const altered = text.includes("$10,000")
    ? text.replace("$10,000", "$90,000")
    : text.replace("$90,000", "$10,000");

  const after = await wiring.documents.put({
    id: documentId,
    filename: ref.filename,
    contentType: ref.contentType,
    bytes: new TextEncoder().encode(altered),
  });

  await wiring.audit.append({
    type: "document.tampered",
    at: new Date().toISOString(),
    actor: "demo ui",
    data: { documentId, was: ref.sha256, now: after.sha256 },
  });

  return NextResponse.json({ sha256: after.sha256 });
}
