# pnpm for npm users

This repo uses **pnpm** instead of npm. If you have only used npm, this is
everything you need. pnpm is roughly 95% the same commands, with a few
differences that matter in a workspace like this one.

**You may not need any of it.** Every task in this repo has a `make` target,
and the make targets call pnpm for you. `make start`, `make test`, `make clean`
will get you through the whole demo without typing `pnpm` once. Read on only if
you want to work in the code.

## 1. Installing pnpm - you already did

Do **not** `brew install pnpm` or run a curl installer. This project's
prerequisites are Docker Desktop and Node 24, and pnpm is not a third one.

Node 24 ships **Corepack**, which reads the `packageManager` field in the root
`package.json` and fetches exactly that version of pnpm on first use:

```bash
corepack enable      # once per machine
```

That is the whole install. Everyone on the project gets the identical pnpm
version, which is the point of pinning it.

## 2. The mental model

- **npm** copies every dependency into each project's `node_modules`. A hundred
  projects using React means a hundred copies on disk.
- **pnpm** stores each package **once** in a global content-addressable store
  and hard-links it into `node_modules`. Faster installs, far less disk, and a
  stricter layout that catches "phantom dependency" bugs - using a package you
  never actually declared.

Practical upshot: if pnpm says a package is not found even though the import
looks fine, the fix is usually to **add it to that package's `package.json`**
rather than leaning on a transitive dependency. That is a feature.

## 3. Command cheat sheet

| Task | npm | pnpm |
|---|---|---|
| Install all deps | `npm install` | `pnpm install` (or `pnpm i`) |
| Add a dependency | `npm install pg` | `pnpm add pg` |
| Add a dev dependency | `npm install -D vitest` | `pnpm add -D vitest` |
| Remove a dependency | `npm uninstall pg` | `pnpm remove pg` |
| Run a script | `npm run dev` | `pnpm dev` (the `run` is optional) |
| Run a one-off binary | `npx create-next-app` | `pnpm dlx create-next-app` |
| Run an installed bin | `npx vitest` | `pnpm exec vitest` |
| Clean install (CI) | `npm ci` | `pnpm install --frozen-lockfile` |

Two changes worth memorizing: **`npx` becomes `pnpm dlx`** (download and run) or
**`pnpm exec`** (run something already installed), and the lockfile is
**`pnpm-lock.yaml`**. Commit the lockfile.

## 4. Workspaces - the genuinely new part

This repo is one git repo containing several packages. `pnpm-workspace.yaml`
lists them:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

Which gives you `--filter`, to run a script in one package without `cd`-ing:

```bash
pnpm --filter @sig/core test          # unit tests for the domain only
pnpm --filter @sig/adapters test      # integration tests
pnpm --filter @sig/web dev            # the Next.js app
pnpm --filter @sig/web add zod        # add a dep to the web app only
```

`--filter` matches the `name` in that package's `package.json`, not the folder.
The names here are `@sig/core`, `@sig/adapters`, and `@sig/web`.

One root `pnpm install` wires up the entire workspace. You do not install
per-package.

### Workspace dependencies

`apps/web` depends on `@sig/core` with the version `workspace:*`. That means
"use the copy in this repo," not something from the registry. Edit
`packages/core`, and the web app sees the change immediately - no build, no
publish, no `npm link`.

## 5. What you will actually run here

The root scripts wrap the make targets, so you rarely type `--filter`:

```bash
pnpm install            # install the whole workspace
pnpm start              # = make start  (services up, then the app)
pnpm stop               # = make down
pnpm clean              # = make clean  (wipes volumes and the signing key)
pnpm dev                # = make web    (just the app)
pnpm test               # = make test   (unit + integration)
pnpm test:unit          # = make test-unit  (pure core, no containers, ~1s)
pnpm test:integration   # = make test-integration  (needs `make up`)
pnpm typecheck          # = make typecheck
```

These are thin wrappers around the matching `make` target. The Makefile is the
single source of truth for the actual `docker compose` invocation and the
environment loading, so the two cannot drift apart. Use whichever you have
muscle memory for; they are identical.

**One thing not to do:** `pnpm --filter @sig/web dev` directly. Next only
auto-loads a `.env` sitting next to the app, and this repo's `.env` is at the
root, so you will get `Missing required environment variable DATABASE_URL`. Use
`make web` (or `pnpm dev`), which exports it first.

## 6. Gotchas coming from npm

- **No `npx`.** Use `pnpm dlx <pkg>` to download and run, or `pnpm exec <bin>`
  for something already installed. Plain `npx` may still work since it ignores
  pnpm, but prefer the pnpm forms so versions stay consistent.
- **Stricter resolution.** An import that worked under npm and fails here is a
  phantom dependency. `pnpm add` it to the package that imports it.
- **The lockfile is `pnpm-lock.yaml`.** If a `package-lock.json` appears, npm
  was run by mistake - delete it and redo with `pnpm install`.
- **`node_modules` looks strange** - symlinks and a `.pnpm/` folder. That is
  intentional. Do not try to fix it.
- **`pnpm install` at the root is the only install you need.**

## 7. Optional shell aliases

If you keep `np*` aliases for npm, the mirrored `pp*` set covers the scripts
that actually exist in this repo:

```bash
alias ppi="pnpm install"
alias ppr="pnpm run"
alias pps="pnpm start"
alias ppst="pnpm stop"
alias ppt="pnpm test"
alias ppc="pnpm clean"
alias ppx="pnpm dlx"     # pnpm's npx
```

Additive - leave your npm aliases alone, since other repos still use npm.

## 8. If you would rather not learn pnpm at all

Use `make`. Every target in the README calls pnpm on your behalf, and the demo
walkthrough - `make start`, `make sign`, `make verify`, `make tamper` - never
requires you to type a pnpm command.
