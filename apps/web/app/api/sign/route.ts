import { NextResponse } from "next/server";

import { EmptySignatureError, signDocument } from "@sig/core";
import type { DrawnSignature } from "@sig/core";

import { getWiring } from "../../../lib/wiring.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Thin: parse, delegate to the core use case, map errors to status codes. No
 * signing logic lives here - that is the whole point of the layering.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as {
    documentId?: string;
    signerId?: string;
    drawnSignature?: DrawnSignature;
  };

  if (!body.documentId || !body.signerId || !body.drawnSignature) {
    return NextResponse.json(
      { error: "documentId, signerId and drawnSignature are required" },
      { status: 400 },
    );
  }

  const wiring = await getWiring();
  try {
    const record = await signDocument(wiring, {
      documentId: body.documentId,
      signerId: body.signerId,
      drawnSignature: body.drawnSignature,
    });
    return NextResponse.json({ id: record.id });
  } catch (error) {
    if (error instanceof EmptySignatureError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
