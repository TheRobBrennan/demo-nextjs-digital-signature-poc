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

packages/core
  /testkit           The in-memory fakes AND the contract test suites every
                     adapter must pass. Core owns the port, so core owns the
                     contract; adapters import it and run it against the real
                     thing.

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

### Prerequisites - two things

1. **Docker Desktop**
2. **Node 24** (current LTS) - `nvm use` picks it up from `.nvmrc`

That is the whole list. You do **not** need to install pnpm: this repo pins
`packageManager` in `package.json`, and Node 24 ships Corepack, which fetches
the right pnpm version on first use. Coming from npm, or would rather not learn
pnpm at all? See
[docs/guides/pnpm-for-npm-users.md](docs/guides/pnpm-for-npm-users.md) - the
short version is that every task here has a `make` target, so you never have to
type `pnpm`.

```bash
corepack enable      # once per machine
nvm use              # reads .nvmrc -> Node 24
```

Postgres, MinIO, the signing key, and the sample document all live in
containers or in volumes. Nothing is installed on the host, and `make clean`
takes the machine back to where it started.

`make` is the source of truth - prefer it over raw `docker compose` or `pnpm`.

```bash
make setup       # first run only: create .env and install workspace deps
make start       # everything in one shot: services up, then the app
make up          # start postgres + minio, apply schema, seed a sample document
make web         # just the Next.js app (needs `make up` already running)
make down        # stop, keep data
make clean       # stop + wipe volumes and the signing key (fresh identity)
make logs / ps   # tail logs / show service status

make test        # all vitest suites: unit + integration
make test-unit   # pure core only - no containers needed, ~1s
make test-integration   # real postgres + minio (needs `make up`)
make typecheck   # tsc --noEmit across the workspace

make sign        # sign the sample document from the CLI (SIGNER=name)
make verify      # re-verify every stored signature and the audit chain
make tamper      # rewrite one byte of the stored document, to demo detection
```

The short version for a first run:

```bash
corepack enable && nvm use
make setup
make start        # or: pnpm start
```

`pnpm start`, `pnpm stop`, `pnpm test` and friends are thin wrappers that shell
out to the make targets, so there is one source of truth for the compose
invocation and the environment handling.

`make up` takes about three seconds on a warm image cache. MinIO console at
http://localhost:9001 (credentials in `.env`), where you can watch the stored
object change when `make tamper` runs.

### The whole thesis, from a cold start

```bash
make up          # seeds services-agreement.txt
make sign        # real Ed25519 signature over the stored bytes
make verify      # VERIFIED
make tamper      # rewrites the fee from $10,000 to $90,000
make verify      # TAMPERED (document-hash-mismatch), and exits non-zero
```

Nothing about the signature record is touched by `make tamper` - only the
object in storage. That is the point.

Everything is env-driven; `.env.example` is the source of truth for what is
configurable. Nothing personal, no keys, no endpoints hardcoded in source.

---

## The demo script

The presenter's version, with talk track, likely questions, and recovery steps,
is in [docs/demo-script.md](docs/demo-script.md).

Five minutes, in this order. Once `apps/web` and the Playwright suite exist,
`e2e/demo.spec.ts` will perform exactly these steps, so the script cannot
silently rot away from the app. Until then, steps 1-5 are runnable today from
the command line - see "The whole thesis, from a cold start" above.

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

## Decisions

Architecture decisions with real trade-offs are written down in `docs/adr/`:

- [ADR 0001 - MinIO for document storage](docs/adr/0001-minio-for-document-storage.md),
  which also explains what MinIO is for anyone who has not used it.

Guides, for tools this repo uses that you may not have met:

- [pnpm for npm users](docs/guides/pnpm-for-npm-users.md) - the cheat sheet,
  workspaces and `--filter`, and the gotchas coming from npm.
- [What an ADR is](docs/adr/README.md) - why these documents exist and when to
  write one.

## Status

Spike, dated 2026-09-03. Written to be read and discussed, not deployed.
See `CLAUDE.md` for conventions and the git workflow.

**Built, run, and verified right now:**

- `packages/core` - domain model, canonical hashing, signing and verification
  rules, hash-chained audit log. 43 vitest tests, no containers needed.
- `packages/adapters` - Postgres (signatures + audit chain), MinIO via the AWS
  S3 SDK (document bytes), Ed25519 signer with a persisted key. 24 tests
  against the real services, including the tamper path end to end.
- `infra/docker-compose.yml` and the `make` targets above. Cold start from
  wiped volumes to a seeded, signable document: about three seconds.

67 tests pass and `tsc --noEmit` is clean across the workspace.

**Not built yet:** `apps/web` (the UI, the canvas, the badge) and the Playwright
suite. The demo script above is currently a command-line walkthrough; the
browser half is still to come.

## License

MIT - see [LICENSE](LICENSE).
