# CLAUDE.md

Guidance for Claude Code when working in this repo.

## Status

Scaffolded 2026-09-03 by Opus 5 as a two-hour spike ahead of a 2pm meeting.

**Verified working, actually executed:** `packages/core` (43 tests),
`packages/adapters` against real Postgres and MinIO (24 tests), the compose
stack, and the `make up / sign / verify / tamper / verify` sequence. Cold start
from `make clean` is about three seconds. `pnpm -r typecheck` is clean.

**Not yet built:** `apps/web` and the Playwright suite. The demo script in
`README.md` is command-line only until those land. Treat anything not listed as
verified above as unproven until actually executed and seen to work - don't
report a step as working because the code for it exists.

## What this is

A Dockerized Next.js demo of document review and approval with digital
signatures, built to show architecture and testing practice rather than to
ship. Read `README.md` for the full picture; the one-paragraph version:

```
packages/core       pure domain - model, hashing, signature rules, audit
                    chain. Zero I/O, zero framework imports.
packages/adapters   port implementations (postgres, minio, ed25519) plus the
                    in-memory fakes used in tests
apps/web            Next.js App Router - UI + route handlers, thin
infra               docker-compose: web, postgres, minio
e2e                 Playwright, including demo.spec.ts (the demo script)
```

The load-bearing rule: **`packages/core` never imports from `packages/adapters`,
`apps/web`, or any I/O library.** Dependencies point inward. If a change needs
core to know about Postgres, MinIO, HTTP, or the filesystem, the design is
wrong - add a port to core and implement it in adapters instead. This is the
thing the demo exists to demonstrate, so breaking it defeats the purpose.

Every port has both a real adapter and an in-memory fake, and both are run
against the same contract test suite. When adding a port, add both, or the
fakes drift and the unit tests stop meaning anything.

## Prerequisites are Docker Desktop and Node 24. Nothing else.

This is a hard constraint, not a preference. Anyone should be able to clone and
run this with only Docker Desktop and Node 24 (current LTS, pinned in `.nvmrc`
and `engines`) on their machine. **Do not add a step that requires installing
anything else** - no global CLIs, no Python, no cloud account, no manually
installed pnpm. If a feature seems to need one, put it in a container.

pnpm comes from Corepack, which ships with Node 24, driven by the
`packageManager` pin in the root `package.json`. `corepack enable` once, and
the correct pnpm version is fetched automatically.

**pnpm workspace, never npm.** Never run `npm install`, `npm run`, or `npx`
here or suggest them to the user - use `pnpm`, `pnpm add`, `pnpm dlx`. If a
`package-lock.json` appears, npm was run by mistake: delete it and redo with
`pnpm install`.

The user is coming from npm and has npm muscle memory. Always give them the
pnpm command, not the npm one, and point at
[docs/guides/pnpm-for-npm-users.md](docs/guides/pnpm-for-npm-users.md) rather
than re-explaining `--filter` from scratch. Keep that guide current when the
root scripts change.

## TypeScript that Node can run directly

Scripts and tests run as `.ts` through Node 24's built-in type stripping, which
is why there is no build step and no `tsx`/`ts-node` dependency. Strip-only
mode erases types; it cannot *generate* code. That rules out:

- **Parameter properties** - `constructor(private readonly pool: Pool) {}`
  fails at runtime with `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`. Declare the field
  and assign it in the body. This bit us once already.
- **`enum`** - use a union of string literals or `as const`.
- **`namespace`** with runtime members, and legacy decorators.

Relative imports need the **explicit `.ts` extension** (`./hash.ts`, not
`./hash`) - Node's ESM resolver does not guess extensions. `tsconfig.json` sets
`allowImportingTsExtensions`, and Vite/vitest handle it fine.

## Commands

`make` is the source of truth - prefer it over raw `docker compose` or `pnpm`:

```bash
make setup       # first run: .env + pnpm install
make start       # up + web in one shot - what a person running this wants
make up          # postgres + minio, schema, seeded sample document (~3s)
make web         # just the app (needs `make up`)
make down        # stop, keep data
make clean       # stop + wipe volumes AND the signing key
make logs / ps

make test        # test-unit + test-integration
make test-unit   # pure core, no containers, ~1s - the fast loop
make test-integration   # real postgres + minio, needs `make up`
make typecheck

make sign        # sign the sample document from the CLI
make verify      # re-verify everything; exits non-zero on any failure
make tamper      # rewrite the stored document, to demo detection
```

`make verify` exiting non-zero after `make tamper` is correct behavior, not a
break - it is meant to be usable as a check.

The root `package.json` scripts (`pnpm start`, `pnpm stop`, `pnpm test`, ...)
are thin wrappers that shell out to these targets. **Put new behavior in the
Makefile, not in a package script** - duplicating a compose invocation or an
env-loading incantation in both is how the two drift apart.

`make web` sources `.env` itself. Next only auto-loads a `.env` next to the app
(`apps/web`), not the one at the repo root, so running `pnpm --filter @sig/web
dev` directly fails with a missing `DATABASE_URL`. Use the make target.

`make test-unit` is the fast loop - use it while working in `packages/core`.
Only reach for `make up` when touching adapters, routes, or UI.

## Git workflow

- **Branch naming:** `YYYY.MM.DD/short-description`, e.g.
  `2026.09.03/scaffold-and-conventions` - the date the branch was created,
  then a short kebab-case description. Not `feature/x` or `fix-y`.
- **Never commit directly to `main`.** Branch off `main`, open a PR against
  `main` when ready.
- **Include a screenshot in the PR for any visible-output change** (UI, badge
  states, audit log page). Generate it headlessly via the Playwright suite
  rather than relying on interactive screen capture - `make test-e2e` is
  already driving a real browser, so capture there. Save the PNG under
  `assets/`, commit it on the branch, and embed it in the PR body via the raw
  GitHub URL (`https://raw.githubusercontent.com/TheRobBrennan/demo-nextjs-digital-signature-poc/<branch>/assets/<file>.png`)
  - a relative path or a `../blob/...` link does not resolve in a PR body.
- A **Discord webhook** is configured on this repo (GitHub repo webhook ->
  Discord `.../github`, all events). It only fires for events after it was
  created at 2026-09-03 18:35Z, which is why the initial commit posted
  nothing. Pushes and PRs from here on will post.

## Conventions

- **Env-driven, nothing hardcoded.** Ports, credentials, bucket names, key
  paths all come from `.env`; `.env.example` is the source of truth for what
  is configurable. Never hardcode a personal email, endpoint, or key into
  source or into a test fixture.
- **Integration tests never touch demo data.** Each run gets a throwaway
  Postgres schema and throwaway MinIO buckets, cleaned up afterward. A test run
  must not wipe the document you are about to show someone.
- **Signing keys are generated on first use into a gitignored path** and are Never commit a private key, not even a demo one - `make clean`
  regenerates.
- **Testing is split on purpose:** vitest for anything decidable without a
  browser (core rules, adapter contracts), Playwright for what needs a real
  one (canvas strokes, full round trip). Don't write a Playwright test for
  something core could assert directly - it is slower and it hides where the
  logic actually lives.
- **The tamper-detection path is the thesis of the demo.** It is tested at all
  three levels deliberately. Don't consolidate those tests as duplication.
- **`e2e/demo.spec.ts` is the demo script.** If the demo walkthrough in
  `README.md` changes, change that test in the same commit, and vice versa -
  they are two views of one thing, and CI is what keeps them honest.
- **Architecture decisions with real trade-offs get an ADR** in `docs/adr/`,
  numbered sequentially. Write it when the decision is made, not afterward, and
  include the alternatives that were rejected and why. If a reader would have to
  ask "why this and not the obvious thing," that is an ADR.
- **Prefer deleting over disabling.** No skipped tests, no commented-out
  blocks left behind. This is a spike someone will read closely.
- **No em dashes** in code comments, docs, commits, or PR bodies - use a
  single hyphen.
