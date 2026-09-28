# Step 2: the server spine

**Step design** for step 2 of
[`docs/prds/2026-09-27-memory-shoebox/plan/step-2.md`](../../prds/2026-09-27-memory-shoebox/plan/step-2.md).

This is not the product spec. The product spec is
[`docs/PRODUCT.md`](../../PRODUCT.md) and
[`design-spec.md`](../../prds/2026-09-27-memory-shoebox/design-spec.md). What
this step implements is settled in
[`conventions.md`](../../prds/2026-09-27-memory-shoebox/tech-specs/apis/conventions.md)
and
[`notifications.md`](../../prds/2026-09-27-memory-shoebox/tech-specs/apis/notifications.md)
Part 1. This document records only what is specific to building them, and cites
rather than restates.

## What this delivers

Everything in `apps/server` that is not a route and that every route needs: the
request context, the error envelope, rate limiting, the job runner with all
seven jobs, an extended Backblaze client, and the outbound mail queue with its
worker and its renderer. One message has copy (`sign_in_code`); the other six
kinds belong to the steps that trigger them.

No product route. `GET /api/health` stays the only endpoint.

## What already exists, and what it settles

Step 1 finished the schema, so nothing here needs a migration. Worth reading
first, because each removes a decision:

| File                                                   | What it already settles                                                                                                     |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `apps/server/src/app.ts`                               | `createApp(deps)` takes config, database and an overridable `b2`. Dependencies arrive as arguments, never from `process.env` |
| `apps/server/src/db/migrations/0007_operations_and_audit.ts` | `outbound_emails` with `UNIQUE (idempotency_key)`, `(state, next_attempt_at)` for the claim, `(state, created_at)` for health |
| `apps/server/src/db/migrations/0006_upload.ts`         | `pending_object_deletions` with `UNIQUE (storage_key)`                                                                      |
| `apps/server/src/db/client.ts`                         | `PRAGMA foreign_keys = ON`, so every cascade a sweep relies on is enforced behaviour                                        |
| `packages/shared/src/settings.ts`                      | `SETTING_DEFINITIONS` and `resolveSetting`, which already returns a key's default when no row exists or the row is corrupt  |
| `packages/shared/src/errors.ts`                        | `apiErrorSchema` and `apiErrorDetailsSchema`, with `fieldErrors`, `retryAfterSeconds` and `attemptsRemaining` already on it |
| `apps/server/src/web/staticSpa.ts`                     | The JSON 404 for an unmatched `/api/` path, which the error handler must not fight                                          |

## Decisions

### 1. `enqueueEmail` composes `EmailCommon` and derives the subject

`notifications.md` § The enqueue interface freezes `EnqueueEmailInput` with a
caller-supplied `subject` and a complete `payload: P`. Taken literally that is
not implementable alongside two other rules in the same document:

- "The enqueue reads the key once. If it is missing, empty, or not an absolute
  URL, the enqueue **writes its row anyway** with `state = 'failed'`". Only
  code inside the enqueue can detect the unset key, so only the enqueue can
  compose the `baseUrl` field.
- "Every instance setting the renderer reads is resolved at enqueue too, and
  travels in `EmailCommon`."

A caller cannot both hand over a finished payload and let the enqueue discover
that one of its fields is unresolvable. So the boundary moves by exactly one
field group: the caller passes the kind-specific fields, and `enqueueEmail`
resolves `shoeboxName`, `baseUrl` and `timezone` from `settings`, takes
`toDisplayName` from the caller, and derives `preferencesUrl` from the kind
(null for `sign_in_code`, `${baseUrl}/account` otherwise, which is the rule
about the footer's switch expressed once rather than at seven call sites).

The subject follows for the same reason. `invitation`'s subject is
`Papá has added you to My Shoebox`, which interpolates `shoeboxName`, a field
the caller does not hold. So the kind's template owns its subject and the
enqueue asks for it. This is strictly better than the frozen shape in one more
way: subject and body are rendered from the same payload by the same module, so
they cannot drift, which matters most for `sign_in_code`, where the subject
carries the six digits.

`EnqueueEmailInput` keeps its name and every other field. Recorded here because
it is a deliberate deviation from a document that four later slices cite.

### 2. The template registry is the gate on what may be enqueued

`enqueueEmail` derives the subject from the kind's template, so a kind with no
template cannot be enqueued. That is the enforcement mechanism for the step's
scope split. `sign_in_code`'s copy ships here as the worked example, and its
caller arrives in step 3a; every other kind brings its payload type, its
templates and its callers in one change (`comment` 5a, `upload_session` 6a, the
five removal messages 7a, `invitation` 8a).

The registry is a plain object holding the kinds that have templates, and
`enqueueEmail` is generic over its keys rather than over `OutboundEmailKind`.
Enqueuing an unbuilt kind is therefore a type error, rather than a row that
sits `queued` forever behind a renderer that cannot render it.

### 3. Each job gets the body its tables support today

The step says `object-deletion-drain` is the only job with a real body, and
also asks for a test per job that runs it twice and asserts the second run
changes nothing, plus a test of `removal-reminder`'s arithmetic. Against an
empty function the first of those asserts nothing, which is the tautological
test `AGENTS.md` says to skip. Step 1 built all thirty-three tables, so the
sweeps have something to sweep:

| Job                     | Cadence | What ships here                                                                                                     |
| ----------------------- | ------- | ------------------------------------------------------------------------------------------------------------------- |
| `session-sweep`         | hourly  | Complete: deletes `sessions` past `expires_at`                                                                      |
| `invitation-lapse`      | hourly  | Complete: flips an `invited` member whose latest unrevoked invitation has expired to `status = 'removed'`           |
| `sign-in-code-sweep`    | hourly  | Complete: deletes expired and consumed `sign_in_codes`                                                              |
| `visibility-rule-sweep` | daily   | Complete: deletes `visibility_rules` no item references, never the seeded `everyone` rule                           |
| `object-deletion-drain` | 5 min   | Complete: drains `pending_object_deletions` into Backblaze deletes, retrying on failure                            |
| `upload-abandon-sweep`  | 15 min  | Marks non-terminal `upload_files` `failed` with `problem_code = 'abandoned'`, and cancels pre-commit drafts idle past `appConfig.upload.draftExpiryHours`. **The settle latch is a named seam step 6a fills** |
| `removal-reminder`      | hourly  | Selects due reminders and computes `week_index`. **The enqueue call is step 7a's**, because it needs copy and a payload type that would be a guess today |

The two seams are where a later step owns the meaning rather than the
mechanism. `data-models.md` calls the settle latch "the single most important
piece of upload plumbing the mockup does not show", and guessing at it without
the upload slice in front of you is how it gets built twice.

`removal-reminder`'s arithmetic is therefore tested directly rather than
through its writes: `buildRemovalReminderKey` is a pure function, and the
property the step names ("two reminders in one week arithmetically
impossible") is that it returns the same key twice inside one week and a
different one the next. Combined with the `UNIQUE (idempotency_key)` test the
step already asks for, that is the whole guarantee, with no scheduler state on
either side of it.

### 4. A configuration gap is not a delivery attempt

The mail worker distinguishes two failures that look alike and should not be
counted alike:

| Failure                                                    | Effect on the row                                                                    |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `base_url_unset`, at enqueue                               | `state = 'failed'`, `attempts = 0`. Terminal and unrecoverable, as the document says |
| `from_address_unset`, `provider_unconfigured`, at claim    | Back to `queued`, `next_attempt_at` pushed out, `attempts` **not** incremented        |
| The provider refused or the network failed                 | `attempts + 1`, backoff, terminal `failed` after five                                |

Nothing was attempted in the middle row, so counting it against the five would
burn a fresh instance's whole queue in two and a half hours while an admin was
still reading the setup page. Pushing the attempt out instead means the queue
drains by itself the moment the setting is filled in, which is what an admin
who has just fixed a banner expects to happen.

`base_url_unset` is the exception because `notifications.md` makes it one, and
says why: those messages are lost rather than retried, and
`GET /api/mail/health` reports it above every other diagnostic.

### 5. Mail cannot stop the server, and no test ever sends

`RESEND_API_KEY` stays optional. A server with no key starts, serves every
route, and classifies sends as `provider_unconfigured` per the row above.
`architecture.md` is explicit that an existing session must survive a mail
outage, and refusing to boot without a mail key would make first-run setup
impossible: the admin has to reach surface 11 to configure mail at all.

`MailSender` is an interface with two implementations: the Resend one, and a
recording fake. Every test uses the fake. There is no code path that reaches
the network in a test, and no fixture carries a real key.

### 6. Rate limiting is in-memory fixed windows, declared per route

`conventions.md` puts rate limiting in the middleware and never in a handler,
so each rule is named once and a route picks one by name in its Fastify route
config. The default for an authenticated route is 600 per minute per session,
which is what a route gets by saying nothing.

| Rule                            | Limit                     | Keyed on                       |
| ------------------------------- | ------------------------- | ------------------------------ |
| `signInCodeRequestPerAddress`   | 5 per hour, **shared** with the resend path | the normalised address |
| `signInCodeRequestPerIp`        | 20 per hour               | the request IP                 |
| `sessionCreatePerAddress`       | 10 per hour               | the normalised address         |
| `invitationResendPerInvitation` | 1 per minute, 10 per day  | `invitations.last_sent_at`     |
| `conversationWritePerMember`    | 60 per minute             | `viewer.memberId`              |
| `authenticatedDefault`          | 600 per minute            | `viewer.sessionId`             |

Fixed windows rather than a token bucket, because `retryAfterSeconds` has to be
a number the client can print and a fixed window has an exact one: the seconds
left in the window. In memory rather than in SQLite, because the deployment is
one Fly machine (`architecture.md`) and a counter per request would put write
contention on the one thing in the system with a single writer.

`invitationResendPerInvitation` is the exception and reads the database,
because `conventions.md` says it does and `invitations.last_sent_at` exists for
it. Its route is step 8a's; the rule ships here with the rest of the table.

**The per-IP bucket is the only place an address is touched.** It is a counter
in a `Map`, it is never written to the database, and it never reaches a log
line (`data-models.md` § Privacy).

### 7. The request context is a shape and a seam, not a lookup

`conventions.md` § The request context freezes `Viewer` and says "assume it
exists; do not design it". So this step ships the type, the
`request.viewer` decoration, and a `requireViewer(request)` helper that throws
`401 not_signed_in`. The authenticator itself is an optional `createApp`
dependency defaulting to one that returns null, and step 3a replaces it with
the session lookup, the throttled slide and the `visibleRuleIds` cache.

That is what lets the rate limiter ship complete now: it reads `viewer` when
there is one and falls back to the per-IP bucket when there is not, and neither
branch cares where the viewer came from.

### 8. The from address comes from settings, and `MAIL_FROM` goes away

`notifications.md` gives `GET /api/mail/health` a `from_address_unset`
diagnosis keyed to `mail.from_address`, and `PRODUCT.md` puts the sending
address on surface 11. Two sources for one value means the banner can be wrong,
so the settings keys win and `MAIL_FROM` is removed from `.env.example`,
`docs/configuration.md` and `docs/deployment.md`. `outbound_emails.from_address`
records the identity actually used, which is what makes a later change to the
setting harmless to the log.

### 9. `GET /api/mail/health` gets its queue data and not its ladder

`readMailQueueHealth` returns the `MailQueueHealth` shape from
`notifications.md` in three queries the worker's indexes already serve. The
diagnosis ladder stays in step 8a with the route, because two of its five rungs
(`domain_unverified`, `provider_rejecting`) need domain verification, which is
step 8a's and is not built here.

### 10. The Backblaze client gains four operations and loses none

`presignGetUrl` is renamed `presignGet` to match the step's interface list, and
`presignPut`, `presignMultipart` and `deleteObject` join it. `presignMultipart`
carries `completeMultipart` and `abortMultipart` with it, because a presigned
multipart upload that cannot be completed is not an interface, it is half of
one.

`listObjects` and `putObject` stay. Nothing asked for their removal, and
`AGENTS.md` § Scope forbids cleanup outside what was requested.

## Module layout

```
apps/server/src/
├── http/
│   ├── requestContext.ts      Viewer, the decoration, requireViewer
│   ├── apiError.ts            ApiError: status, snake_case code, details
│   ├── errorHandler.ts        the Fastify error handler and the status table
│   └── rateLimit/
│       ├── rules.ts           conventions.md § Rate limits, as named rules
│       ├── buckets.ts         in-memory fixed windows, swept on a timer
│       └── plugin.ts          the onRequest hook that applies them
├── jobs/
│   ├── runner.ts              intervals, overlap guard, clean stop on SIGTERM
│   ├── registry.ts            the seven, with their cadences
│   └── <job>.ts               one per job
├── mail/
│   ├── enqueue.ts             enqueueEmail, inside the caller's transaction
│   ├── worker.ts              claim, render, send, retry, scrub
│   ├── sender.ts              MailSender, the Resend implementation
│   ├── health.ts              readMailQueueHealth
│   └── templates/
│       ├── layout.ts          masthead and footer, HTML and plain text
│       ├── registry.ts        kind to template
│       └── signInCode.ts      the one worked example
├── settings/instanceSettings.ts   reads through SETTING_DEFINITIONS
└── b2/client.ts               extended

packages/shared/src/email.ts   OutboundEmailKind, EmailCommon,
                               EnqueueEmailInput, SignInCodeEmailPayload,
                               MailQueueHealth
```

## The mail path, end to end

1. A caller inside its own transaction calls `enqueueEmail(executor, input)`.
2. The enqueue reads `shoebox.name`, `shoebox.timezone` and `public.base_url`
   in one query, composes `EmailCommon`, and asks the kind's template for the
   subject.
3. With no absolute `public.base_url` it writes `state = 'failed'`,
   `attempts = 0`, `last_error_code = 'base_url_unset'` and a
   `last_error_message` naming the key, and returns. **It never throws**, so the
   caller's transaction commits.
4. Otherwise it writes `state = 'queued'`. A duplicate `idempotency_key` is
   rejected by the constraint, and the enqueue reports that as "already
   enqueued" rather than an error, because every caller of it is a handler that
   may have been retried.
5. Every ten seconds the worker selects
   `WHERE state = 'queued' AND send_after <= :now AND (next_attempt_at IS NULL OR next_attempt_at <= :now)`
   and claims each with
   `UPDATE outbound_emails SET state = 'sending' WHERE id = ? AND state = 'queued'`,
   proceeding only on `changes() = 1`.
6. At claim it checks `email_suppressions` for the address, skipping the check
   for `sign_in_code` and only for `sign_in_code`. A suppressed address on any
   other kind goes terminal `suppressed` without a send.
7. It renders from the payload and nothing else, sends through `MailSender`,
   and writes `sent` with the provider's message id, or backs off per
   decision 4.
8. On any terminal state, a `sign_in_code` row is scrubbed: `payload_json` to
   `{}` and `subject` to `Your code`, in the same statement.

## Rendering

One HTML template and one plain-text template per kind, both taking the payload
and nothing else. Two rules from the prototype are structural rather than
cosmetic and belong in `layout.ts`:

- **Nothing in an email may reference a design token.** The prototype's own CSS
  says so in as many words: a system font stack, literal hex, a 600px column,
  and no layout that needs a modern renderer. Emails are the one surface that
  has to survive being forwarded.
- **The footer's preferences link is rendered for a kind with a
  `preferencesUrl` and omitted when it is null**, which is `sign_in_code` and
  only `sign_in_code`, because offering to turn off a message that cannot be
  turned off is a lie.

`expiresInMinutes` is interpolated as an English word ("ten minutes") through a
small lookup for one to twelve, falling back to digits. The mockup is the
requirement and it reads "ten"; the payload carries the number so the copy
cannot drift from the row, and hard-coding the word would defeat the field.

## Verification

Beyond `pnpm check`:

| Test                                                     | Asserts                                                                                    |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| One per job, run twice against the same state            | The second run changes nothing, and every job runs against an empty table without failing    |
| `buildRemovalReminderKey`                                | Same key twice in a week, a different one the next, and nothing at all for `week_index = 0`  |
| Two `outbound_emails` rows with one `idempotency_key`    | The **constraint** rejects the second, not application code                                  |
| A terminal `sign_in_code` row                            | `payload_json` is `{}` **and** `subject` is `Your code`                                      |
| The rendered sign-in email against `prototypes/` `emails`, state `code` | Both the HTML and the plain-text form, read from the running prototype rather than its markup |
| A payload guard over every built payload                 | No raw storage key, no IP, no formatted date                                                 |
| A request that trips a limit                             | `429`, code `rate_limited`, and `details.retryAfterSeconds`                                  |
| A server with no `RESEND_API_KEY`                        | Starts, serves, and leaves rows `queued` rather than burning their attempts                  |

**The payload guard is a test helper, not a runtime check.** A scanner strict
enough to catch "14 September 2026" also catches it inside a comment body,
which `CommentEmailPayload` carries verbatim by design, so a runtime version
would throw on a legitimate message. It runs over payloads the templates build
and skips the fields the contract documents as verbatim user text.

## Documentation

Per `AGENTS.md`, in the same change:

- `docs/server.md`: the request context, the error envelope, rate limits and
  the job runner
- `docs/mail.md`, new: the queue, the renderer, the provider seam, and what an
  unset `public.base_url` costs
- `docs/configuration.md` and `docs/deployment.md`: `RESEND_API_KEY` is read
  now, `MAIL_FROM` is gone
- `docs/architecture.md` § What is not built yet: no longer accurate about the
  database or the job runner
