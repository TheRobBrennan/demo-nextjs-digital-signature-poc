# Architecture Decision Records

## What an ADR is

An **Architecture Decision Record** is a short document capturing one
significant technical decision: what was decided, what the situation was, what
else was considered, and what it costs.

The problem it solves is a familiar one. Six months after a choice is made,
the reasoning behind it has evaporated. The code shows *what* was built but
never *why*, and the alternatives that were carefully considered and rejected
leave no trace at all. So the next person - often the same person - either
re-litigates a settled question, or worse, "fixes" something that was
deliberate. An ADR is the note the team leaves for its future self.

The format comes from Michael Nygard's 2011 write-up and has since become a
common practice. Its virtues are that it is short, it lives in the repo next to
the code it explains, and it is versioned alongside it.

## What makes it different from other docs

- **A README says how to use the thing.** An ADR says why the thing is shaped
  the way it is.
- **A design doc is written before the work, and proposes.** An ADR is written
  when the decision is made, and records.
- **An ADR is immutable once accepted.** You do not edit an old ADR when you
  change your mind. You write a new one that supersedes it, and mark the old
  one `Superseded by ADR NNNN`. The trail of superseded decisions is the point:
  it shows how the thinking moved.

## When to write one

The test used in this repo, from `CLAUDE.md`: **if a reader would have to ask
"why this and not the obvious thing," that is an ADR.**

Worth recording:
- Choosing between technologies that a reasonable person would pick differently
  (MinIO over a plain Docker volume).
- Deliberately accepting a cost (an extra container, a lost transaction
  boundary).
- A constraint that shapes everything downstream (prerequisites are Docker
  Desktop and Node 24, nothing else).

Not worth recording: naming conventions, formatting, anything with an obvious
right answer, or anything already enforced by a linter.

## The shape of one

Each file is `NNNN-short-kebab-title.md`, numbered sequentially and never
renumbered. The headings used here:

- **Status** - Proposed, Accepted, Superseded by ADR NNNN, or Deprecated
- **Date** and **Context** - what was true when this was decided, including
  constraints that would not be obvious later
- **The decision** - stated plainly, in one or two sentences
- **Why not the alternatives** - the options rejected, and the actual reason.
  This is the most valuable section and the one most often skipped.
- **Consequences** - what gets better and what gets worse. An ADR with no costs
  listed is marketing, not a record.

Write it in prose, keep it to a page, and assume the reader is a competent
engineer who was not in the room.

## The records

| # | Title | Status |
|---|---|---|
| [0001](0001-minio-for-document-storage.md) | MinIO for document storage | Accepted |
