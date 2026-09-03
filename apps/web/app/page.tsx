import { verifyAuditChain, verifyDocument } from "@sig/core";
import type { VerificationResult } from "@sig/core";

import { SignaturePad } from "../components/SignaturePad.tsx";
import { TamperButton } from "../components/TamperButton.tsx";
import { getWiring } from "../lib/wiring.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const short = (hash: string) => `${hash.slice(0, 16)}...${hash.slice(-8)}`;

function Badge({ result }: { result: VerificationResult }) {
  if (result.status === "VERIFIED") {
    return <span className="badge ok">VERIFIED</span>;
  }
  return (
    <span className="badge bad">
      {result.status === "TAMPERED" ? "TAMPERED" : "INVALID SIGNATURE"}
    </span>
  );
}

export default async function Page() {
  const wiring = await getWiring();

  const documents = await wiring.documents.list();
  const document = documents[0];

  if (!document) {
    return (
      <main>
        <h1>Document signing demo</h1>
        <p className="sub">
          No document stored. Run <code className="mono">make up</code> to seed
          one.
        </p>
      </main>
    );
  }

  const bytes = await wiring.documents.getBytes(document.id);
  const text = new TextDecoder().decode(bytes ?? new Uint8Array());
  const signatures = await verifyDocument(wiring, document.id);
  const events = await wiring.audit.list();
  const chain = verifyAuditChain(events);

  return (
    <main>
      <h1>{document.filename}</h1>
      <p className="sub">
        Signatures are bound to the bytes below, not to the file name.
      </p>

      <div className="panel">
        <div className="between" style={{ marginBottom: 12 }}>
          <span className="mono muted">
            sha256 <span className="hash">{document.sha256}</span>
          </span>
          <TamperButton documentId={document.id} />
        </div>
        <div className="doc">{text}</div>
      </div>

      <h2>Sign it</h2>
      <div className="panel">
        <SignaturePad documentId={document.id} />
      </div>

      <h2>Signatures ({signatures.length})</h2>
      {signatures.length === 0 ? (
        <div className="panel muted">
          Nothing signed yet. Draw above, then sign.
        </div>
      ) : (
        signatures.map(({ record, result }) => (
          <div className="panel" key={record.id}>
            <div className="between">
              <strong>{record.payload.signerId}</strong>
              <Badge result={result} />
            </div>
            <p className="mono muted" style={{ margin: "8px 0 0" }}>
              {new Date(record.payload.signedAt).toLocaleString()} &middot;{" "}
              {record.algorithm} &middot; key {record.publicKeyId}
            </p>

            {/* What was actually signed - the payload, not the picture. */}
            <table style={{ marginTop: 12 }}>
              <tbody>
                <tr>
                  <th>document hash signed over</th>
                  <td className="mono hash">
                    {short(record.payload.documentSha256)}
                  </td>
                </tr>
                <tr>
                  <th>strokes hash</th>
                  <td className="mono hash">
                    {short(record.payload.drawnSignatureSha256)}
                  </td>
                </tr>
                <tr>
                  <th>signature</th>
                  <td className="mono hash">{short(record.signature)}</td>
                </tr>
              </tbody>
            </table>

            {result.status === "TAMPERED" ? (
              <p className="mono" style={{ color: "var(--bad)", marginBottom: 0 }}>
                {result.reason === "document-hash-mismatch"
                  ? "The document no longer matches what was signed."
                  : "The drawn signature does not match what was signed."}
                <br />
                signed over: <span className="hash">{result.expected}</span>
                <br />
                found now:&nbsp;&nbsp; <span className="hash">{result.actual}</span>
              </p>
            ) : null}
          </div>
        ))
      )}

      <h2>
        Audit log ({events.length}){" "}
        {chain.ok ? (
          <span className="badge ok">CHAIN INTACT</span>
        ) : (
          <span className="badge bad">BROKEN AT {chain.brokenAt}</span>
        )}
      </h2>
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>event</th>
              <th>actor</th>
              <th>when</th>
              <th>links to</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id}>
                <td className="mono">{event.seq}</td>
                <td className="mono">{event.type}</td>
                <td className="mono muted">{event.actor}</td>
                <td className="mono muted">
                  {new Date(event.at).toLocaleTimeString()}
                </td>
                <td className="mono muted">{event.prevHash.slice(0, 12)}...</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
