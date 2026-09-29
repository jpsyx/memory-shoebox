# Step 4b: Sign in and my account

**Status:** done
**Parallel with:** 4a
**Depends on:** steps 3a and 3b

Everything in Scope is implemented. Six of the seven checks in Verification
pass, and the seventh cannot be run here.

**What was verified.** `pnpm check` is green and `pnpm test:e2e` passes:
fifteen browser-driven tests against one Fastify process serving both the API
and the built app, described in `docs/e2e.md`. Every state of both surfaces was
compared against its prototype URL at 1280px and 400px **and in both colour
schemes**, which found one real defect (below). The `unknown` and `sent` states
are one state rather than two, which is a stronger answer than the identical
copy the check asked for. Keyboard-only sign-in, name correction, switch and
device sign-out are end-to-end tests rather than a hand check, as is 200% zoom
on both surfaces, and so is signing a device out in one browser and watching
the other stop working on its next request.

**The check in both colour schemes found a defect that a width check could
not.** A field's description used `--on-panel-quiet`, the quiet ink for text on
the panel, while a field always sits on a print sheet. In Day the panel is
light and the mix landed dark enough to read; in Night the panel is deep blue,
so the mix resolved to a mid grey and the two hints on My account fell to
3.06:1 against the sheet, under AA's 4.5:1. `apps/web` now uses
`--on-print-quiet`, which reads 4.72:1 in Day and 5.33:1 in Night. No other
text or control on either surface fails AA in either scheme at either width.
`prototypes/` carries the same line and was left alone: its `index.html` pins
`data-rendition="day"`, so nobody looking at a mockup can reach the state where
it is wrong.

**What was not verified, and why.** The whole "Arriving for the first time"
flow against a **real inbox**. There is still no `RESEND_API_KEY` and no
verified sending domain, which is the same blocker step 3a recorded rather than
waited for. Everything up to the provider was run by hand at phone width and
does work: a permalink opened signed out redirects to
`/sign-in?redirect=%2Fitems%2Fabc`; typing the address mints a peppered code
with three attempts and a ten-minute life; the message is rendered by its
template and queued to the right recipient with the subject "Your code is
NNNNNN"; and typing those six digits signs in and lands on the item that was
linked. What remains untested is the provider alone: whether Resend accepts the
message we hand it and whether a real mailbox receives it. That is a question
about the sending domain rather than about these two surfaces, and it is worth
confirming once real credentials exist.

**Four defects worth passing on**, because each was found by review or by a
browser rather than by the unit tests this step wrote first:

1. The guard's query returned `undefined` when nobody was signed in, and
   TanStack Query rejects `undefined` data, so every guarded route reached
   while signed out showed an error instead of redirecting. Three test files
   went on passing, because the rejection happens only when the query runs
   through a query client.
2. A double-click on "Send another" minted twice, and the second mint
   invalidated the code already in somebody's inbox.
3. The sign-out buttons in the device list all announced the same name to a
   screen reader, so the list read as several identical controls.
4. Two writes to `PATCH /api/me` could revert each other, because each answer
   carries its own snapshot of the fields it did not change and both were
   written straight into the cache.

The pattern is the point: a unit test proves the branch it was written for, and
none of these four is a branch.

## What this step delivers

The first two surfaces anybody meets, built against a server that already
works. Surface 1 is first contact for the least technical person in the circle
and the only surface where failure means no access at all. Surface 9 is where
somebody turns off the emails they do not want without turning off the ones
that bring them back, and where they sign a lost phone out.

**Done when:** a person who has never seen this instance can open a link, type
their address, receive a code, type it, and land on the archive; and can then
correct their name, change a notification switch, and sign another device out
and watch it stop working.

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
   and **run the prototypes**. Every state you have to build is a URL. Ask the
   user only what the documents and the running mockups genuinely do not settle.
2. **Write the step design** at
   `docs/superpowers/specs/YYYY-MM-DD-sign-in-and-account-design.md`.
3. **`superpowers:writing-plans`** for the detailed implementation plan.
4. **`superpowers:subagent-driven-development`** to implement it.

## Read these first

| Document                                                             | What you need from it                                                                                                       |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `docs/prds/2026-09-27-memory-shoebox/design-spec.md`                 | Surfaces 1 and 9, every state, and the "Arriving for the first time" flow **including where it fails**                      |
| `prototypes/` surfaces `sign-in` and `account`                       | `pnpm dev:prototypes`, then `/s/sign-in?state=link` and the rest. Build from these, not from a description of them          |
| `docs/prds/2026-09-27-memory-shoebox/tech-specs/apis/auth.md`        | Every route you call, its request, its response, its errors, and its `## Rulings`                                           |
| `docs/prds/2026-09-27-memory-shoebox/tech-specs/apis/conventions.md` | § Errors, so a `401 sign_in_code_invalid` with `details.attemptsRemaining` becomes the right copy rather than a raw message |
| `DESIGN.md`                                                          | The visual system. Surface 1 is one of the five that settled it                                                             |
| `docs/PRODUCT.md`                                                    | § Users, on who the least technical viewer is. § Accessibility & Inclusion. § Product principle 2: a link is an address     |
| `docs/rules/routing.md`, `docs/rules/styling.md`                     | Binding house style                                                                                                         |

## Scope

**In:**

- Surface 1, every state: `link`, `email`, `sent`, `unknown`, `wrong`,
  `expired`, `resent`. `unknown` must be **indistinguishable** from `sent`, in
  copy and in layout, because the form must not be usable to find out who is a
  member
- The countdown from three tries, and the automatic resend when they run out,
  which the copy promises and step 3a's `410` delivers
- Deep entry: a permalink opened by somebody not signed in lands here and
  returns them to where they were going afterwards. Viewers usually arrive by
  opening a URL somebody texted them, so this is the normal case
- Surface 9, every state: the address that can never be changed, the name that
  can be corrected, the four notification switches and turn-them-all-off, the
  device list with last-used, signing another device out, and signing out the
  one you are on
- The five admin doors on surface 9, shown by role, linking to routes step 3b
  stubbed. They are here rather than on everybody's top bar
- The one-time line after a first sign-in, whose number comes from step 4a's
  timeline response and never from a seed

**Out, and owned by a later step:**

- The timeline the sign-in lands on. A placeholder is fine (step 5b)
- Every admin surface behind those five doors (steps 8b and 9)
- Any change to `apps/server` (step 3a owns these routes and is finished)

## Interfaces this step produces

- The session-aware route guard, used by every later frontend step
- The signed-in shell with its real member, role and resolved settings

## Interfaces this step consumes

From step 3a: every route in `auth.md`, plus `GET /api/public-settings`.
From step 3b: the theme, the system components, `apiFetch`, the router.

## Do not ask the user about

| Topic                                        | Owned by             |
| -------------------------------------------- | -------------------- |
| The timeline, filters, the directories       | step 5b              |
| One photo, one video                         | step 6b              |
| Uploading                                    | step 7b              |
| Milestones, removals                         | step 8b              |
| Members, groups, settings, presence, the log | step 9               |
| Anything in `apps/server`                    | its own backend step |

## Verification

- `pnpm check` green
- The whole "Arriving for the first time" flow, by hand, against a real inbox,
  on a phone-width viewport
- Every state compared against its prototype URL at 1280px and 400px, in both
  colour schemes
- A test that the `unknown` and `sent` states render identical copy. A
  screenshot comparison is the honest test here
- Keyboard-only: sign in, correct a name, toggle a switch, sign a device out
- 200% zoom on both surfaces with no horizontal scrolling and nothing clipped
- Sign a device out in one browser and confirm the other stops working on its
  next request, which is the promise the copy makes
