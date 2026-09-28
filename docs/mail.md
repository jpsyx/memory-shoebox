# Outbound mail (`apps/server/src/mail`)

Memory Shoebox sends seven kinds of transactional message, and one of them is
how anybody gets in at all: the six-digit sign-in code. So the mail path is
built around a failure that is not hypothetical. A self-hosted instance spends
its first hour with no Resend key and no sending address, and the family it
belongs to is not going to notice a stalled queue before the admin does.

The contract is
[`apis/notifications.md`](prds/2026-09-27-memory-shoebox/tech-specs/apis/notifications.md),
which fixes the nine messages, their idempotency recipes and their recipients.
The columns are
[`data-models.md` § `outbound_emails`](prds/2026-09-27-memory-shoebox/tech-specs/data-models.md).
This document says what the modules are, how they fit, and why the decisions
that are easy to get backwards went the way they did.

## Layout

```
apps/server/src/mail/
├── enqueue.ts          enqueueEmail, written inside the caller's transaction
├── worker.ts           claim, suppress, render, send, retry, finalise
├── scrub.ts            what a terminal sign-in code row keeps, in one place
├── queueJob.ts         the ten-second Job that drives the worker
├── health.ts           readMailQueueHealth, the admin banner's numbers
├── sender.ts           MailSender, the Resend implementation, MailSendError
└── templates/
    ├── layout.ts       masthead, footer, escaping, the plain-text column
    ├── registry.ts     kind to copy, and the gate on what may be enqueued
    └── signInCode.ts   the one kind whose copy exists today
```

## The queue is the log

There is one table and it is both. A message is enqueued as a row, claimed in
place, and left there when it is sent, failed or suppressed. Nothing is deleted
and there is no second table recording what happened, which is why the admin's
mail banner is an aggregate query over `outbound_emails` rather than a status
store that could disagree with it.

That also means the row is the evidence. `from_address` records the identity
actually used rather than the setting's current value, so changing the setting
later does not rewrite history, and `provider_message_id` is what ties one row
to one message in the Resend dashboard.

## Enqueuing

### `enqueueEmail` does not throw on a mail problem

It takes the caller's transaction and writes one row inside it. The guarantee
it offers is that no mail problem can roll that transaction back, and the point
of the guarantee is that the transaction is always doing something else that
matters more:

- An upload batch settles on `settled_at` rather than on `notified_at`
  precisely so that a batch can finish while mail is down. The two hundred
  photographs are in the archive whether or not anybody was told.
- A sign-in code that could not be mailed still has to exist, because the
  resend path is what the person will use next. An enqueue that threw would
  destroy the code along with the message about it.

**The boundary of that guarantee is documented in the code**, in
`enqueue.ts`'s own docstring, because it was measured rather than assumed. An
unset, empty or relative `public.base_url` writes a `failed` row and returns.
A duplicate `idempotency_key` returns `already_enqueued`. A SQLite error still
propagates: a `toMemberId` naming no member violates a foreign key, and an
unmigrated database fails the settings read. Those are programming errors
rather than mail being down, and a caller that has just written the member row
it is mailing cannot hit the first of them.

A duplicate key is reported as `already_enqueued` rather than as an error
because every caller is a handler that may have been retried. The `UNIQUE`
constraint is the thing standing between one notification and two hundred, and
it is the constraint that enforces it, not application code checking first.

### It composes `EmailCommon` and derives the subject

`notifications.md` § The enqueue interface freezes an input with a
caller-supplied subject and a complete payload. That is not implementable
alongside two other rules in the same document, so the boundary moved by
exactly one field group: the caller passes the kind-specific fields, and the
enqueue resolves `shoeboxName`, `baseUrl` and `timezone` from settings, derives
`preferencesUrl` from the kind, and asks the kind's template for the subject.

The short reason is that only code inside the enqueue can discover that
`public.base_url` is unset and still write the row, and `invitation`'s subject
interpolates the Shoebox name, which a caller does not hold. The full argument,
including why this is better than the frozen shape rather than merely
necessary, is in
[the step design](superpowers/specs/2026-09-27-server-spine-design.md),
Decision 1.

### An unset `public.base_url` costs the message

With no absolute `public.base_url`, the row is written `state = 'failed'`,
`attempts = 0`, `last_error_code = 'base_url_unset'`. **Those messages are
lost, not retried.** Nothing sweeps them back into the queue and the worker
never sees them.

The specification states that rather than mitigating it, and the reason is
worth keeping. Every message in the product carries a link into the Shoebox,
so without an absolute base URL there is no renderable message to retry: a
requeue would have to be triggered by somebody **setting** `public.base_url`,
which is a settings write, and settings writes belong to step 8a. Until then
the honest thing is a terminal row that says exactly what is wrong, which is
why `GET /api/mail/health` is specified to report `base_url_unset` above every
other diagnostic: every other symptom is downstream of it.

## The template registry is the gate

`templates/registry.ts` maps a kind to its copy, and `enqueueEmail` is generic
over its keys rather than over the seven kinds. Because the subject is derived
from the template, **a kind with no template cannot be enqueued at all, and the
attempt is a type error**. That is what enforces the split below, rather than
leaving a row `queued` forever behind a renderer that cannot render it.

| Kind                                                      | Copy and callers arrive in                     |
| --------------------------------------------------------- | ---------------------------------------------- |
| `sign_in_code`                                            | copy is here; its caller is step 3a            |
| `comment`                                                 | step 5a                                        |
| `upload_session`                                          | step 6a                                        |
| `removal_request`, `removal_reminder`, `removal_resolved` | step 7a, five messages between the three kinds |
| `invitation`                                              | step 8a                                        |

Each kind's copy belongs with the step that triggers it, because copy written
without the surface in front of you is a guess. The worker still has to handle
a kind it cannot render, because `outbound_emails.kind` is governed by a SQLite
`CHECK` constraint rather than by a type and the lookup can therefore miss: it
marks such a row `failed` with `no_template` rather than throwing.

## Rendering takes the payload and nothing else

One HTML template and one plain-text template per kind, both pure functions of
the payload. **The mechanical test is: if rendering would need a query, the
payload is wrong.** A row retried a day later must produce the same message it
would have produced at enqueue, so every instance setting the renderer reads
travels in `EmailCommon` and is frozen when the row is written.

Two rules in `layout.ts` are structural rather than cosmetic:

- **Nothing in an email may reference a design token.** A system font stack,
  literal hex, a 600px column, and no layout that needs a modern renderer.
  Email is the one surface that has to survive being forwarded.
- **The footer's preferences link is rendered when `preferencesUrl` is set and
  omitted when it is null**, which is `sign_in_code` and only `sign_in_code`,
  because offering to turn off a message that cannot be turned off is a lie.

The plain-text form is never omitted. For some members in this audience it is
the only version that ever arrives.

## The worker

`queueJob.ts` puts `runMailQueueOnce` on the job runner at ten seconds.
**It is not one of the seven jobs**: `conventions.md` § The job runner names a
closed set and this is not in it. It shares the runner only because the runner
already owns what a loop like this needs, which is an overlap guard, a failure
that is logged rather than fatal, and a stop that waits. There is no kick after
an enqueue, so `enqueueEmail` stays a plain write inside a transaction that may
yet roll back, and the worst case for a sign-in code is ten seconds on top of
the provider's own latency.

One pass selects the rows `notifications.md` § Claiming, retrying and scrubbing
names (queued, due, and past whatever backoff they are serving) and claims each
with a conditional `UPDATE ... WHERE state = 'queued'`, proceeding only when
one row changed. **That conditional update is the whole of the concurrency
control.** SQLite serialises writers, so of two workers reaching one row
exactly one wins and the other moves on. There is no lease column, no advisory
lock, and no transaction wrapped around the send.

**A row seen mid-flight is never picked up again.** Only `queued` is selected,
so a process that dies between the claim and the outcome leaves its row in
`sending` and nothing recovers it. That is deliberate: a reaper cannot tell a
crashed worker from a slow one, and re-sending a message the provider already
accepted is the worse of the two failures.

### Retry, and where five attempts comes from

A refusal from the provider, a network failure, or a payload that will not
render backs the row off by one minute, five, twenty-five, then two hours, and
then it is terminal. Four delays is what makes the fifth attempt the last: the
attempt with no delay left behind it gives up. The shape is chosen for the
sign-in code, which is either useful or dead well inside the ten minutes it is
good for, and long enough overall to ride out an ordinary provider outage.

### A configuration gap is not a delivery attempt

An unset `mail.from_address`, or no `RESEND_API_KEY`, is not a failed send. The
row goes straight back to `queued` with `next_attempt_at` five minutes out and
**`attempts` untouched**, under `from_address_unset` or
`provider_unconfigured`.

Counting those against the five would burn a fresh instance's entire queue in
two and a half hours while the admin was still reading the setup page, and the
first thing they would have done wrong is nothing. Deferring instead means the
queue drains itself the moment the setting is filled in, which is what somebody
who has just fixed a banner expects to happen.

### Suppression bypasses `sign_in_code` and nothing else

At claim, the worker checks `email_suppressions` for the address and marks a
suppressed message terminal without sending it. **That check is skipped for
`sign_in_code`, and only for `sign_in_code`: a spam complaint must never lock a
family member out of their own archive.** If the address really is refusing
mail, the repeated failure is itself the diagnostic, and it is a better one
than a person who cannot sign in and is told nothing.

The order of the checks is load-bearing in one other way: suppression is tested
before the template lookup, so a message to an address the provider has told us
to stop writing to is marked `suppressed` whether or not its copy exists yet.

### The scrub

On any terminal state, a `sign_in_code` row has **both** `payload_json` and
`subject` rewritten, to `{}` and `Your code`. Both, not one: the six digits are
in the subject line deliberately so the code reads off a lock screen, which
makes `subject` the more exposed of the two. Scrubbing only the payload would
leave a permanent log of live-looking codes sitting beside the address each was
sent to.

**Two paths take a row terminal and both of them scrub**: the worker, when a
send ends `sent`, `suppressed`, or `failed` with no attempt left behind it, and
the enqueue, when `public.base_url` is unset and the row is born terminal. The
second is the one that fires first in an instance's life, because a fresh
Shoebox holds no settings rows at all. A reader of the table cannot tell which
path finalised a row, so the two write the same bytes.

A `base_url_unset` row of any **other** kind keeps its payload. That is what
the requeue step 8a adds will recompose the message's links from, and a
sign-in code is excluded from it for the obvious reason: a code recovered days
later has expired anyway.

## The sending identity is a setting, not an environment variable

`mail.from_address` and `mail.from_name` are instance settings, edited on the
Shoebox's own settings surface. `MAIL_FROM` used to be an environment variable
and has been removed.

The reason is the banner. `GET /api/mail/health` will diagnose
`from_address_unset` against that setting, and the settings surface is where an
admin fills it in. Two sources for one value means the banner can be wrong, and
a banner that says mail is misconfigured while pointing at the wrong place is
worse than no banner.

`RESEND_API_KEY` stays an environment variable, because it is a secret and
secrets do not go in the catalog. See [configuration.md](configuration.md).

## The provider seam, and why no test ever sends

`MailSender` is an interface with one method. `createResendMailSender` is the
implementation; every test substitutes a recording fake. **There is no code
path that reaches the network in a test, and this repository holds no Resend
key**, in a fixture or anywhere else.

A server with no key runs perfectly well. `createApp` builds a null sender, the
worker defers every row under `provider_unconfigured`, and every route serves
normally. Refusing to boot without a mail key would make first-run setup
impossible, since the admin has to reach the settings surface to configure mail
at all, and `architecture.md` is explicit that an existing session must survive
a mail outage.

Two idempotency keys guard two different things, which is why both exist. The
`UNIQUE (idempotency_key)` index stops a retried **handler** writing a second
row. The same key passed to Resend stops a retried **send** of one row
duplicating a message whose success we did not hear about. Resend's keys expire
after 24 hours, which is longer than this worker's whole retry schedule.

`MailSendError` carries the provider's own error name through unparsed, because
the provider owns that vocabulary and `last_error_code` shows it to the admin
verbatim.

## Queue health

`readMailQueueHealth` returns the counts and timestamps the admin banner needs,
as aggregates over `outbound_emails` grouped by state, which is what migration
0007's `(state, created_at)` index is for. It returns no formatted or relative
string: the surface's "has not gone out for three hours" is computed in the
browser from `oldestQueuedAt`.

One number is weaker than it looks and is worth knowing before it is trusted:
`lastFailedAt` is the failing row's `created_at` rather than the moment it
failed, because no column records the latter. On a queue that drains in minutes
the two are close.

**The diagnosis ladder is not here.** Two of its five rungs need domain
verification, which step 8a owns along with `GET /api/mail/health` itself.

## What each later step adds

| Step | Adds                                                                                  |
| ---- | ------------------------------------------------------------------------------------- |
| 3a   | The caller for `sign_in_code`, in the transaction that mints the code                 |
| 5a   | `comment`: its payload type, its copy, and its two recipient sets                     |
| 6a   | `upload_session`, and the settle latch that decides when one message goes out         |
| 7a   | The removal messages, and `removal-reminder`'s enqueue call                           |
| 8a   | `invitation`, `GET /api/mail/health` and its ladder, and the `base_url_unset` requeue |
