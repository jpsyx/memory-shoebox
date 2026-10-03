# End-to-end tests (`e2e/`)

Seventy-nine Playwright tests that drive a real browser against a real Fastify
process, one of them parked behind a route that has not merged yet. They are the layer above `pnpm test`: Vitest renders a component
against a mocked `apiFetch`, and there is a class of promise this product
makes that no mock can check. That a cookie survives a reload. That a device
signed out in one browser stops working in another on its next request. That a
six-digit code the server actually minted, in a message it actually rendered,
gets somebody in. That a colour written as a mix of four inks is still legible
once a browser has resolved it.

`e2e/signIn.spec.ts` covers surface 1, `e2e/account/` covers surface 9,
`e2e/empty.spec.ts` covers surface 5, `e2e/pile.spec.ts` covers surface 2,
`e2e/filter.spec.ts` covers surface 6, `e2e/people.spec.ts` covers surface 7,
`e2e/item/` covers surfaces 3 and 4, `e2e/scroll.spec.ts` measures the pile's
scroll, `e2e/seenLatch.spec.ts` covers the pile's seen latch,
`e2e/contrast.spec.ts` covers surfaces 1 and 9 against WCAG AA, and
`e2e/support/` holds the modules they share and the contrast sweep's own
self-test.

Surface 9 is a directory rather than a file because its one spec had grown
past the length this repository treats as a monolith. It is now
`account.spec.ts` for the name, the switches, the doors and the devices,
`account.keyboard.spec.ts` for the keyboard-only cases, and
`account.responsive.spec.ts` for the two widths, over a shared
`account.fixtures.ts` that carries the suite's docstring and its sign-in.

## How to run it

```sh
pnpm exec playwright install chromium   # once per machine
pnpm test:e2e
```

**It is not part of `pnpm check`**, deliberately. It needs a browser binary
that a fresh clone does not have and a free port that a shared machine may not
have, and it builds the web app before it starts. `pnpm check` has to be
runnable by anybody who has just cloned the repository; this is run
deliberately, before a step is called done.

## The topology it runs in

**One Fastify process serves both the API and the built web app**, on one
origin, which is exactly how this deploys (see
[architecture.md](architecture.md)). Nothing is proxied and nothing is
stubbed, so the static-serving path is exercised rather than assumed and there
is no CORS configuration to get wrong in a test that production would not
have. The cost is a `pnpm build` before the run.

`e2e/support/e2eEnvironment.ts` is the one place that shape is written: the
port (8099, away from `pnpm dev`'s 8080 so a running dev server is not in the
way), the catalog the run owns, and the environment the server under test
starts in. Every path in it is absolute, because Playwright runs the specs
from the repository root while the server starts in `apps/server`, and a
relative `DATABASE_PATH` would name two different files.

**One worker, and not for speed.** There is one SQLite catalog and the specs
sign devices in and out of members inside it. Two workers would be two runs
fighting over the same device list.

## Why the run leaves mail unconfigured

A test has to read a sign-in code, and the only honest place to read one from
is where the product put it.

`E2E_SERVER_ENVIRONMENT` sets `RESEND_API_KEY` and `ENABLE_FAKE_EMAIL` to the
empty string. With no sender configured the mail worker defers every message
back to `queued` **without scrubbing it**, so the six digits stay in
`outbound_emails.payload_json` and `readSignInCode` can select them. Configure
a sender and the row reaches `sent`, `makeScrubPatchFromKind` wipes both the
payload and the subject, and that helper fails loudly and correctly rather
than reading a stale code.

Both variables are named and emptied rather than merely left out: a key
exported in a developer's shell would otherwise send real mail and scrub the
digits. The Upstash pair is emptied for the same reason, so an inherited
credential cannot put this run's rate-limit counters in somebody's shared
Redis.

This is also why the helper reads the database directly rather than through a
route. There is no route that creates a member (that is step 8a) and there
must never be one that reads a sign-in code.

## The catalog lock

Every run starts by deleting last run's catalog, so a specification cannot
depend on yesterday. `e2e/support/deleteE2eCatalog.ts` does it as the **first
link of the web server command**, not in a Playwright `globalSetup`:
Playwright starts `webServer` and waits for it to answer before `globalSetup`
runs, so a deletion there would unlink the file under a server that already
had it open. The server would go on writing to the unlinked inode while the
specs read a fresh empty file at the same path.

Before deleting anything it takes a lock file beside the catalog, recording
the pid of the shell the run was spawned on. A second run started over a live
one is refused with a message rather than quietly corrupting both. A crashed
run leaves a lock whose pid is dead, and the next run recognises that and
takes it anyway, so nobody has to know the file exists; a half-hour maximum
age covers the remaining case of a pid the operating system has reissued.
`globalTeardown` gives the lock back, which is tidiness rather than
correctness.

## The per-IP mint budget

`signInCodeRequestPerIp` allows twenty sign-in codes an hour. **The whole
suite shares that one bucket**, because every request in a run comes from
`127.0.0.1`, while the per-address caps are spent two at a time by specs that
each own their own address.

`e2e/support/signIn.ts` counts the run's mints against the rule the server
actually applies, read from `RATE_LIMIT_RULES` rather than copied into a
comment, and throws at the mint that would exceed it. Without that guard the
budget was enforced by prose: the total was right, but only because somebody
had added it up by hand across two files. A sign-in added anywhere would spend
the budget and surface as a bare `toBeVisible` timeout on the code field, in
whichever spec ran next, with the real cause visible only in the trace.

The count is a floor rather than a mirror, since a worker replaced mid-run
starts from zero while the server's bucket does not. Under-counting costs
nothing that was not already being paid: it lands the failure back on the
`429`.

**Every way a test asks for a code goes through that file**, including the
keyboard-only one. A helper that reached past the driver to mint its own code
put the guard one behind the server, which is exactly the failure it exists to
prevent.

**The run spends 17 of the 20, which is exactly what the guard counts.** Only
`POST /api/auth/sign-in-codes` and its resend twin carry
`signInCodeRequestPerIp` (`apps/server/src/routes/auth.ts`), and every request
to either one goes through `support/signIn.ts`. Three are left. Step 6b's
twenty tests in `e2e/item/` spent none of them, because every one takes the
shared admin, so those three are still the headroom the next frontend step has
to work in.

**A spec that needs a session asks `e2e/support/signedIn.ts` for one.** It
exports `test` with two extra fixtures, `adminPage` and `viewerPage`, each a
page in a fresh context carrying a session signed in through surface 1 once
for the whole run and cached by address. It is what took the budget from 18 to
17 while five new spec files were arriving rather than the other way about:
thirty tests across surfaces 2, 5, 6 and 7 and the scroll measurement, the
four signed-in sweeps in `contrast.spec.ts`, the two widths in
`account.responsive.spec.ts` and two of the three keyboard cases cost two
codes between them, one for the admin and one for the viewer.

**A test that ends the session it is given cannot use those fixtures**, and
that is not a detail. Both hand out one server-side session row per address,
reached from a fresh context each time, so a test signing out on one page
signs out every later page in the run. The keyboard sign-out case in
`account.keyboard.spec.ts` therefore still owns an address and mints its own
code, and the same reasoning applies to every device test in
`account.spec.ts`.

**Do not read that number off `outbound_emails`.** The row count is close to
it and agrees only by coincidence, because two differences cancel: a request for a
stranger's address spends the budget and mints no email, and the automatic
resend after three wrong codes mints an email without a request. That resend
happens inside `POST /api/auth/session`, which carries `sessionCreatePerAddress`
and not the per-IP rule, so it costs the budget nothing. A spec that adds
sign-ins should count its own calls into this file, which is the number the
guard throws with.

## The archive, and why one spec runs before the others

There is one catalog and one server for a run, so the archive is either seeded
or it is not. Surface 5 needs it empty and surfaces 2, 3, 4, 6 and 7 need it
full.

`e2e/support/archive.ts` writes the development archive into the run's catalog,
and the specs that need data call it in a `beforeAll`. Each call replaces what
the last one wrote, so a photograph deleted or moved to another day in one file
is back where it was for the next. `empty.spec.ts` does not seed, and asserts
the catalog is empty before it starts. Files run alphabetically under one
worker, so `empty` precedes `filter`, `item/`, `people`, `pile`, `scroll` and
`seenLatch`; that assertion is what turns a change to the ordering into a named
failure in the spec that depends on it.

**A spec that seeds must sort after `empty.spec.ts`.** Surfaces 3 and 4 live
in `e2e/item/`, which sorts after it, seven files kept together. It is also why
their contrast sweep is `e2e/item/item.contrast.spec.ts` rather than more
cases in `contrast.spec.ts`, which sorts before `empty` and so cannot seed.

## Why the pile specs open a day by its address

`.pile` carries `content-visibility: auto`, so a day nowhere near the viewport
is not laid out at all and every element inside it has an empty box.
`toBeVisible` is a statement about a box, so a day has to be on screen for one
to mean anything. `pile.spec.ts` therefore opens the day it is about with
`?at=`, which is how the product itself puts a day on screen, rather than
scrolling past three hundred and forty prints to reach it.

The filter specs reach every chip through the sheet, which is a `section`
carrying `aria-label="Find something"` and therefore a `region` landmark. A
print's alt text is generated from who is in it, so `Abuela Rosa` names one
chip and thirteen photographs of her, and a page-wide locator is a strict mode
violation rather than a filter being pressed.

A chip whose narrowed count is nought is `aria-disabled="true"`, which is what
surface 6 intends and what `Chip.test.tsx` asserts, and it is also something
Playwright will not click. The dead end is therefore reached with a tag and a
stretch of time it has nothing in, rather than with two tags that exclude each
other.

Objects are not uploaded. The run's B2 credentials are placeholders, so every
image fails to load and nothing in the suite minds: the specs read the DOM, the
counts and the labels, and the contrast sweep measures text.

## The contrast sweep

Fifteen tests across three files. `e2e/contrast.spec.ts` checks surfaces 1 and
9 in both colour schemes at both widths: eight tests, four views of surface 1
and one of surface 9 in each. `e2e/item/item.contrast.spec.ts` checks surfaces
3 and 4 the same way in four tests, each sweeping three views: a photograph
with every sheet its own uploader gets, the same photograph with two editors
open (who can see it, and the date), and a video.
`e2e/support/contrast.selftest.spec.ts` holds the sweep's own rule to account
in three more, below.

**It is here rather than in Vitest because it cannot be anywhere else.** Every
colour in this design system is a `color-mix` in oklab of four inks, and jsdom
computes neither `color-mix` nor `prefers-color-scheme`, so a unit test of the
same component reads back an unresolved custom property and proves nothing.
`support/contrast.ts` measures every element carrying its own text against
everything painted behind it, composited into one colour, resolving every
colour through a 1x1 canvas, which is the one thing in a browser that turns
any valid colour into sRGB bytes.

**It asserts a property and not a picture.** There is no baseline and nothing
to approve: the claim is that every word meets AA, which survives a copy
change, a reordered sheet and a new section. A failure names the words on
screen, both colours as painted, the ratio and the threshold it missed, so a
reader of CI output knows what broke without reproducing it.

**Both colours are composited, not read off.** A foreground with an alpha below
1 is a blend with whatever is behind it, and `opacity` on any ancestor fades a
whole subtree, which is the usual way a hint or a disabled control is dimmed.
Each layer is therefore laid over the last at its own alpha times every
`opacity` above it, and the text at the product of the two. Nothing in the
theme exercises either path today (disabled controls are pinned to `opacity: 1`
and no ink is translucent), which is the point: measuring at full strength
would have passed the first `rgba()` hint anybody wrote and failed it on
screen.

**A layer behind the text is not always an ancestor of it.** A segmented
control draws its chosen segment as an indicator positioned under the label,
a sibling of the label's own wrapper, so an ancestor walk alone measured the
chosen label's light ink against the pale track and reported 1.13:1 for words
printed on dark ink. Wherever the walk passes a positioned element, it
composites first the absolutely positioned siblings with a z-index of 0 or
more that paint beneath it (a lower z-index, or the same one earlier in the
document) and whose box contains the text's whole box. Everything else is
left out, because a layer left out can only cost a false failure: a negative
z-index can paint under the shared parent's own background, a layer behind
only the middle of a label leaves its ends on the ground, and a sibling
painted above covers the text rather than backing it.
`e2e/support/contrast.selftest.spec.ts` checks the rule on pages written for
it rather than against the product: one case it must credit (the segmented
control's indicator) and the first two it must not, because getting either
wrong is a sweep that passes words nobody can read. It needs no sign-in and no
seed, since every page is set from a string.

**It measures text, and only text.** Non-text contrast (WCAG 1.4.11) is not
covered by anything here: a switch track, a button border, an input outline and
a focus ring all go unmeasured, because the sweep looks at elements carrying
their own words and compares `color` against what is behind them. A surface
that passes this has legible words, which is not the same as a surface that
passes AA.

What it guards is a real and repeatable mistake. A field's description used
the quiet ink for text on the panel while a field always sits on a print
sheet; in Day both mixes land dark enough and the error is invisible, and in
Night the panel is the dark ink, so the mix resolved to a mid grey and two
hints on My account read 3.06:1. Neither a width check nor a check in one
scheme could see it. The item sweep caught the same ratio from another cause:
the capture date's time field was the one input the theme had not adapted, so
it drew Mantine's own dimmed description, which read 3.06:1 on the print sheet
in Night until `TimeInput` was themed like every other field.

**It sweeps with the pointer parked.** A press leaves the pointer wherever the
control was, and whether whatever is drawn there next is painted hovered
depends on when Chromium next looks at a pointer that has not moved. The item
sweep moves it to the top-left corner before every measurement, because a sweep
should measure the page rather than where a click happened. `signIn.spec.ts`
does the same before each of its twin photographs of a member's and a
stranger's answer, which are compared byte for byte: once the item specs ran
ahead of it, the two photographs differed by a hover.

**It costs no sign-in codes at all.** Surface 9 needs a session and surface 1
does not, and the eight signed-in sweeps (four in each file) take the run's
shared admin from `support/signedIn.ts` through the `adminPage` fixture. The
one refusal state it sweeps is reached by spending digits against an address
with no live code, which is answered `410 sign_in_code_expired` and costs a
redemption rather than a mint.

**It emulates reduced motion, which is a correctness measure and not a
courtesy.** `.buttonRoot` carries `transition: background 150ms`, so the submit
button spends a tenth of a second part way between the ink it had and the ink
it is going to, and a sweep landing in that window measures a blend of the two:
the refusal state read 2.86:1 on a button half way back from disabled.
`global.css` answers `prefers-reduced-motion: reduce` by cutting every
transition to nothing, so asking for it is the same page with the tweening
taken out rather than a wait dressed up as a setting.

## Surfaces 3 and 4

`e2e/item/` opens prints from the pile and drives every write through the real
routes, against `step-6b.md` § Verification:

- `item.photo.spec.ts` opens the first frame of the forty-five-frame burst from
  its fanned stack, finds "Frame 1 of 45" and a strip of forty-five links with
  the open one marked current, moves along it and leaves by Back for the day
  it came from, and reacts and comments, both still there after a reload.
- `item.video.spec.ts` pins a comment at 0:04 of the ten-second seeded clip
  and finds its mark on the scrubber.
- `item.uploader.spec.ts` tags a photograph and finds the tag as a link,
  changes who can see it to the admin alone and back to everyone, puts a date
  right and watches the way back follow it to the new day, and deletes one and
  finds "not here" at its address.
- `item.latch.spec.ts` reads `item_views` back from the catalog. After one
  frame of the burst is opened, exactly one row has `first_opened_at`, with an
  `open_count` of one, and forty-four have `first_seen_at` alone. It reaches
  the frame through the pile once, clears the rows that wrote, and reloads the
  permalink on its own, so the pile's own latch cannot muddy the count.
- `item.keyboard.spec.ts` does all of it without a mouse, on a photograph and
  a video: open a frame from the fan, move along the strip with the arrows,
  react, comment, and pin a comment to a moment. It is also where the
  reactions picker's focus trap is proved. The picker is portalled to the end
  of the page, and Shift+Tab from its first choice has to stay inside it
  rather than escape to the page, which jsdom cannot show.
- `item.responsive.spec.ts` draws a photograph and a video at 640px, which is
  200% zoom of the design width, and at 400px, with no sideways scroll. That
  nothing is clipped is checked by eye, because no property of the DOM says it.
- `item.contrast.spec.ts` is the sweep described above.

**Nothing loads in this run** (§ Why the pile specs open a day by its
address), so the transport is measured with no media at all, which is exactly
the case its duration-from-the-contract rule is for: the slider reads "0:00 of
0:10" and a mark lands at 0:04 although the element never learned how long the
clip is.

**The shared admin's name is read from the page, never written into a spec.**
Every item spec signs in as the run's shared admin, who uploaded every seeded
item, and `account.keyboard.spec.ts` renames that admin earlier in a full run.
So the visibility test reads the uploader's name off the line under the frame
and picks that name in the picker. A name written into the spec passes when
the file runs alone and fails in the full suite.

**One case is parked.** The picker offering the Shoebox's members and groups is
`fixme` until step 8a builds `GET /api/members` and `GET /api/groups`. The
clients are already written against `administration.md`, so turning it on,
and checking their schemas against the routes 8a really builds, should be all
it needs.

## What the specs may and may not do

Nothing in `e2e/support/signIn.ts` posts to the API. A helper that
short-circuited the form by calling `POST /api/auth/session` itself would hand
the account tests a session the product did not make, and what those tests are
for is proving that a session the product made actually works. `signInAs`
hands nothing back either, so the next spec wanting a shortcut does not find a
credential here; the one test that needs the digits it spent reads them from
`readSignInCode`.

`trace: "retain-on-failure"` and `screenshot: "only-on-failure"` cost nothing
on a passing run, because Playwright throws away what it recorded for a test
that passed.
