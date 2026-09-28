# Email delivery: rendered, rate limited, and faked

**Step design** for the email stack: react-email templates, an `EmailService`
that hides whether a message reached Resend or a PDF on disk, and the rate
limiting the provider requires.

This is not a step in
[`docs/prds/2026-09-27-memory-shoebox/plan/README.md`](../../prds/2026-09-27-memory-shoebox/plan/README.md).
It is infrastructure the numbered steps use, requested so that development and
testing stop depending on a real inbox. The contract it serves is
[`notifications.md`](../../prds/2026-09-27-memory-shoebox/tech-specs/apis/notifications.md)
Part 1, which is unchanged by this work: the payload still holds resolved
values, the renderer still takes the payload and nothing else, and the queue is
still the log.

## What this delivers

- `packages/emails`, a new workspace package holding react-email templates,
  compiled to JavaScript because JSX cannot be erased.
- `EmailService`, the delivery seam, with three implementations: Resend,
  a fake that writes a PDF to `~/Downloads/`, and the recording double the
  tests already use.
- Rate limiting on every Resend call, through Upstash when it is configured and
  in memory when it is not.
- Playwright, installed and configured, which the PDF writer uses and the
  end-to-end suite will inherit.
- The `sign_in_code` email, ported to react-email. The six kinds with no copy
  yet stay unwritten.

## What already exists, and what it settles

| File                                                          | What it already settles                                                                                                                            |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/server/src/mail/createResendMailSender.ts`              | `MailSender`, the seam every test substitutes: one `send(request)` taking a finished `html` and `text`. `EmailService` is this shape grown up      |
| `apps/server/src/mail/runMailQueueOnce.ts`                    | Claim, render, send, retry, scrub. Rendering happens **before** the sender is reached, which is what lets a fake receive exactly what Resend would |
| `apps/server/src/mail/templates/emailTemplates.constants.ts`  | `EMAIL_TEMPLATES` gates what may be enqueued, and `EMAIL_RENDERERS` parses a stored payload before rendering it                                    |
| `apps/server/src/mail/enqueueEmail.ts`                        | Writes inside the caller's transaction and never throws on a mail problem                                                                          |
| `apps/server/src/config.ts`                                   | Parses the environment with Zod, takes it as an argument, and reports every offending variable at once                                             |
| `docs/mail.md` § Rendering takes the payload and nothing else | The invariant this work must not break                                                                                                             |

## Decisions

### 1. JSX cannot run in `apps/server`, so the templates are a built package

`AGENTS.md` states that Node executes this server's TypeScript directly and
that the server has no build step. That is not a preference: the Dockerfile
ships the source, and migrations run from the same files.

Node's type stripping covers `.ts`, `.mts` and `.cts`. It does not cover
`.tsx`, and the reason is structural rather than an oversight: stripping a type
annotation is erasure, replacing it with whitespace, while JSX has to be
**transformed** into function calls. Measured rather than assumed:

```
$ node probe.tsx
const name: string = "world";
      ^^^^
SyntaxError: Missing initializer in const declaration
```

The failure is on the type annotation, which shows Node did not treat the file
as TypeScript at all.

So the templates live in `packages/emails`, which compiles, and `apps/server`
imports its build output. `pnpm build` is already `pnpm -r build`, so the
workspace topology does not change; one package gains a build, and the server
keeps running the files you edit.

**The two alternatives, and why not.** Writing the templates with
`React.createElement` from a plain `.ts` file needs no build anywhere and gives
up exactly the ergonomics react-email exists to provide. Running the server
under a transpiling loader (`tsx` is already a devDependency for the skills
CLI) would also work and would put a transpiler in the production path, which
is the property the no-build decision was protecting.

**`packages/shared` stays source-only.** It is consumed as TypeScript by both
halves of the app and has no JSX, so nothing about this changes it.

### 2. `EmailService` delivers; it does not render

The worker renders from the stored payload and hands the sender a finished
`html` and `text`. `EmailService` keeps that boundary, which buys three things:

- **The fake receives exactly what Resend would.** A PDF made from the same
  `html` string proves the real path rather than approximating it.
- **The queue's determinism is untouched.** `docs/mail.md` requires that
  rendering be a pure function of the payload so that a retry a day later
  produces an identical message. Rendering inside the sender would put a
  provider and a clock between the payload and the output.
- **The worker does not change.** Its tests are the evidence that the seam
  really did keep its shape.

`MailSender` is renamed to `EmailService` and gains implementations rather than
responsibilities. The request it takes is unchanged.

The rename is mechanical and reaches further than one file: `MailSender`,
`MailSendRequest`, `MailSendResult` and `MailSendError` in
`apps/server/src/mail/`, the `mailSender` dependency on `createApp`, the
`"none"` literal that means "deliberately do not send", and
`createRecordingMailSender` in the test helpers. Every one of them keeps its
meaning. A rename that large is worth doing in its own commit, before anything
is added, so the commit that adds behaviour is readable.

### 3. Fake mode needs two conditions, and one of them cannot be set by mistake

The fake engages only when `ENABLE_FAKE_EMAIL` is `true` **and** `NODE_ENV` is
not `production`.

The second condition is derived from `NODE_ENV` rather than a separate `DEV`
variable. Two variables that mean the same thing can disagree, and the failure
that matters is the asymmetric one: a production instance silently writing
PDFs instead of sending mail would look exactly like a working instance to
everybody except the person waiting for a code. Deriving it means the guard
holds even if the flag is set on a server by accident.

### 4. The PDF comes from Playwright

react-email produces HTML. Turning HTML into a PDF needs a browser, and
Playwright is being installed for the end-to-end suite anyway, so the fake
costs no new dependency: `setContent(html)` then `pdf()`.

**It is imported lazily**, inside the fake implementation, so production never
loads Playwright and the browser binary stays a development concern.

Files land in `~/Downloads/memory-shoebox-emails/`, named for the instant, the
kind and the recipient, so a run of several is readable in a file listing. The
directory is created when missing.

### 5. The limiter falls back rather than refusing to boot

Avandar's `ResendClient` throws at construction when the Upstash variables are
missing. This product promises the opposite: `docs/architecture.md` requires an
existing session to survive a mail outage, and an admin has to reach the
settings surface to configure mail at all, so a fresh instance boots with
nothing set.

So the limiter is chosen, not required: Upstash when its two variables are
present, and the same sliding window in memory when they are not. Both are real
limiting. A single Fly machine running one queue worker is exactly the case an
in-memory window handles correctly, and the Upstash path exists because the
limit belongs to the API key rather than to the process, so a script run beside
the server shares the budget.

The window is 1.7 per second against Resend's 2, and the call waits for a slot
rather than failing, which matches Avandar. A 429 from Resend itself is
retried rather than counted as a send.

### 6. Upstash's own variable names

`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`, which is what the
Upstash console hands you, rather than Avandar's `UPSTASH_REDIS_API_URL` and
`UPSTASH_REDIS_REST_API_TOKEN`. Both are recorded here because somebody pasting
credentials between the two repositories will otherwise assume they match.

Every new variable ships blank in `.env.example`: `ENABLE_FAKE_EMAIL`,
`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.

### 7. The sign-in email is ported, and the six unwritten kinds stay unwritten

react-email becomes the one way an email is written here, and
`signInCodeTemplate.ts` is ported to prove it against the only copy that
exists. The constraints that copy was built under survive the port because they
are properties of the output rather than of the authoring style: a system font
stack, literal hex, a 600px column, the digits in the subject so the code reads
from a lock screen, and no preferences link in the footer, because a sign-in
code is the one message nobody may turn off.

The six kinds with no copy (`invitation`, `upload_session`, `comment`, and the
three `removal_resolved` outcomes) are not written here. They need product copy
decisions that belong to steps 5a through 8a, and `EMAIL_TEMPLATES` already
makes enqueuing a kind with no template a type error.

### 8. The package renders a parsed payload; the server still does the parsing

`EMAIL_RENDERERS` currently takes `unknown`, parses it with the kind's Zod
schema, and only then renders, because the worker reads `payload_json` back out
of SQLite where a row may have been written by an older build. That parse stays
in `apps/server`, and `packages/emails` exports a render function per kind that
takes an already-parsed payload.

The split matters for what each piece has to know. The queue's concerns, a
stored row that might not match its own kind any more and a failure that has to
land as `render_failed`, stay with the queue. The package stays a function from
a typed payload to two strings, which is also what makes a template testable
without a database. It depends on `packages/shared` for the payload types only.

### 9. The plain text comes from the renderer, not a second template

`@react-email/render` produces a plain-text rendering of the same component.
That replaces the hand-written text half of each template, so the two cannot
drift, and it keeps the contract that the text alternative is never omitted:
for some readers in this audience it is the only version that arrives.

## Module layout

`@memory-shoebox/emails`, built with `tsc` and `jsx: "react-jsx"`, which adds
no tool the repository does not already have.

```
packages/emails/
├── package.json            a real build, unlike the other packages
├── src/
│   ├── index.ts            one render function per kind that has copy
│   ├── templates/
│   │   └── SignInCodeEmail.tsx
│   └── lib/
│       ├── EmailShell.tsx  the masthead, the footer, the 600px column
│       └── emailTheme.ts   literal hex and the system font stack
└── dist/                   built output, imported by apps/server

apps/server/src/mail/
├── EmailService/
│   ├── EmailService.ts           the type, and the factory that chooses
│   ├── createResendEmailService.ts   Resend, behind the limiter
│   ├── createFakeEmailService.ts     the PDF writer
│   └── createSendRateLimiter.ts      Upstash, or memory
├── runMailQueueOnce.ts     unchanged except for the seam's name
└── templates/              the registry, now delegating to packages/emails
```

## The send path, end to end

1. A caller enqueues inside its own transaction. Unchanged.
2. The worker claims a row and parses `payload_json` through the kind's schema,
   exactly as it does now, then calls that kind's render function in
   `@memory-shoebox/emails`, which returns `html` and `text` from one
   react-email component.
3. It hands both to `EmailService.send`, with the row's idempotency key.
4. **Resend path:** the limiter waits for a slot, the SDK is called with the
   idempotency key, and a 429 is retried rather than recorded as an attempt.
5. **Fake path:** Playwright renders the HTML and writes a PDF to
   `~/Downloads/memory-shoebox-emails/`, then reports success with a synthetic
   message id so the row goes `sent` exactly as it would have.
6. Either way the worker records the outcome, scrubs a terminal `sign_in_code`
   row, and moves on.

## What the queue's determinism asks of a React template

A template is a function of its props and nothing else. No clock, no database,
no `public.base_url` read at render time: every value the copy needs is already
in the payload, resolved at enqueue, which is what makes a retry a day later
produce the identical message. A component that reached for anything outside
its props would break that quietly, so the renderer takes the parsed payload
and passes it whole.

## Verification

| Test                                              | Asserts                                                                                                                         |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| The ported sign-in email, rendered from a payload | The digits appear in the subject and the body, the lifetime sentence reads in words, and the footer carries no preferences link |
| The same, plain text                              | A text alternative is produced and carries the code                                                                             |
| `EmailService` selection                          | Fake when both conditions hold, Resend when a key exists, neither when nothing is configured                                    |
| Fake mode with `NODE_ENV=production`              | Refuses to fake, however the flag is set                                                                                        |
| The fake, run once                                | A PDF exists at the expected path, and the row goes `sent`                                                                      |
| The limiter, with no Upstash configured           | Still limits, in memory, and the server boots                                                                                   |
| The limiter, over a burst                         | Sends are spaced rather than refused                                                                                            |
| A 429 from the provider                           | Retried rather than counted as a failed attempt                                                                                 |
| The existing worker and queue suites              | Pass unchanged, which is the evidence the seam kept its shape                                                                   |
| `pnpm check`                                      | Green, including the new package's build                                                                                        |

No test sends. The recording double stays the sender every test uses, and the
fake is exercised against a temporary directory rather than `~/Downloads`.

## Documentation

- `docs/mail.md`: the seam's new name, the three implementations, fake mode and
  what it writes, the limiter and its fallback.
- `docs/emails.md`, new: the package, how to write a template, how to look at
  one locally.
- `docs/configuration.md` and `apps/server/.env.example`: three new variables.
- `docs/architecture.md`: a second package that builds, and why.
- `AGENTS.md`: the stack list gains the package, and the no-build-step claim
  gains its one exception.

## What this leaves to the end-to-end plan

Playwright is installed and proven here by the PDF writer. The configuration,
the specs and the browser-driven sign-in flow are the next plan's, and they
arrive on a harness that already works.
