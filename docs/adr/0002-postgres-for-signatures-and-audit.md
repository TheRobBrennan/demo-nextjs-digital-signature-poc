# ADR 0002: Postgres for signature records and the audit chain

- **Status:** Accepted
- **Date:** 2026-09-03
- **Context:** Two-hour spike, demoed locally on a laptop

## The two kinds of data here

This system stores two things, and they want different homes:

- **Document bytes** - big, opaque, write-once. These go in MinIO, for the
  reasons in [ADR 0001](0001-minio-for-document-storage.md).
- **Signature records and audit events** - small, structured, queried by
  relationship ("every signature on this document", "every event in order").
  Those are this document's subject.

Putting both in one store would mean one of them living somewhere unsuited to
it. Splitting them is the decision; which store to use for the structured half
is the rest of it.

## The decision

Use **Postgres** for signature records and the audit chain, behind the
`SignatureRepository` and `AuditLog` ports defined in `packages/core`.

## Why Postgres

**The audit chain needs real transactions.** Appending an event means reading
the current tail and writing the next link. Two concurrent appends that both
read the same tail would fork the chain and make it unverifiable. The
implementation takes a table lock inside a transaction; without genuine
transactional semantics that guarantee does not exist, and the tamper-evidence
claim quietly becomes decorative. This is the single biggest reason.

**Ordering has to be exact.** `seq` is a strict sequence, and verification
walks it looking for gaps. A store with eventual consistency or approximate
ordering makes "was an event deleted?" unanswerable.

**Constraints are worth having.** A primary key on `seq`, a unique `id`, and a
foreign-key-shaped relationship from signatures to documents mean malformed
data is rejected at write time rather than discovered during a verification
that was supposed to be about tampering.

**It is what a healthcare product would already be running.** Nothing here is
exotic. Managed Postgres exists on every cloud, it is HIPAA-eligible on all of
them, and the operational story - backups, point-in-time recovery, replication
- is understood by everyone likely to inherit this.

## Why not the alternatives

**SQLite.** Genuinely tempting for a spike: no container, no credentials, one
file. Rejected because it would misrepresent the concurrency problem. The
audit-append path is the interesting piece of engineering here, and SQLite's
single-writer model would make the table lock look like ceremony rather than a
real answer to a real race. It would also make the demo's "this is roughly what
production looks like" claim untrue.

**MongoDB or another document store.** The data is relational - signatures
belong to documents, events form a strict sequence - and multi-document
transactional guarantees are exactly what the chain depends on. Choosing a
store whose defaults are weakest at the thing this system needs most would be
backwards.

**A dedicated append-only ledger** (QLDB, immudb, or similar). Closest to a
principled fit: they are built for verifiable history. Rejected as too much
surface for a two-hour spike, and because the hash chain is only about eighty
lines of code in `packages/core/src/audit.ts` and is worth showing rather than
delegating. The whole argument is that tamper-evidence is a property you can
implement and verify yourself, not one you must buy. If this became a product,
a ledger is a legitimate substitute - and it would be a new `AuditLog` adapter,
with core untouched.

**A blockchain.** No. There is one writer, one organization, and no trust
problem between mutually suspicious parties. A hash chain in Postgres provides
the tamper-evidence; distributed consensus solves a problem nobody here has.

## Consequences

**Good.**
- The audit chain's correctness rests on transactional guarantees that
  genuinely hold, and there is a concurrency test proving it.
- Nothing about the deployment story is unusual or hard to hand over.

**Bad.**
- Two stores means a write to MinIO and a write to Postgres with no shared
  transaction. A crash between them can orphan a blob. Acceptable: an orphaned
  blob is harmless and the audit log records what actually happened. A
  production system would reconcile with a sweep or an outbox.
- The table lock serializing appends will not survive real write volume. It is
  correct, not fast. At scale the answer is an identity column with the chain
  computed on read, or a single-writer outbox - noted in the code where the
  lock is taken.
- `audit_events.at` is stored as `text`, not `timestamptz`, because the
  timestamp is hashed content and must come back byte-identical. A timestamptz
  round trip can renormalize precision and silently break every hash in the
  chain. That is a deliberate trade of native date types for verifiability.
