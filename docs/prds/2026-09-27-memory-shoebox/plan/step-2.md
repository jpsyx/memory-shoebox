# Step 2: The server spine

**Status:** done
**Parallel with:** nothing: this step is sequential
**Depends on:** step 1

## What this step delivers

Everything in `apps/server` that is not a route and that every route needs: the
request context, the error envelope in practice, rate limiting, the job runner
with all seven jobs registered, the Backblaze client, and the outbound mail
queue with its worker and its renderer. No product feature, and no route beyond
the health endpoint that already exists.

Mail is here rather than in a later step because nothing else can be
demonstrated without it: the first thing a person does with this product is ask
for a sign-in code.

**Done when:** a job runs on its cadence and is visibly idempotent; a row
inserted into `outbound_emails` by hand is claimed, rendered in both HTML and
plain text, sent through Resend and marked `sent`; a second insert with the same
`idempotency_key` is rejected by the database; and a request that trips a rate
limit returns `429` with `details.retryAfterSeconds`.

## How to execute this step

You are implementing **only this step**. Other steps are listed at the foot of
this file; they are not yours and several are deliberately not designed yet.

**Two different documents are called a spec here, so they are named apart
throughout.** The **product spec** is `docs/PRODUCT.md` and
`docs/prds/2026-09-27-memory-shoebox/design-spec.md`: they already exist, they
cover the whole product, and you only read them. Your **step design** is what
you write for this step alone, under `docs/superpowers/specs/`.

Run the full superpowers cycle, scoped to this step:

1. **`superpowers:brainstorming`.** Read the documents under "Read these first"
   before asking anything. Ask the user only what they genuinely do not settle
   **and** that this step needs now.
2. **Write the step design** at
   `docs/superpowers/specs/YYYY-MM-DD-server-spine-design.md`.
3. **`superpowers:writing-plans`** for the detailed implementation plan.
4. **`superpowers:subagent-driven-development`** to implement it.

## Read these first

| Document                                                               | What you need from it                                                                                                                        |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/prds/2026-09-27-memory-shoebox/tech-specs/apis/conventions.md`   | § Errors, § The request context, § Rate limits, § The job runner, § Forbidden in any payload. All of it is binding and most of it ships here |
| `docs/prds/2026-09-27-memory-shoebox/tech-specs/apis/notifications.md` | **Part 1 entirely**: the enqueue interface, the recipient rule, claiming and retrying, scrubbing, and the eleven messages' shared rules      |
| `docs/prds/2026-09-27-memory-shoebox/tech-specs/data-models.md`        | § `outbound_emails`, § `email_suppressions`, § `pending_object_deletions`, and § Privacy for what must never be logged                       |
| `docs/prds/2026-09-27-memory-shoebox/design-spec.md`                   | Surface 16, for what an email has to look like. The mockup is the requirement                                                                |
| `prototypes/` surface `emails`, every state                            | `pnpm dev:prototypes`, then `/s/emails?state=code`. Eleven states, each shown twice: rendered, and as the plain-text alternative             |
| `docs/architecture.md`                                                 | § Where data lives. Media bytes never pass through the server, which constrains the B2 client to signing and deleting                        |
| `docs/configuration.md`                                                | Every environment variable, and the split between those and `app.config.ts`                                                                  |
| `app.config.ts`                                                        | `appConfig.upload.draftExpiryHours`, which `upload-abandon-sweep` reads                                                                      |

## Scope

**In:**

- The request context the middleware attaches before any handler runs
  (`conventions.md` § The request context). The session lookup itself is step
  3a's; the shape, the attachment and the "assume it exists" contract are here
- The error envelope as a Fastify error handler: one shape everywhere, stable
  `snake_case` codes, `details` with its three documented uses, and the status
  table including `503`
- Rate limiting in the middleware, never in handlers, with every row from
  `conventions.md` § Rate limits. The per-IP bucket is the one place an IP is
  touched: in memory, never stored, never logged
- The job runner and all seven jobs registered with their cadences:
  `session-sweep`, `invitation-lapse`, `sign-in-code-sweep`,
  `upload-abandon-sweep`, `removal-reminder`, `object-deletion-drain`,
  `visibility-rule-sweep`. Several have nothing to act on until a later step
  and must still run, be idempotent, and be tested against an empty table
- The Backblaze client: presigning a single-object GET and PUT, multipart, and
  deleting. Nothing streams through the server
- `object-deletion-drain`, which is the only job with a real body at this stage
- The outbound mail queue: the enqueue interface from `notifications.md`
  § The enqueue interface, the claim-and-retry worker, `UNIQUE (idempotency_key)`
  as the only thing between a retry and a duplicate, and the scrub that clears
  **both** `payload_json` and `subject` on a terminal `sign_in_code` row
- The email renderer harness: `EmailCommon` resolved at enqueue, one HTML
  template and one plain-text template per kind, a shared masthead and footer,
  and the rule that rendering takes the payload and nothing else. If rendering
  would need a query, the payload is wrong
- The Resend client behind an interface a test can substitute
- `GET /api/mail/health`'s **data**, if it falls out cheaply. The route is step
  8a's

**Out, and owned by a later step:**

- Every message body except one worked example. Each kind's copy belongs to the
  step that triggers it: `sign_in_code` in 3a, `comment` in 5a,
  `upload_session` in 6a, the five removal messages in 7a, `invitation` in 8a
- Sessions, sign-in, the visibility predicate (step 3a)
- Any product route

## Interfaces this step produces

- `enqueueEmail(input: EnqueueEmailInput<K, P>)`, called from four later slices
  inside their own transactions
- The job registry, which later steps add bodies to rather than jobs
- The B2 client: `presignGet`, `presignPut`, `presignMultipart`, `deleteObject`
- The Fastify error handler, the rate limiter, and the request context type

## Interfaces this step consumes

From step 1: the Kysely `Database` interface, `SETTING_DEFINITIONS`, the error
envelope type, the length caps, and `appConfig`.

## Do not ask the user about

| Topic                                             | Owned by                        |
| ------------------------------------------------- | ------------------------------- |
| Sign-in codes, sessions, the visibility predicate | step 3a                         |
| Anything in `apps/web`                            | step 3b                         |
| Which members receive a given email               | the step that owns that message |
| The mail health surface and its diagnosis ladder  | step 8a                         |
| Presence, the change log                          | step 8a                         |

## Verification

- `pnpm check` green
- A test per job that runs it twice against the same state and asserts the
  second run changes nothing. `removal-reminder`'s arithmetic in particular:
  `week_index = floor((now - created_at) / 7 days)` with `week_index >= 1`,
  which makes two reminders in one week impossible without scheduler state
- A test that inserts two `outbound_emails` rows with the same
  `idempotency_key` and asserts the second is rejected by the constraint, not by
  application code
- A test that a terminal `sign_in_code` row has both `payload_json` **and**
  `subject` scrubbed, because the code is deliberately in the subject line
- A rendered email compared against `prototypes/` surface `emails`, state
  `code`, in both the HTML and the plain-text form. Open the prototype and look
  at it rather than working from the markup
- A test that no payload contains anything from `conventions.md` § Forbidden in
  any payload: no raw storage key, no IP, no formatted date except the one
  sanctioned place
