# Demo script - Yuzi Care preview, 2026-09-03

## The one command

```bash
pnpm demo
```

Resets Docker, brings Postgres and MinIO up from nothing, starts the app, opens
a browser the client watches, and steps through the walkthrough **one beat at a
time - you press Enter to advance**, so the pacing is yours.

Each beat prints its talk track to your terminal and paints a caption across
the bottom of the page for them.

- `Enter` advances
- `q` quits early
- Closing the browser window ends it cleanly
- `Ctrl-C` is always safe

Autoplay, for a rehearsal or if you would rather narrate over it without
touching the keyboard:

```bash
pnpm demo:auto              # ~5s per beat
STEP_DELAY=8000 pnpm demo:auto   # slower
```

Both start Docker and the app themselves. `make preflight`, `make rehearse`
and `make test-e2e` do **not** - they run against an app you already have
running, and will tell you so if it is not up.

It leaves Docker running and the document tampered. `make clean && make up`
resets.

The rest of this document is the same walkthrough for driving by hand, plus the
questions and recovery steps.

Twelve minutes if nobody interrupts, which they will. The optional sections at
the end are there to be pulled in when a question opens the door, not to be
worked through in order.

The one thing to land: **a signature that is only a picture of a signature
proves nothing.** Everything else is supporting material.

---

## Before the call - five minutes, not one

```bash
cd ~/repos/demo-nextjs-digital-signature-poc
make clean && make up      # wipes volumes and the key, reseeds - ~5s
```

Then, in a second terminal, because it runs in the foreground:

```bash
make web
```

Then run the checks and watch them happen:

```bash
make preflight     # headed Playwright, ~12s, you see each check run
```

Five assertions, in a visible browser window: the app is up and serving the
seeded document, the fee still reads **$10,000** (a `$90,000` here means the
stack is dirty from a rehearsal - `make clean && make up`), nothing is signed
yet, the audit chain is intact, the signing controls are ready with **Sign
document** correctly disabled, and the MinIO console is reachable.

If it passes, you are ready. If it fails, it names which check failed.

Then open the real tabs - your own browser, not Playwright's:

```bash
make open          # app + MinIO console in your default browser
```

| What | Where | Expect |
|---|---|---|
| The app | http://localhost:3000 | document, empty signature list, `CHAIN INTACT` |
| MinIO console | http://localhost:9001 | login `sigdemo` / `sigdemo123`, `documents` bucket |
| Terminal | `make verify` | `no signatures yet`, `chain intact` |

Have open, in this order: the browser on the app, a terminal in the repo, and
the MinIO console in a background tab. Close Slack, Discord, and anything that
will fire a notification over a shared screen.

**Do not run `make clean` again once you are on the call.** It works, but the
five seconds of container churn is dead air you do not need.

---

## The script

### 1. The document (1 min)

Open http://localhost:3000.

> "This is a services agreement sitting in object storage. That hash at the top
> is a SHA-256 of the actual bytes of the file, computed fresh on every page
> load - not stored alongside it and trusted."

Point at the fee: **$10,000**. Say the number out loud. It has to be in their
head for step 4 to land.

### 2. Sign it (2 min)

Draw a signature in the box. Type a name. Click **Sign document**.

Green **VERIFIED** badge appears.

> "That is what everyone expects an e-signature product to do. If we stopped
> here, we would have built the same thing most of them ship - a picture of a
> signature stored next to a document."

### 3. What was actually signed (2 min) - the important one

Point at the detail table under the signature: document hash, strokes hash,
signature.

> "What got signed cryptographically is not the image. It is a payload binding
> four things: the hash of the document, who signed it, when, and a hash of the
> strokes they drew. The image is evidence for a human. The payload is evidence
> for a machine.
>
> Which means the picture and the cryptography cannot drift apart. Swap the
> image out later and the strokes hash stops matching."

Do not rush this. This is the part that separates the demo from a UI mockup.

### 4. Tamper (2 min) - the payoff

**Where the modification is actually demonstrated.** Three layers of evidence,
in increasing order of how hard they are to dismiss:

1. **The page** - the fee changes to $90,000 and the badge goes red. A skeptic
   can call this UI theater.
2. **The hash, before and after** - `pnpm demo` prints the object's SHA-256
   read straight from storage on either side of the click, so the two values
   sit next to each other in your terminal.
3. **`make verify` from the terminal** - same TAMPERED verdict, computed
   outside the browser entirely, reading the bytes out of object storage. This
   is the one that closes the argument.

For a fourth, if someone is really pushing: the MinIO console, `documents`
bucket, and the object's **Last Modified** timestamp. That is the edit on disk,
in a tool that knows nothing about this application.

> "Now suppose someone gets access to the document store. Not the database -
> just the file storage. They cannot forge a signature, so instead they edit
> the agreement."

Click **Tamper with document**.

Let the page reload. Then stop talking and let them read it:

- The fee now says **$90,000**
- The badge is red: **TAMPERED**
- The two hashes are printed underneath - `signed over:` and `found now:`

> "Nothing about the signature record was touched. The signature is still
> perfectly valid - it just no longer describes this document. That is the
> difference between a signature that decorates a file and one that is bound to
> it."

Optional, if the room is technical: run `make verify` in the terminal so they
see the same result from outside the browser, and note it exits non-zero so it
works as a check in CI.

### 5. The audit log (1 min)

Scroll down.

> "Every event carries the hash of the event before it. Editing or deleting a
> past entry breaks the chain, and the log says which link broke. It is
> append-only in a way you can actually verify, rather than append-only because
> we promised not to run DELETE."

Note that the chain still reads `CHAIN INTACT` after tampering - correct, since
the log faithfully recorded the tampering as its own event.

### 6. How it is built (3 min)

Switch to the editor. Show `packages/core/src/ports.ts`.

> "Everything that touches the outside world is behind an interface defined by
> the domain. Postgres, object storage, the signer, even the clock. The domain
> logic does not know any of them exist.
>
> The reason that matters for you: swapping local Ed25519 for AWS KMS, or for
> DocuSign, is one adapter. The rules about what makes a signature valid do not
> change, and neither do the tests that prove them."

Then `packages/core/src/testkit/contracts.ts`:

> "The domain also owns the contract tests. The in-memory fakes and the real
> Postgres adapter run the identical suite, so a fast unit test written against
> a fake is asserting behavior the real database demonstrably shares. That is
> what makes 43 tests that run in a second actually worth something."

Land it:

```
72 tests, about six seconds. Cold start from nothing, about three.
Prerequisites: Docker Desktop and Node 24. That is the whole list.
```

### 7. What is deliberately missing (1 min)

Say this before they ask. It buys more credibility than the demo does.

> "This is a spike, so let me be clear about what is not here. There is no
> identity provider - the signer is a form field, not a verified token. No key
> management: the key is generated into a volume, and a real deployment needs
> KMS with rotation and revocation. It is not eIDAS or ESIGN compliant, which
> is a consent-and-disclosure problem more than a crypto problem. And there is
> no multi-party signing flow.
>
> All of that is written down in the README rather than left for someone to
> discover."

---

## Questions they will probably ask

**"How long did this take?"**
About two hours, with Claude Code. Worth being precise - the architecture and
the tests are the part that took thought; the typing was fast.

**"Is this HIPAA compliant?"**
No, and nothing is compliant by itself - compliance is a property of a
deployment, not a library. What is here that helps: tamper-evident audit
logging, cryptographic binding of approvals to exact document bytes, and
`us-west-2` which is HIPAA-eligible. What is missing: a BAA, encryption at rest
configured deliberately, access control, retention policy.

**"Could this replace DocuSign?"**
No, and it should not. DocuSign carries legal infrastructure - identity
verification, consent flows, court-admissible certificates. What this shows is
that if you ever wanted to move off it, or wrap it, the `Signer` interface is
the seam where that happens without rewriting the application.

**"Why not just store a PDF with a signature image?"**
That is exactly what step 4 argues against. Demo it again if needed.

**"What would you do next?"**
Containerize the web service, real identity, then multi-party sequential
signing. In that order, because the first two are prerequisites for the third
meaning anything.

---

## If something breaks

**Badge says INVALID SIGNATURE instead of TAMPERED.** The web process and the
CLI disagree about the signing key. Was a real bug, fixed - if it reappears,
stop `make web`, `make clean && make up`, restart. Do not debug it live; skip
to the architecture section.

**Page returns 500.** `make ps` - a container did not come up. `make down &&
make up`.

**Port already in use.** Something else is on 5432, 9000, or 3000. Local
Postgres is the usual culprit. `POSTGRES_PORT` in `.env` moves it.

**Canvas will not draw.** Use the trackpad rather than a mouse if a tablet
display is mirrored, or fall back to `make sign` in the terminal and talk over
it.

**Want to watch the whole thing run once more before they arrive?**

```bash
make demo          # headed Playwright, drives the entire walkthrough
make clean && make up   # then reset - it leaves the document tampered
```

**Total loss.** The CLI walkthrough is the whole demo without a browser:

```bash
make sign && make verify && make tamper && make verify
```

---

## Reset between runs

```bash
make clean && make up
```

Wipes volumes and the signing key, reseeds the document, and leaves `make web`
running untouched.
