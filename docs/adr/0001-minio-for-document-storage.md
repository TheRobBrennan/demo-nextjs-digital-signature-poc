# ADR 0001: MinIO for document storage

- **Status:** Accepted
- **Date:** 2026-09-03
- **Context:** Two-hour spike, demoed locally on a laptop

## What MinIO is, for anyone who has not run into it

MinIO is an **object store you run yourself that speaks Amazon S3's API.**

An object store is not a filesystem and not a database. You hand it bytes with
a name (`documents/agreement.txt`), and later you ask for those bytes back. No
directories to manage, no rows, no schema. It is what S3, Google Cloud Storage,
and Azure Blob Storage all are, and it is the normal place to put files that an
application did not author - uploads, PDFs, images, scans.

The useful part for a demo is the second half: **MinIO implements the S3 API.**
The same AWS SDK call that talks to `s3.amazonaws.com` in production talks to a
container on `localhost:9000` here, with nothing changed but an endpoint and a
credential. So the demo is not using a pretend version of object storage that
would be swapped for the real thing later. It is using the real protocol,
pointed somewhere local.

It ships a browser UI on port 9001, which is genuinely handy during the demo:
you can open the bucket, see the stored document sitting there as an object,
and watch it change when `make tamper` runs.

## The decision

Store document bytes in **MinIO**, behind the `DocumentStore` port defined in
`packages/core`. Signature records and audit events go in Postgres; only the
document blobs go here.

## Why not the alternatives

**A Docker volume / the container filesystem.** Simplest possible option, and
genuinely fine for a demo of this size. Rejected because it teaches the wrong
lesson: the moment this runs on more than one instance, local disk stops
working, and the code that reads and writes files has to be rewritten rather
than reconfigured. Using the S3 API from the start means the production
migration is an endpoint change. For a spike whose entire purpose is to show
how the seams are drawn, quietly picking the option with the worst seam would
undercut the argument.

**Bytes in a Postgres `bytea` column.** One less service, and transactional
with the signature record, which is a real advantage. Rejected because large
binaries in a relational database bloat backups, strain replication, and push
you toward streaming workarounds as documents grow. It is a well-known
anti-pattern for anything approaching realistic document sizes, and healthcare
documents are not small.

**Real AWS S3.** Rejected outright for a laptop demo. It would require an AWS
account, credentials, and network access, and it would make the demo fail in a
room with bad wifi. The prerequisites for this project are Docker Desktop and
Node 24, and that stays true.

## Consequences

**Good.**
- The storage adapter is written against the AWS SDK, so pointing it at real S3
  is configuration, not a rewrite.
- The `DocumentStore` port stays honest - it is shaped by an actual object
  store's constraints, not by whatever the local filesystem happens to allow.
- The MinIO console gives the demo a visible "here is the document, in
  storage" moment that a Docker volume cannot.

**Bad.**
- One more container to start, and roughly 100MB of image. `make up` is slower
  than it would be with a volume.
- Writing the blob and inserting the signature row are two operations across
  two systems, with no shared transaction. A crash between them can leave an
  orphaned object. Acceptable here: an orphaned blob is harmless, and the audit
  log is the record of what actually happened. A production system would
  reconcile with a sweep or an outbox.
- Anyone reading the repo now has to know what MinIO is, which is what this
  document is for.

## Notes

Credentials are the MinIO defaults, set in `.env` and never in source. They are
demo credentials for a container bound to localhost - do not reuse them
anywhere that matters.
