# Email copy (`packages/emails`)

Every message Memory Shoebox sends is a React component in this package,
rendered by react-email into the two forms a mail client picks between. The
package exists because of a constraint that is easy to miss and expensive to
discover: **it is the only package in this repository that compiles**, and it
has to be.

[`mail.md`](mail.md) owns the queue, the worker and the seam a message is
delivered through. This document owns the copy: why it is compiled, why its
imports look unlike every other file here, what a template is, and what a mail
client will and will not do with what comes out.

## Layout

```
packages/emails/
├── package.json                 main and exports point at dist, not src
├── tsconfig.json                type-check only, like its siblings
├── tsconfig.build.json          the one that emits, with jsx: react-jsx
└── src/
    ├── index.ts                 one template object per kind that has copy
    ├── emailTemplate.types.ts   EmailTemplate, RenderedEmail
    ├── lib/
    │   ├── emailTheme.ts        literal hex, a system font stack, the source URL
    │   ├── renderEmail.ts       one element, rendered into both forms
    │   ├── spellSmallNumber.ts  so the copy reads "ten minutes"
    │   └── EmailShell.tsx       masthead, 600px column, footer
    └── templates/
        ├── InvitationEmail.tsx  an invitation with address-prefilled entry
        ├── SignInCodeEmail.tsx  the sign-in code
        ├── CommentEmail.tsx     a comment, to its uploader or a prior commenter
        ├── UploadSessionEmail/  a finished batch, to whoever can see some of it
        ├── RemovalRequestEmail.tsx  the ask, to uploader and admins
        ├── RemovalReminderEmail.tsx  weekly, until the ask is settled
        └── RemovalResolvedEmail/  deleted, declined, and withdrawn bodies
```

## Why this package compiles when nothing else here does

`apps/server` runs its TypeScript unmodified: Node strips the type annotations
as it loads a file and transforms nothing else. **JSX is not something that can
be stripped.** `<p>hi</p>` is not an annotation with a runtime value hiding
underneath it, it is syntax that has to be rewritten into a function call, and
Node will not do that for anybody.

The next person to read this will otherwise try putting a `.tsx` file in the
server, so here is the minute that saves:

```sh
printf 'export const x = <p>hi</p>;\n' > probe.ts && node probe.ts
# SyntaxError [ERR_INVALID_TYPESCRIPT_SYNTAX]: Expression expected
```

Naming it `probe.tsx` does not rescue it. Node does not recognise that
extension at all, and says so instead.

So the copy lives in a package with a build step and `apps/server` imports its
`dist/` rather than its `src/`. That is the whole of the exception: `main` and
`exports` point at `dist`, `pnpm dev` and `pnpm dev:server` build this package
before starting the server, and the `Dockerfile` builds it before it builds the
web app. The server itself still has no build step, and the production image
still runs the same files a developer does.

The cost is that build step. What it buys is one source for both forms of every
message. The alternative, and what this replaced, was string templates: hand
written table markup beside a hand written plain-text version, two of them per
kind and seven kinds to come. Those drift, and the plain-text one drifts
silently, because almost nobody reviewing a change opens it.

## The extension rule, and the bug it caused

Relative imports in this package carry the **real** extension, `.ts` or
`.tsx`, and `rewriteRelativeImportExtensions` turns each one into `.js` on
emit. `apps/server` and `packages/shared` require a `.ts` for a different
reason, which is that Node resolves their imports literally at runtime, and
`apps/web` forbids an extension entirely. `.oxlintrc.json` enforces the three
separately, so a file here is linted against the rule that fits what happens to
it.

It reads like a style choice and it is not. Written extensionless, this package
type-checks, passes every test in the repository, and then kills `pnpm start`
on the first import, because Node's ESM resolver will not guess an extension.
Nothing in the toolchain notices: `tsc` runs under
`moduleResolution: "bundler"`, Vitest resolves through Vite, and the server's
own suite imports this package through Vite as well. **Only `node` rejects it**,
and nothing in this repository used to ask `node` anything.

`test/distRuntimeImport.test.ts` is what asks now. It builds the package, then
shells out to a real `node` and has it import `dist/index.js` and render a
message, so the whole import graph loads rather than just the entry point. It
is the only check here that runs `node` itself. When it fails, a relative
import has lost its extension or `rewriteRelativeImportExtensions` has been
turned off. Restore the extension rather than deleting the test.

## What a template is

An object with two fields: a synchronous `subject` and an asynchronous
`render`. Both **take the payload and nothing else**.

The split is not cosmetic. `subject` is needed at enqueue, where the row's
`subject` column is written, and the body is not rendered until the send, which
in the retry case is hours later. That gap is the reason for the rule the two
share: a row retried a day after it was written has to produce the identical
message, so everything the copy reads travels in the payload and is frozen when
the row is written. The mechanical test is that if rendering would need a
query, the payload is wrong. See
[`mail.md` § Rendering takes the payload and nothing else](mail.md).

`render` is asynchronous because react-email is, which is why the queue's
worker awaits it.

Which kinds may be enqueued at all is decided next door, by `EMAIL_TEMPLATES`
in `apps/server/src/mail/templates/emailTemplates.constants.ts`, because that is
a question about the queue rather than about the copy. Seven kinds have copy
today: `sign_in_code`, `invitation`, `comment`, `upload_session`,
`removal_request`, `removal_reminder`, and `removal_resolved`.

## The `comment` kind, and its two variants

`CommentEmail.tsx` is one template with one branch, on `payload.relation`.
Both variants quote the comment itself, because a grandmother who never opens
the link still reads what was said.

| `relation`  | Subject                             | Why it arrived                                                                               |
| ----------- | ----------------------------------- | -------------------------------------------------------------------------------------------- |
| `uploader`  | "Ana wrote on one of your photos"   | You put the photo up. Everyone else who wrote on it got one too, one each, not one per reply |
| `commenter` | "Ana has written on that photo too" | You wrote on it as well. This one can be turned off on its own                               |

**The reply variant never says "one of your photos" to somebody who did not
upload it**, which is the whole reason the two are separate strings rather
than one with a name substituted: it names the uploader instead, and its lede
says they put it up and you wrote on it. Both are compared against the
`emails` prototype surface's `comment` and `comment-reply` states.

The server decides the variant in
`apps/server/src/items/enqueueCommentEmails.ts`, which enqueues in the same
transaction as the comment insert: a message is never queued for a comment
that did not land, and the comment never lands without its message. A
recipient is included once, at their strongest relationship to the item,
uploader before commenter, and that relationship picks which preference
governs their copy: `members.notify_on_comment` for the uploader,
`members.notify_on_reply` for a prior commenter. There is no threading; a
"reply" is another top-level comment on the same item. The author never hears
about their own comment; a removed member keeps their comments and stops
getting mail; and a recipient who can no longer see the item is dropped,
because the message carries a link to it, under the same predicate every read
uses and with a people tag never consulted (Decision 7).

### Deleting the comment cancels the message; editing it does not

Deleting a comment sets any `outbound_emails` row for that comment still in
`queued` to `cancelled`, in the delete's own transaction, so a message does
not arrive quoting something that no longer exists at a link that no longer
shows it. **A row already `sending` or `sent` is left exactly as it is**: it
cannot be recalled, and cancelling it would make the delivered-or-not boundary
a race.

**An edit touches nothing.** The payload was frozen when the row was written,
which is the rule every kind lives under, so a message already queued still
carries the words as they were typed. That is the limit the product cannot
fix and says so in the copy's own docstring: an edit cannot catch a message
already delivered, and pretending otherwise by rewriting a queued payload
would only make the two cases inconsistent.

## The `upload_session` kind, and its three shapes

`UploadSessionEmail.tsx` is one template for the three states surface 16 draws
for a finished batch. **Every figure in it is the reader's own**: the payload
carries how many of the batch's photographs this recipient can see, and on how
many days, and never a batch total, because a shared total would tell somebody
how much exists beyond what they can open (`notifications.md` Decision 4).

| State              | When                      | Subject                                    |
| ------------------ | ------------------------- | ------------------------------------------ |
| `upload`           | `visibleDayCount` is 1    | "Papá put up 210 photos from 14 September" |
| `upload-narrowed`  | The same, a smaller count | "Papá put up 3 photos from 14 September"   |
| `upload-multi-day` | `visibleDayCount` is more | "Papá put up 210 photos, from 11 days"     |

**Narrowed is not a shape of its own.** The payload cannot tell it from the
first, because narrowing is only a smaller `visibleItemCount`, so the copy
never says that the reader is seeing part of a batch. The multi-day body names
the span, which is why the payload carries `firstCapturedOn` and
`lastCapturedOn` beyond what `notifications.md` § 3 first wrote out: rendering
takes the payload and nothing else. `capturedOn` is the day carrying most of
this reader's photographs, the earliest winning a tie, and it is the day the
one-day shape names. **`milestoneName` is the milestone on `lastCapturedOn`**,
the day the link opens at, which is what the multi-day copy means by "the last
of them"; on one day the three days are the same. The payload's schema holds
them to agreeing: `firstCapturedOn` to `lastCapturedOn` contains `capturedOn`,
one day means all three are equal and several mean the first and last differ,
and every counted day holds at least one photograph. Days are formatted in UTC,
because a `YYYY-MM-DD` day is already local to `shoebox.timezone` and has no
zone left to convert.

**The link is `${baseUrl}/?at=${lastCapturedOn}`**: the timeline started at
the batch's newest visible day, so reading down passes every one of them.
`?at=` is the start position the jump rail already writes. `notifications.md`
§ 3 first wrote `/day/<capturedOn>`, and there is no such route.

The server decides who gets one in
`apps/server/src/upload/enqueueUploadSessionEmails.ts`, inside the transaction
where the settle latch fired, so the message goes out once per batch and never
for one that did not settle. The uploader is never a recipient, and neither is
anybody with `members.notify_on_upload` off or anybody not yet `active`.

## Where the plain text comes from

The same component, rendered a second time. `renderEmail` takes one element and
returns both forms, so there is no second source for the two to drift apart
from.

It is one shared function rather than two calls inside each template because
the plain-text options are the easy thing to forget, and forgetting them is
invisible: no wrapping is applied by default, and a message that arrives as
four unbroken paragraphs still passes every assertion anybody thought to write
about its words.

**The plain-text form is never omitted.** For some members in this audience it
is the only version that ever arrives.

## What the copy may not use

A mail client is not a browser. It resolves no custom property, fetches no
webfont, and may show the plain-text alternative instead of any of the design.
So three rules hold, and all three are structural rather than aesthetic:

- **Nothing in a message may reference a design token.** `emailTheme.ts` holds
  literal hex and a stack of fonts a client already has. A `var(--ms-ink)` or a
  `color-mix()` is dropped by the renderer and takes the design with it.
- **No layout that needs a modern renderer.** A 600px column and nothing that
  depends on flex or grid resolving.
- **The footer's preferences link is rendered when `preferencesUrl` is set and
  omitted when it is null**, which includes sign-in codes and requester deletion/decline answers,
  because offering to turn off a message that cannot be turned off is a lie.

This is the one surface that has to survive being forwarded into a client
nobody here has ever seen.

## How to look at one

Install the browser the PDF writer needs, once, from the repository root:

```sh
pnpm --filter @memory-shoebox/server exec playwright install chromium
```

Then set both of these in `.env.server.local` at the repository root:

```
NODE_ENV=development
ENABLE_FAKE_EMAIL=true
```

Ask for a sign-in code and the message is written to
`~/Downloads/memory-shoebox-emails` as a PDF instead of being sent, with the
addressing drawn across the top of it so the subject line is readable, which
for `sign_in_code` is where the code actually is.

Both variables are required, and the `NODE_ENV` half is a safety gate rather
than a convenience: it is not enough for `NODE_ENV` to be something other than
`production`. See
[`mail.md` § Fake email writes a PDF and reports success](mail.md), which is
where that gate and its reasoning live.

## Removal messages: five bodies, three kinds

`RemovalRequestEmail.tsx` and `RemovalReminderEmail.tsx` address uploaders and
admins. The request explicitly says nothing has happened; the reminder uses
its snapshotted `weekIndex` for elapsed weeks. Optional reasons are quoted
verbatim, preserving line breaks, with names replacing inferred pronouns.
Calendar dates are formatted without timezone conversion; resolution instants
are displayed in the payload's Shoebox timezone.

`RemovalResolvedEmail/` dispatches deleted, declined, and withdrawn outcomes.
Deleted messages carry no item link. Requester copies include reassurance;
uploader copies omit the requester-only reassurance. Declined messages put
the decliner's verbatim words immediately after the heading, then hedge that
visibility may have changed. Withdrawal says there is no work left and the
photo is untouched. These bodies follow the five removal prototype states.

Requester deleted/declined answers omit the preference link even if a generic
payload carries one. Uploader deletion and withdrawal copies keep it when
provided. The approved deletion copy describes the completed removal; actual
object cleanup continues through the existing queued deletion worker.

Removal template descriptors export `RemovalRequestEmailTemplate`,
`RemovalReminderEmailTemplate`, and `RemovalResolvedEmailTemplate`. The shared
mail shell and its tests live in `src/lib/EmailShell/`. Upload and removal copy
share the UTC calendar-day formatter in `src/lib/dayLabel.ts`, so a captured
calendar date stays on the same day in every recipient timezone.

## Invitation copy

`InvitationEmail` and `invitationEmail` supply the seventh compiled template.
HTML and plain text name the inviter and Shoebox, show the invitee's own
prospective item count (including zero/singular/plural), and name the invited
address. The join URL is `/join?address=<encoded address>` and carries no
credential: the visitor still requests and types a six-digit code. Copy promises
nothing to install and no password, and shows the seven-day expiry date in the
frozen Shoebox timezone. Names are escaped by React in HTML.

The queue freezes attribution, identity, recipient metadata, counts and expiry
at enqueue. Sender configuration remains a worker-time choice: invitations
queued before a sender is configured can deliver after configuration without
rewriting their copy. The registry validates the stored shared payload before
rendering, and the established suppression/idempotency rules still apply.

Invitations omit the preferences footer even when common queue metadata carries
an account link: no member preference switch controls an invitation.
