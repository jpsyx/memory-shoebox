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
├── enqueueEmail.ts             written inside the caller's transaction
├── runMailQueueOnce.ts         claim, suppress, render, send, retry, finalise
├── makeScrubPatchFromKind.ts   what a terminal sign-in code row keeps
├── createMailQueueJob.ts       the ten-second Job that drives the worker
├── readMailQueueHealth.ts      the admin banner's numbers
├── MailSendError.ts            the provider's own refusal, passed through
├── EmailService/
│   ├── EmailService.types.ts       the seam: one send, and what it takes
│   ├── createEmailService.ts       which of the three this instance uses
│   ├── createResendEmailService.ts Resend, behind the limiter
│   ├── createFakeEmailService.ts   the PDF written instead of a send
│   └── createSendRateLimiter.ts    Upstash, or the same window in memory
└── templates/
    └── emailTemplates.constants.ts  kind to copy, and the enqueue gate
```

The copy itself is not here. It is `packages/emails`, a compiled package of
react-email templates, and [`emails.md`](emails.md) says why it compiles when
nothing else in this repository does.

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
`enqueueEmail.ts`'s own docstring, because it was measured rather than assumed. An
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

**`upload_session` is the case that sentence is about.** Step 6a's settle
latch decides that a batch has finished, and only the caller whose latch
`UPDATE` changed the row calls `enqueueUploadSessionEmails`, in that same
transaction: one row per recipient, keyed `upload:<session_id>:<member_id>`.
The latch makes it one message per batch, and the key makes a retried handler
harmless. The same transaction writes `notified_member_count`, the rows it
wrote, and `notified_at`, the settle time. They record that the fan-out ran;
whether each message arrived is its own row's to say, which is where
`readMailQueueHealth`, and step 8a's `GET /api/mail/health` after it, read it.

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

`templates/emailTemplates.constants.ts` maps a kind to its copy, and `enqueueEmail` is generic
over its keys rather than over the seven kinds. Because the subject is derived
from the template, **a kind with no template cannot be enqueued at all, and the
attempt is a type error**. That is what enforces the split below, rather than
leaving a row `queued` forever behind a renderer that cannot render it.

| Kind                                                      | Copy and callers arrive in          |
| --------------------------------------------------------- | ----------------------------------- |
| `sign_in_code`                                            | copy is here; its caller is step 3a |
| `comment`                                                 | step 5a                             |
| `upload_session`                                          | step 6a                             |
| `removal_request`, `removal_reminder`, `removal_resolved` | five removal bodies are registered  |
| `invitation`                                              | step 8a                             |

**Kinds and messages are not the same count, and the difference is entirely in
the removal row.** A _kind_ is one payload type and, once its copy exists, one
entry apiece in `EmailPayloadExtras`, `EMAIL_TEMPLATES` and `EMAIL_RENDERERS`.
There are seven, and the table above lists them all. A _message_ is one piece
of designed copy on surface 16, and the three removal kinds carry five between
them: a request, a resolution that reads as "it is gone", a resolution that
carries the decliner's own words, the weekly reminder, and a withdrawal to the
people who were asked. Every other kind is exactly one message. So a docstring
counting registry entries is counting kinds, and the design spec counting copy
is counting messages.

Each kind's copy belongs with the step that triggers it, because copy written
without the surface in front of you is a guess. The worker still has to handle
a kind it cannot render, because `outbound_emails.kind` is governed by a SQLite
`CHECK` constraint rather than by a type and the lookup can therefore miss: it
marks such a row `failed` with `no_template` rather than throwing.

The registry exports a second map for the worker, `EMAIL_RENDERERS`, with the
same keys and the same gate. Each entry closes over its kind's Zod schema
beside its template, because the worker reads `payload_json` back out of
SQLite: what it holds is `unknown`, and a row written by an older build would
otherwise be handed to a template that cannot check it. A payload that does not
parse throws inside the worker's `try` and lands as `render_failed`, which is
the outcome that branch was always written for.

## Rendering takes the payload and nothing else

One template per kind, rendered into an HTML form and a plain-text one, and a
pure function of the payload either way. **The mechanical test is: if rendering
would need a query, the
payload is wrong.** A row retried a day later must produce the same message it
would have produced at enqueue, so every instance setting the renderer reads
travels in `EmailCommon` and is frozen when the row is written.

That invariant did not move when the copy did. It is now enforced one package
over, by `EmailTemplate` in `packages/emails`, whose `render` takes the payload
and has nothing else to take. Two rules there are structural rather than
cosmetic:

- **Nothing in an email may reference a design token.** A system font stack,
  literal hex, a 600px column, and no layout that needs a modern renderer.
  Email is the one surface that has to survive being forwarded.
- **The footer's preferences link is rendered when `preferencesUrl` is set and
  omitted when it is null**, which is `sign_in_code` and only `sign_in_code`,
  because offering to turn off a message that cannot be turned off is a lie.

The plain-text form is never omitted. For some members in this audience it is
the only version that ever arrives. It is the same component rendered a second
time rather than a second template, so the two cannot drift. See
[`emails.md`](emails.md).

One thing did change shape: `render` is asynchronous now, because react-email
is, so the worker awaits it. `subject` stayed synchronous, because it is read
at enqueue rather than at send.

## The worker

`createMailQueueJob.ts` puts `runMailQueueOnce` on the job runner at ten seconds.
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

**A pass does not drain the queue: it claims at most `BATCH_SIZE` rows, which
is twenty**, oldest `send_after` first. At ten seconds that is a ceiling of a
hundred and twenty messages a minute, and a larger backlog takes as many passes
as it needs. The cap is what stops one pass running long enough that the
runner's overlap guard begins skipping the ticks behind it, which would slow
the queue down rather than speed it up.

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

An unset `mail.from_address`, or no service to send through, is not a failed
send. Outside fake email, having no service means having no `RESEND_API_KEY`.
The
row goes straight back to `queued` with `next_attempt_at` five minutes out and
**`attempts` untouched**. The address is tested first, so the code is
`from_address_unset` whenever `mail.from_address` is null and
`provider_unconfigured` only once an address is set and the key is not. A fresh
instance has neither, so every deferred row there reads `from_address_unset`.

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

**Three paths take a row terminal and all three of them scrub**: the worker,
when a send ends `sent`, `suppressed`, or `failed` with no attempt left behind
it; the worker again, when the row's kind has no copy written yet and it fails
`no_template` without ever being rendered; and the enqueue, when
`public.base_url` is unset and the row is born terminal. The last is the one
that fires first in an instance's life, because a fresh Shoebox holds no
settings rows at all. A reader of the table cannot tell which path finalised a
row, so all three write the same bytes.

A `base_url_unset` row of any **other** kind keeps its payload. That is what
the requeue step 8a adds will recompose the message's links from, and a
sign-in code is excluded from it for the obvious reason: a code recovered days
later has expired anyway.

## The sending identity is a setting, not an environment variable

`mail.from_address` and `mail.from_name` are instance settings, edited on the
Shoebox's own settings surface. `MAIL_FROM` used to be an environment variable
and has been removed.

The reason is the banner. `GET /api/mail/health` diagnoses
`from_address_unset` against that setting, and the settings surface is where an
admin fills it in. Two sources for one value means the banner can be wrong, and
a banner that says mail is misconfigured while pointing at the wrong place is
worse than no banner.

`RESEND_API_KEY` stays an environment variable, because it is a secret and
secrets do not go in the catalog. See [configuration.md](configuration.md).

## The provider seam, and why no test ever sends

`EmailService` is a type with one method. `send` takes a message whose HTML and
plain text are already rendered and answers only whether it was accepted, and
**that narrowness is the whole seam**: it is what lets three different things
sit behind it without a caller being able to tell which one it has.
`createEmailService` picks one from the environment. Resend when there is a
key, the fake that writes a PDF when a developer has asked for it, and nothing
at all otherwise. Every test substitutes a recording one, so **there is no code
path that reaches the network in a test, and this repository holds no Resend
key**, in a fixture or anywhere else.

Which of the three was chosen is logged once at boot, beside the words
`email delivery`, because from outside they are indistinguishable: a faking
instance looks exactly like a working one to everybody except the person
waiting for a code, and an unconfigured instance looks exactly like one whose
provider is down.

A server with no key runs perfectly well. `createApp` builds no service at all,
the worker defers every row it reaches rather than failing it, and every route
serves normally. Which code the deferral carries is decided by the sending
address rather than by the key, as above: a fresh Shoebox has no address either,
so its deferred rows read `from_address_unset`, and `provider_unconfigured` is
what a row gets once somebody has filled the address in and not the key. Refusing to boot without a mail key would make first-run setup
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

## Fake email writes a PDF and reports success

A developer needs to read a sign-in code and has no inbox to read it in. With
fake email on, the queue runs exactly as it would in production and only the
last step differs: instead of handing the message to Resend, it renders the
message into a PDF under `~/Downloads/memory-shoebox-emails`, one file per
message. The addressing is drawn across the top of the page, because what the
templates produce is a body and carries none, and for `sign_in_code` the
subject line is where the code actually is.

**Two conditions turn it on, and only one of them is a switch.**
`ENABLE_FAKE_EMAIL` must be exactly `true`, and `NODE_ENV` must be exactly
`development` or `test`. That second condition is not "anything but
production", and the difference is the whole point: unset, empty, `Production`,
`prod` and `staging` all send for real. The gate asks whether the environment
is a known development one and treats everything it does not recognise as
production, because each of those spellings is something a self-hoster can
plausibly end up with on a live instance, and the failure it would cause is
silent. An instance quietly writing sign-in codes into a directory on the
server looks perfectly healthy from every angle except the one nobody is
watching.

Two more things hold that gate up, both in `createFakeEmailService.ts`.
Playwright is a dev dependency, so the `--prod` install leaves a production
image unable to resolve it, and the import of it sits inside the send rather
than at the top of the file, so a wrong variable on a real server fails at a
send rather than taking the boot down with it. A developer needs the browser once:

```sh
pnpm --filter @memory-shoebox/server exec playwright install chromium
```

**A faked message is recorded `sent`, with a synthetic provider id** of the
shape `fake-pdf:<filename>`. That is deliberate. The point of the fake is that
its caller cannot tell, so the row moves through the states it would really
have moved through, and the path exercised in development is the path that runs
in production. It has one consequence worth stating plainly: the queue's health
numbers include these synthetic sends. `GET /api/mail/health` still reports
real provider verification as unavailable in fake mode rather than inventing
a verified domain. Nothing in the row says the message was not sent except
the provider id, and the only place the choice is announced is the one line in
the boot log.

## Rate limiting, and why a 429 costs no attempt

Resend accepts two requests a second, so every send waits for a slot first. The
limiter asks for 1.7 rather than 2 because the window is one somebody else is
measuring: a clock that disagrees with theirs, or a retry arriving beside a
fresh send, spends the difference.

**It waits rather than refusing.** Its caller is a queue worker holding a
message with nowhere else to put it, so a refusal would only be turned back
into a wait one layer up, at a far coarser grain, since the row's own backoff
starts at a minute. Waiting on the shared budget below is bounded at thirty
seconds a message, after which the send goes ahead anyway: a budget that has
not recovered in thirty seconds is not recovering, and parking the worker on
one row forever is worse than letting Resend answer for itself.

Where the window is kept depends on two variables. With
`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` set, it lives in
Upstash and is shared by everything using the same Resend key, which is the
reason those variables exist at all: the limit belongs to the key rather than
to the process, so a script running beside the server draws on the same budget
and an in-process window cannot see it. With neither set, the same window is
enforced in this process, which is exactly right for the single machine almost
every self-hosted instance is. Half a pair is no pair: a URL with no token
cannot reach Upstash, so it reads as not configured. The limiter reports which
of three it is doing, as `upstash`, `upstash_unreachable` or `memory`, for the
health surface step 8a builds.

`upstash_unreachable` is its own reading rather than a flavour of `memory`
because the two mean different things to whoever is looking. `memory` is an
instance doing exactly what it was asked. The other is an instance that asked
for a budget shared with every other process on its key and is not getting one,
so nothing is spacing those processes against each other. Sends still go out,
spaced by this process's own window, which is why it is a degradation and not a
failure, and it is said out loud once per outage rather than once per message.

That warning is the only place it is said today. `createEmailService` builds
the limiter inline and `createResendEmailService` keeps only its `send`, so no
reference to the limiter survives the call and nothing can read `kind`. Step 8a
will have to hand the limiter back, or take a callback, before the health
surface can report it. Worth knowing before that step starts, because the
reading already exists and looks reachable.

**A rate limit does not spend one of the row's five attempts.** Sending too
fast is our problem rather than the message's, and the five attempts are
counting something else: failures that would happen again the same way. So a
429 is retried inside the one send, which asks the provider at most three
times, each under the same idempotency key, so a refusal we cannot be sure the
provider ignored duplicates nothing. Only when those three are spent does the
refusal reach the row at all, and then as one attempt rather than three. Every
other refusal is the message itself, a bad address or a rejected payload, and
goes straight to the queue's own backoff.

## Queue health

`readMailQueueHealth` returns the counts and timestamps the admin banner needs,
as aggregates over `outbound_emails` grouped by state, which is what migration
0007's `(state, created_at)` index is for. It returns no formatted or relative
string: the surface's "has not gone out for three hours" is computed in the
browser from `oldestQueuedAt`.

Two things here are weaker than they look and are worth knowing before they are
trusted. `lastFailedAt` is the failing row's `created_at` rather than the moment
it failed, because no column records the latter; on a queue that drains in
minutes the two are close. And the counts cover `queued`, `failed`,
`suppressed` and `sent`, so a row stranded in `sending` by a crashed worker is
invisible on the banner as well as to the worker. Both are recorded rather than
fixed: the shape is frozen in `notifications.md`, and step 8a owns the route.

`readMailHealth` serves the admin-only `GET /api/mail/health` route. Its first
matching diagnosis is an unset base URL, an unset sender, an unverified domain,
a provider refusal, or queued backlog. A diagnosed queue is failing with no
sends in the last 24 hours and degraded with at least one; otherwise it is ok.
Terminal provider-refusal diagnoses use the same 24-hour horizon as recent
sends, measured by the failed row's creation instant because no precise
`failed_at` column exists. Queued retry refusals remain current regardless of
creation time. Internal worker codes (`base_url_unset`, `from_address_unset`,
`provider_unconfigured`, `no_template`, `render_failed`, `address_suppressed`)
do not diagnose a provider refusal after configuration is repaired. Historical
failures and queue totals remain unrestricted; an old terminal record alone
cannot prove that the provider is currently refusing mail.

The response exposes the latest failure's safe code and message, kind and
creation instant, plus active suppression count, without recipient addresses,
subjects, credentials or payload JSON. Persisted exception text is untrusted:
a rendering or provider error may quote the message's sign-in code or payload,
even after the worker scrubs a terminal payload. Health therefore replaces all
error messages, including historical rows and domain-check errors, with
application-owned summaries. Known SDK/internal identifiers and three-digit
HTTP error statuses are retained; unknown identifiers become
`provider_rejected`. Null fields remain null. Verification-related provider
text is classified internally and produces a fixed safe domain summary. Failed rows with nullable provider fields still
appear; queued retries with an error are also failures in progress.

`createMailDomainReader` uses Resend's read-only paginated domain list. Only
an exact sender-domain match with verified status and sending enabled counts
as verified. It caches each domain for 60 seconds and turns provider and
transport errors into a safe diagnostic message. `AppDeps.mailDomainReader`
can substitute a reader in tests or explicitly disable reads with `"none"`.
No adapter performs DNS writes, verification actions or a test send.

Provider reads finish before an immediate transaction persists the internal
`mail.domain_verified_at` and `mail.domain_last_check_error` facts. Success
sets or clears verification and clears the error; a failed real check records
its sanitized error while preserving the last verification instant. The
transaction rechecks the current sender domain and discards obsolete results.
Fake or disabled mail never contacts the provider, writes fabricated domain
facts or claims real verification, even when an old verified setting exists.
Existing sessions continue working while mail is failing.

## What each later step adds

| Step | Adds                                                                                      |
| ---- | ----------------------------------------------------------------------------------------- |
| 3a   | The caller for `sign_in_code`, in the transaction that mints the code                     |
| 5a   | `comment`: its payload type, its copy, and its two recipient sets                         |
| 6a   | `upload_session`, and the settle latch that decides when one message goes out             |
| 7a   | The removal messages, and `removal-reminder`'s enqueue call                               |
| 8a   | `invitation` and the `base_url_unset` requeue; mail health and its ladder are implemented |

## Removal copy and registry

The typed template registry now accepts all three removal kinds. The renderer
validates stored JSON against each public shared payload schema before
rendering; `removal_resolved` preserves its deleted/declined/withdrawn union
when omitting common fields for enqueue callers. No render requires a query.

Enqueue snapshots `preferencesUrl: null` for requester deleted and declined
answers, which bypass the removal preference; the template also enforces this
footer for older or generic payloads. Uploader deleted copies and withdrawal
messages can offer the account preference link. Provider suppression still
applies to every removal message. Deleted bodies contain no item URL.

Removal state changes call `enqueueRemovalEmails` inside their transaction.
Requested and withdrawn copies go to active snapshot uploaders and admins;
requester answers for declined/deleted bypass `notify_on_removal`. Deleted
uploader copies honor that preference. Every event excludes its actor and
identity deduplication prevents an uploader/admin receiving two copies. SQL
errors roll back state and prior mail, while unset base URL leaves failed rows.
Deletion reads and enqueues all open requests before item foreign keys become
null. The hourly reminder job selects recipients and enqueues in one immediate
transaction using the local-calendar week index (at least one). It blindly
inserts `removal-reminder:requestId:memberId:weekIndex`; unique conflicts keep
existing mail unchanged. Current admins are recomputed each run, with no
last-reminded state, catch-up, or cancellation of already queued messages.
See [removals.md](removals.md) for privacy, snapshots, and idempotency rules.
