"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Rewrites the stored document. Signature records are left alone. */
export function TamperButton({ documentId }: { documentId: string }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function tamper() {
    setBusy(true);
    try {
      await fetch("/api/tamper", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ documentId }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className="danger" onClick={tamper} disabled={busy}>
      {busy ? "Rewriting..." : "Tamper with document"}
    </button>
  );
}
