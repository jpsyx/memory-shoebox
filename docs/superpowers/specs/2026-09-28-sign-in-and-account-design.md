# Step 4b: sign in and my account

**Step design** for step 4b of
[`docs/prds/2026-09-27-memory-shoebox/plan/step-4b.md`](../../prds/2026-09-27-memory-shoebox/plan/step-4b.md).

This is not the product spec. The product spec is
[`docs/PRODUCT.md`](../../PRODUCT.md) and
[`design-spec.md`](../../prds/2026-09-27-memory-shoebox/design-spec.md), the
contract is
[`apis/auth.md`](../../prds/2026-09-27-memory-shoebox/tech-specs/apis/auth.md)
and [`apis/conventions.md`](../../prds/2026-09-27-memory-shoebox/tech-specs/apis/conventions.md),
and the visual record is [`DESIGN.md`](../../../DESIGN.md). Those are read,
never restated. This document records only what is specific to building
surfaces 1 and 9 against a server that already works, and cites the rest.

## What this delivers

The first two surfaces anybody meets, live. Surface 1 in all seven of its
states, against the four anonymous and session routes step 3a finished.
Surface 9 in all four of its states, against the four account routes. The
placeholder viewer step 3b left behind is deleted and the guard becomes real,
which is what every later frontend step inherits.

It also delivers the end-to-end harness the build has not had, because five of
this step's own verification items cannot be proven without a browser.

## What already exists, and what it settles

| File                                                           | What it already settles                                                                                                                    |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/shared/src/auth.ts`                                  | Every schema this step sends or parses, named as `auth.md` fixes them. Nothing new is added to `packages/shared`                           |
| `apps/server/src/routes/auth.ts`, `me.ts`, `publicSettings.ts` | All eight routes plus the anonymous settings read. Step 3a is finished and this step does not touch it                                     |
| `apps/web/src/session/requireViewer/requireViewer.ts`          | The guard, complete, with one placeholder function body and a docstring naming exactly what replaces it                                    |
| `apps/web/src/api/client/client.ts`                            | `apiFetch`, and `ApiRequestError` already carrying `code` and `details`, which is where `attemptsRemaining` and `retryAfterSeconds` arrive |
| `apps/web/src/system/`                                         | Every component both surfaces need: `Card`, `Centred`, `TopBar`, `Page`, `Sheet`, `SheetHead`, `Banner`, `ChipRow`, the typography set     |
| `apps/web/src/system/system.module.css`                        | `.codeField`, `.fieldFixed`, `.notifyRow`, `.notifyNote`, `.tabular`, `.centred`, `.pageWide`, all lifted in step 3b and unused until now  |
| `apps/server/src/mail/runMailQueueOnce.ts`                     | `_defer`, which is what makes the harness in decision 8 deterministic                                                                      |

## Decisions

### 1. Surface 1's state lives in the URL

`/sign-in?redirect=<href>&email=<address>&sent=true`.

| Parameter  | Role                                                                                                                                                                                                              |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `redirect` | Already present from step 3b's guard. Drives the `link` lede, and is where the client navigates after `201`. It never reaches the server (`auth.md`: "It is never told where a `link`-state sign-in was heading") |
| `email`    | Pre-fills the field. Decision 2 already has an invitation link carrying the address as a plain query parameter, so this shape exists and nothing validates it before submission                                   |
| `sent`     | A code has been asked for, so the code field is rendered                                                                                                                                                          |

The alternative was component state, and it has a trap. Reload the page in the
middle of the flow and the address is gone, so the person retypes it, presses
the only button on the surface, and mints a fresh code that invalidates the one
already sitting in their inbox. The URL survives a reload and a back button,
and `resend` still works with no prior request in this tab, which `auth.md`
anticipates in as many words.

The four remaining distinctions are the last response, held in component state
and never in the URL, because a forgeable error state is not a state:

| Last response                         | State                                                      |
| ------------------------------------- | ---------------------------------------------------------- |
| `202` from either mint route          | `sent`, or `resent` when a code had already been asked for |
| `401 sign_in_code_invalid`            | `wrong`, carrying `details.attemptsRemaining`              |
| `410 sign_in_code_expired`            | `expired`                                                  |
| `410 sign_in_code_attempts_exhausted` | `resent`, with the reason line                             |

### 2. `unknown` is not a state, and the prototype is corrected

`auth.md` is explicit: states `sent` and `unknown` are one response, the
assertive wording is a claim the server cannot make and must never be able to
make, and the conditional wording is the only correct copy for every outcome of
that route. **So `unknown` does not appear in the client's state union at all.**
A `202` renders one thing. A state the client cannot compute cannot be got
wrong later.

That changes what the screenshot test in Verification is worth. It cannot
compare two client branches, because there is only one. It submits a seeded
member's address and an address nobody has heard of to the real server and
compares the two resulting screens, which proves the thing that actually
matters: that the response and the surface are indistinguishable end to end.

`prototypes/src/surfaces/SignIn.tsx` is corrected in the same change, because
this step's Verification compares every state against its prototype URL and a
reference that is knowingly wrong makes that comparison lie. The `unknown`
state id stays in the prototype's rail, since the design spec's surface table
names it and it is still a distinct thing to look at; it simply renders the
same copy as `sent` now, which is what its own state note has said all along.

### 3. One `/me` query serves both the guard and surface 9

`viewerQueryOptions`' query function becomes
`apiFetch({ path: "/me", schema: meResponseSchema })`, catching
`not_signed_in` and resolving `undefined` rather than throwing, exactly as the
seam's docstring requires: a rejected query in `beforeLoad` surfaces as a route
error instead of the redirect.

The cache entry holds the whole `MeResponse`. `Viewer` is derived from it, so
the guard and the shell keep reading what they already read, and surface 9
reads the same entry rather than issuing a second `GET /api/me`. The device
list is its own query (`["me", "sessions"]`), because it is a different route
and it is refetched after a revoke.

`_app.tsx` stops hardcoding "My Shoebox" and takes `settings.shoeboxName` from
that response. `/sign-in` cannot, because nobody is signed in, so it reads
`GET /api/public-settings`, which exists for this one purpose. A failure there
falls back to the word "Shoebox" rather than blocking the form: somebody who
cannot see the instance's name can still sign in, and somebody staring at a
spinner cannot.

`PLACEHOLDER_VIEWER` is deleted.

### 4. Surface 9 saves a switch on flip and a name on a button

A switch writes the moment it is flipped, sending all four booleans, which is
what `auth.md` requires whenever `notify` is present. Flipping a switch is the
action; a switch that looks flipped and is not yet saved is the one thing a
switch must never do. On failure it reverts and says so. "Turn them all off"
and "Turn them back on" are the same single `PATCH` with four falses or four
trues, and there is no fifth field anywhere (Decision 16).

**The switch moves when it is flipped, not when the server answers**, so the
write is applied to the cache optimistically and rolled back on failure. This
was nearly read the other way, because the sentence above can be made to argue
for waiting: if a switch must never look flipped while unsaved, then perhaps it
should not move until the save lands. It should. That rule exists to refuse a
separate Save button for switches, so that nobody is left hunting for how to
commit one. It is not an argument for a control that does nothing when tapped,
which on the phone most viewers hold means being tapped again. The sheet itself
holds no state, deliberately, so this is a requirement on whatever owns the
mutation rather than on the component.

The name is a text field and gets a **Save your name** button, enabled only
once the text differs from what is stored. `PRODUCT.md` § Users sets the bar at
the least technical viewer, and for that reader a visible button that confirms
is worth more than a field that saves silently on blur. Clearing the field
sends `null`, which `auth.md` says falls back to the email local part; the
resolved fallback is shown as the input's placeholder, which is what
`storedDisplayName` being separate from `member.displayName` exists for.

### 5. The first-sign-in line is carried, not written

`isFirstSignIn` arrives on the `201` and carries no number, deliberately. The
number in that sentence is viewer-filtered and belongs to the timeline
response, which is step 4a's and is not merged (`auth.md` Ruling 8: it is also
where it cannot accidentally be taken from a seed).

So this step owns the carrying and nothing else. Redemption writes the flag to
a module-scoped store in `session/firstSignIn/`, and `routes/_app/index.tsx`
reads it once and clears it on the way past. A module rather than the query
cache, because this is not a server fact and nothing should be able to refetch
it, and deliberately not `sessionStorage`, because the line is one-time and a
line that survives a reload is not. **The sentence is incomplete until step 4a
lands**, and the timeline placeholder renders the half it can honestly render
rather than inventing a count.

### 6. The source link is a constant plus the running version

`PRODUCT.md` § How it works makes this a product requirement rather than a
footnote: AGPL-3.0 section 13 obliges a modified version offered over a network
to offer its source, so "the interface needs a reachable way to get at the
source".

No setting holds a source URL. `SETTING_DEFINITIONS` has nine keys and none of
them is one, and adding a tenth is a change to `packages/shared` and to the
administration slice, both out of scope here. So the Licence sheet's **Get the
source** is a constant pointing at the upstream repository, and the version
beside it comes from `GET /api/health`, which already returns the server's
package version for exactly this kind of question. That satisfies "the source
of the exact version running this Shoebox" for an unmodified instance.

**Recorded as a gap rather than solved:** a self-hoster who modifies the code
has to edit that constant, because there is nowhere to configure it. Whoever
builds surface 11 should consider a `shoebox.source_url` key.

### 7. A member exists by a seed script

Inviting belongs to step 8a, so there is no way to create a member and no way
to sign in by hand or in a test. `apps/server/scripts/seedMember.ts`, run as
`pnpm seed:member <address> [--role admin]`, inserts a member and prints what
it made.

It also writes `public.base_url` if it is unset, and that is not incidental.
`enqueueEmail` writes a `sign_in_code` row **born terminal and already
scrubbed** when `public.base_url` is unset, which would make decision 8's
harness read an empty payload and leave a confusing failure. One script sets up
both halves so the two cannot drift apart.

It lives under `apps/server` because that is where the database client, the
column types and the migrations are, and a second place that knows the schema
would rot at the first migration. This stretches the step's "no changes to
`apps/server`" line, which is about the routes being finished; a dev-only
script that is not a route and is not reachable over HTTP is the narrowest
thing that does the job.

### 8. The harness reads the code out of SQLite, because the row never moves

`@playwright/test` and `playwright.config.ts` at the repository root, specs in
`e2e/`. The question the plan README asks first is how a test gets a six-digit
code, given `makeScrubPatchFromKind` wipes `payload_json` and the subject once
a `sign_in_code` row reaches `sent`.

**The run starts the server with mail unconfigured**: no `RESEND_API_KEY` and
`ENABLE_FAKE_EMAIL` unset, so `getEmailServiceKind` answers `none`. The worker
then takes `runMailQueueOnce`'s `_defer` path, which puts the row back to
`queued`, leaves `attempts` exactly where it was, and **writes no scrub patch**.
The six digits sit in `payload_json` indefinitely and the test reads them with
`better-sqlite3`. No race against a ten-second worker, no PDF text extraction,
and no change to `apps/server`.

The two rejected options are recorded because both look reasonable. Parsing the
fake-mode PDF exercises one more step of the real path and costs a text
extractor plus a wait on the worker, after which the row is scrubbed and a
retry is impossible. A third recording `EmailService` reads most cleanly and is
new code in `apps/server`, which this step does not own.

**The harness is not in `pnpm check`.** It needs browsers installed and a
server on a port, so it is `pnpm test:e2e`, run deliberately. `pnpm check` stays
what it is.

## The copy, in full

Every string, because `conventions.md` § Errors says `message` off the wire is
never the primary UI copy, so each code has to become a sentence here.

### Surface 1, by state

| State                      | Lede                                  | Body                                                                                                                                            |
| -------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `link`                     | Somebody sent you a link into {name}. | Sign in and it opens on the one you were sent. Only people in this Shoebox can see inside, so the link on its own will not do it.               |
| `email`                    | Sign in to {name}.                    | We will email you a six-digit code. There is no password to remember and nothing to install.                                                    |
| `sent`, `wrong`, `expired` | Check your email.                     | If **{address}** is in this Shoebox, a six-digit code is on its way there now. It arrives in about a minute and it works for ten.               |
| `resent`                   | Check your email.                     | If **{address}** is in this Shoebox, a new code is on its way there now. The old one has stopped working. It usually arrives in about a minute. |

The `link` lede names the archive and nothing else: not who shared, not what
was shared, not a count. The design spec's flow prose says the page "names who
shared and how many", and that is stale: the destination never reaches the
server, so the client cannot know either fact, and the prototype's own state
note already settles it the other way. Recorded here rather than silently
diverged from.

### Every failure, as a sentence

| Code                                    | When                                 | Status | Where it shows                      | Copy                                                                                                                                                                           |
| --------------------------------------- | ------------------------------------ | ------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `sign_in_code_invalid`                  | 2 left                               | 401    | Code field                          | That is not the code in the email. Two tries left before we send you a new one.                                                                                                |
| `sign_in_code_invalid`                  | 1 left                               | 401    | Code field                          | That is not the code in the email. One try left before we send you a new one.                                                                                                  |
| `sign_in_code_invalid`                  | the server omits `attemptsRemaining` | 401    | Code field                          | That is not the code in the email. Check the newest email and try again.                                                                                                       |
| `sign_in_code_expired`                  |                                      | 410    | Code field                          | That code has expired. They last ten minutes. Send another and use the newest email.                                                                                           |
| `sign_in_code_attempts_exhausted`       |                                      | 410    | Code field, state moves to `resent` | That was the last try, so that code has stopped working. A new one is on its way.                                                                                              |
| `rate_limited`, minting                 |                                      | 429    | Under the button                    | Wait {n} minutes, then ask for another. A code that has already arrived still works for ten minutes from when it was sent.                                                     |
| `rate_limited`, minting                 | the server omits `retryAfterSeconds` | 429    | Under the button                    | You have asked for a code several times just now. Wait a few minutes, then ask for another. A code that has already arrived still works for ten minutes from when it was sent. |
| `rate_limited`, redeeming               |                                      | 429    | Code field                          | Too many tries. Wait {n} minutes and try the code again.                                                                                                                       |
| `rate_limited`, redeeming               | the server omits `retryAfterSeconds` | 429    | Code field                          | Too many tries. Wait a few minutes and try the code again.                                                                                                                     |
| `invalid_request`                       |                                      | 400    | The named field                     | That does not look like an email address. / The code is six digits.                                                                                                            |
| anything else, including a dropped call |                                      | any    | Under the button                    | Something went wrong at our end. Try again in a moment.                                                                                                                        |

Four rules hold across that table. The count in `attemptsRemaining` is read
off the response and never computed locally, because it is read off the row
after the increment. `{n}` is `retryAfterSeconds` rounded up to whole minutes,
formatted in the browser. Both fields are `.optional()` on the wire
(`packages/shared/src/errors.ts`), so when either is absent the sentence says
no number at all rather than guessing one, and never fails toward the short
side: "a few minutes" and "check the newest email" stand in for a number the
server did not send. And **no failure ever mentions the address not being
a member**, because no failure can know: every one of these is reached
identically by a member and by an address nobody has heard of.

### Surface 9, the additions

The prototype's copy stands. What it has no state for:

| Situation                                     | Copy                                                              |
| --------------------------------------------- | ----------------------------------------------------------------- |
| Name saved                                    | Saved.                                                            |
| Name over 80 characters                       | That is longer than the space we have. Eighty characters at most. |
| A switch failed to save                       | That did not save. Try again.                                     |
| Revoking a device that had already gone (404) | That device had already gone.                                     |

## Module layout

```
apps/web/src/
├── api/
│   ├── auth.ts               the two mint calls, redeem, and sign out
│   ├── me.ts                 meQueryOptions, updateMe, the device list, revoke
│   └── publicSettings.ts     the anonymous Shoebox name
├── session/
│   ├── requireViewer/        the placeholder deleted, Viewer derived from MeResponse
│   └── firstSignIn/          set on redemption, read once, cleared
├── surfaces/
│   ├── SignIn/               SignInCard, CodeField, signInCopy, the state machine
│   └── Account/              YouSheet, EmailSheet, DevicesSheet, AdminDoors,
│                             LicenceSheet, SignOutModal
└── routes/
    ├── sign-in.tsx           search schema and the surface
    └── _app/account.tsx      the surface

e2e/
├── signIn.spec.ts            arrival, wrong, expired, exhaustion, deep entry
├── account.spec.ts           name, switches, devices, cross-context revocation
└── support/                  the server fixture, seedMember, readSignInCode
playwright.config.ts
apps/server/scripts/seedMember.ts
```

`src/surfaces/` is new and mirrors `prototypes/src/surfaces/`, which is the
vocabulary this repository already uses for the thing being built. It is not
under `src/routes/`, because everything there is a route to the generator.
Route files stay thin: a search schema and the surface, as they are today.

## The admin doors

Five, admin only, rendered from `me.role`. Each links to a route step 3b
stubbed:

| Door                 | Route               | Built by |
| -------------------- | ------------------- | -------- |
| Shoebox settings     | `/settings`         | step 9   |
| Members and groups   | `/members`          | step 9   |
| Milestones           | `/milestones`       | step 8b  |
| Who has been looking | `/presence`         | step 9   |
| Removal requests     | `/removal-requests` | step 8b  |

**The prototype's "Removal requests · 2" loses its count.** That number comes
from the removal slice, which step 7a owns, and this step will not invent one.
The word alone is the door.

## Verification

`pnpm check` green, plus the step's own list. Which harness proves which:

| Check                                                                             | How                                                                                                                                    |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| The whole "Arriving for the first time" flow against a real code                  | `e2e/signIn.spec.ts`, plus once by hand on a phone-width viewport                                                                      |
| `unknown` and `sent` render identical copy                                        | `e2e/signIn.spec.ts` submits a seeded address and an unknown one, then compares the two screenshots. The honest test the step asks for |
| Every state at 1280px and 400px, both colour schemes                              | Playwright against both the prototype URL and the built surface                                                                        |
| Keyboard only: sign in, correct a name, toggle a switch, sign a device out        | `e2e/`, using keyboard navigation throughout rather than clicks                                                                        |
| 200% zoom, no horizontal scrolling, nothing clipped                               | Playwright at 640x450 CSS pixels, which is 1280x900 at 200%                                                                            |
| A device signed out in one browser stops working in the other on its next request | `e2e/account.spec.ts` with two browser contexts, which is the promise the Account banner makes                                         |
| The countdown, the automatic resend, and the deep-entry return                    | `e2e/signIn.spec.ts`                                                                                                                   |
| Every failure becomes the right sentence                                          | Component tests over the error table above, driven by `ApiRequestError`                                                                |

## Documentation

Updated in this step, per `AGENTS.md`:

- **`docs/web.md`**: § Routing, where the guard's seam is described as a
  placeholder and is now real; a new section on the two surfaces; and § Tests,
  which gains the end-to-end layer.
- **`docs/e2e.md`**, new: what the harness is, why the run leaves mail
  unconfigured, and how a test reads a sign-in code.
- **`docs/configuration.md`**: how to get a member to sign in as locally,
  which is `pnpm seed:member` and has not existed before.
- **`docs/architecture.md`** § What is not built yet: brought up to date.
- **`docs/prototypes.md`**: the sign-in copy correction, so the next reader
  finds the change explained rather than discovering it.
- **`step-4b.md`** and the plan **`README.md`** status table.

## Out of scope

Named so this step does not drift into them:

- The timeline it lands on. A placeholder, plus the carried flag from decision 5
- Everything behind the five admin doors
- Any change to `apps/server`, except the dev-only script in decision 7
- Any change to `packages/shared`, which already holds every schema used here
- Inviting anybody, which is step 8a and is why decision 7 exists at all
