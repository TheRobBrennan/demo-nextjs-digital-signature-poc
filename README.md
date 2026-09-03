# demo-nextjs-digital-signature-poc

A small, Dockerized Next.js system for **document review and approval with
digital signatures** - built as a two-hour spike to show how a feature like
this gets designed, layered, and tested, not to ship a signing product.

The interesting claim it makes: a signature that is only a picture of a
signature proves nothing. This demo captures the drawn signature people
expect *and* binds it cryptographically to the exact bytes of the document
that was approved, so that altering the document afterward is detectable.

```
Reviewer opens a document
  -> document bytes are hashed (SHA-256)
  -> reviewer draws their signature
  -> server signs (document hash + signer + timestamp + drawn-signature hash)
  -> the signing event is appended to a hash-chained audit log
  -> anyone can re-verify: bytes still match, signature still valid, chain intact
```

Change one byte of the document and verification flips to `TAMPERED`. That is
the demo.

---

## Why this shape

The point of a spike is to make the seams visible. Everything that could
plausibly be swapped in a real deployment is behind an interface, and the
domain logic that decides whether a signature is valid does not know that
Postgres, MinIO, or HTTP exist.

```
packages/core        Pure TypeScript. Domain model + rules. Zero I/O, zero
                     framework imports. This is where correctness lives, and
                     it is testable with no containers running.

packages/adapters    Implementations of the ports core defines - Postgres
                     repository, MinIO object storage, Ed25519 signer - plus
                     in-memory fakes used by the unit and integration tests.

apps/web             Next.js (App Router). UI + route handlers. Thin: it
                     parses requests, calls into core, renders results. No
                     business rules here.

infra                docker-compose - web, postgres, minio.

e2e                  Playwright. Includes demo.spec.ts, which is the live
                     demo script executed as a test.
```

### The ports

Defined in `packages/core`, implemented in `packages/adapters`. Core imports
none of the implementations.

| Port | Responsibility | Demo adapter | Real-world swap |
|---|---|---|---|
| `DocumentStore` | Store and fetch document bytes | MinIO | S3, Azure Blob |
| `SignatureRepository` | Persist signatures and their metadata | Postgres | any RDBMS |
| `AuditLog` | Append-only, hash-chained event log | Postgres | append-only store, WORM bucket |
| `Signer` | Sign and verify a payload | Ed25519, local key | KMS, HSM, DocuSign |
| `Clock` / `IdGenerator` | Time and identity | system | fixed values in tests |

`Signer` is the seam that matters most. Swapping local Ed25519 for a KMS-
backed key, or for a third-party e-signature vendor, is one adapter and no
change to the domain. That substitution is the architectural argument, and
the tests prove it: the same core test suite runs green against the real
signer and the fake.

### What is deliberately not here

Named so nobody has to guess whether it was forgotten:

- **No identity provider.** Signer identity is a header, not a login. In
  production this is OIDC, and the signer claim comes from a verified token.
- **No certificate authority / PKI.** Keys are generated at boot into a
  volume. Real deployments need managed keys, rotation, and revocation.
- **Not eIDAS or ESIGN/UETA compliant.** Legally binding e-signature carries
  consent, disclosure, and retention obligations this demo does not attempt.
- **No multi-party or sequential signing workflow.** One reviewer, one
  document, one signature.

---

## Running it

Requires Docker and Node 22. `make` is the source of truth - prefer it over
raw `docker compose` or `pnpm` invocations.

```bash
make up          # build + start web, postgres, minio; seeds a sample document
make down        # stop
make clean       # stop + wipe volumes (fresh keys, empty audit log)
make logs        # tail all services

make test        # vitest: unit + integration (integration needs `make up`)
make test-unit   # vitest unit only - pure core, no containers needed, fast
make test-e2e    # Playwright against a running stack (needs `make up`)
make test-e2e-headed   # same, headed and slowed, so you can watch it
make demo        # runs the Playwright demo script headed, as a live walkthrough

make verify      # CLI re-verification of every signature currently stored
make tamper      # mutates the stored sample document, to demo detection
```

Web at http://localhost:3000, MinIO console at http://localhost:9001.

Everything is env-driven; `.env.example` is the source of truth for what is
configurable. Nothing personal, no keys, no endpoints hardcoded in source.

---

## The demo script

Five minutes, in this order. `e2e/demo.spec.ts` performs exactly these steps,
so the script cannot silently rot away from the app.

1. **Open a document.** A sample agreement is seeded on `make up`. The header
   shows its SHA-256.
2. **Sign it.** Draw a signature. Submit. The approval record appears with a
   green `VERIFIED` badge.
3. **Show what was actually signed.** Expand the signature detail: it is not
   the image, it is a payload binding the document hash, the signer, the
   timestamp, and a hash of the drawn strokes. The image is evidence for a
   human; the payload is evidence for a machine.
4. **Tamper.** `make tamper` rewrites one byte of the stored document. Reload.
   The badge is red: `TAMPERED - document no longer matches signature`.
5. **Show the audit log.** Every event carries the hash of the one before it.
   Deleting or editing a past event breaks the chain, and the log page says
   which link broke.

If step 4 does not turn red, the demo has failed and there is no point
continuing to step 5.

---

## Testing

Two tools, deliberately, with a clear division of labor.

**vitest** covers everything that can be decided without a browser.

- *Unit* (`packages/core`): the rules. Hash computation is canonical and
  stable. A signature verifies against unmodified bytes and fails against
  modified ones. An audit chain with a spliced or dropped event is rejected,
  and the failure names the broken link. All pure functions, all fast, no
  Docker.
- *Integration* (`packages/adapters`): the implementations honor their ports.
  Each adapter is run against the same shared contract test suite that the
  in-memory fake passes - if Postgres and the fake disagree, the suite fails.
  This is what keeps the fakes honest enough to trust in unit tests.

**Playwright** covers what only a real browser can answer: that the canvas
captures strokes, that the round trip works end to end, and that the demo
script itself still runs. `demo.spec.ts` is both the smoke test and the
walkthrough - one artifact, so a passing CI run means the demo works.

The tamper case is tested at every level: as a pure function in core, through
the adapters in integration, and as a visible red badge in Playwright. It is
the one behavior worth over-testing, because it is the whole thesis.

---

## Status

Spike, dated 2026-09-03. Written to be read and discussed, not deployed.
See `CLAUDE.md` for conventions and the git workflow.

## License

MIT - see [LICENSE](LICENSE).
