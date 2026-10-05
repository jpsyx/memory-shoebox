# End-to-end tests (`e2e/`)

Playwright tests drive real browsers against a real Fastify process. One item
picker case remains parked pending browser coverage. The older engine
cases skip where Google Chrome is unavailable; the routed surface cases require
the configured browser. They are the layer above `pnpm test`:
Vitest renders a component
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
`e2e/upload/__tests__/upload.spec.ts` drives the upload engine in Chrome and
WebKit after `e2e/upload.setup.ts` signs its uploader in.
`e2e/upload-surface/` exercises the actual `/upload` route in those two projects. `e2e/support/` holds the modules they share and the contrast sweep's own
self-test.

Surface 9 is a directory rather than a file because its one spec had grown
past the length this repository treats as a monolith. It is now
`account.spec.ts` for the name, the switches, the doors and the devices,
`account.keyboard.spec.ts` for the keyboard-only cases, and
`account.responsive.spec.ts` for the two widths, over a shared
`account.fixtures.ts` that carries the suite's docstring and its sign-in.

## How to run it

```sh
pnpm exec playwright install chromium webkit   # once per machine
pnpm test:e2e
```

The upload specs also want Google Chrome itself, installed where Chrome
installs: Playwright's `chrome` channel finds it there. Older engine cases skip
with a message if it is absent; the routed surface cases require the browser.
`pnpm exec playwright test --project=upload-webkit` runs one browser's upload specs, and
still runs `chromium` and `upload-setup` first, because it depends on them.

**It is not part of `pnpm check`**, deliberately. It needs a browser binary
that a fresh clone does not have and a free port that a shared machine may not
have, and it builds the web app before it starts. `pnpm check` has to be
runnable by anybody who has just cloned the repository; this is run
deliberately, before a step is called done.

## The topology it runs in

**One Fastify process serves both the API and the built web app**, on one
origin, which is exactly how this deploys (see
[architecture.md](architecture.md)). Nothing is proxied. Real upload and recovery cases use the actual API;
identified client-contract and visual cases fulfill controlled responses, so the static-serving path is exercised rather than assumed and there
is no CORS configuration on it to get wrong in a test that production would
not have. The cost is a `pnpm build` before the run. **The one stand-in is the
bucket**: see § The upload spec.

`e2e/support/e2eEnvironment.constants.ts` is the one place that shape is written: the
port (8099, away from `pnpm dev`'s 8080 so a running dev server is not in the
way), the catalog the run owns, and the environment the server under test
starts in. Every path in it is absolute, because Playwright runs the specs
from the repository root while the server starts in `apps/server`, and a
relative `DATABASE_PATH` would name two different files. It also names the
bucket stand-in's address, `127.0.0.1:9099`, which `B2_ENDPOINT` points at;
`WEB_DIST_PATH`, which points the server at the end-to-end build in
`apps/web/dist-e2e`; and `E2E_BUILD_ENVIRONMENT`, which asks the web build for
the upload harness.

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

**The static expected full-suite budget is 20 of 20 sign-in codes, with no
spare capacity.** This adds two cached Step 8b actors to the documented existing
18; Task 7 ran focused and impacted commands, not an unfiltered full-suite mint
count. Only
`POST /api/auth/sign-in-codes` and its resend twin carry
`signInCodeRequestPerIp` (`apps/server/src/routes/auth.ts`), and every request
to either one goes through `support/signIn.ts`. The eighteenth is
`upload.setup.ts`, which signs the uploader in once for both upload projects:
a sign-in in each would have cost two. Step 8b spends the remaining two on one
cached asker and one cached uploader; its admin reuses the existing fixture.
Step 6b's twenty tests in `e2e/item/` spend none of them: every one takes the
shared admin.

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

The archive's objects are not uploaded. The run's bucket is the local
stand-in, which holds only what the upload spec puts there, so every seeded
image is a 404 and fails to load, and nothing in the suite minds: the specs
read the DOM, the counts and the labels, and the contrast sweep measures text.

## The contrast sweep

Fifteen tests across three files. `e2e/contrast.spec.ts` checks surfaces 1 and
9 in both colour schemes at both widths: eight tests, four views of surface 1
and one of surface 9 in each. `e2e/item/item.contrast.spec.ts` checks surfaces
3 and 4 the same way in four tests, each sweeping three views: a photograph
with every sheet its own uploader gets, the same photograph with two editors
open (who can see it, and the date), and a video.
`e2e/support/getContrastFailuresFromPage/getContrastFailuresFromPage.selftest.spec.ts`
holds the sweep's own rule to account in three more, below.

**It is here rather than in Vitest because it cannot be anywhere else.** Every
colour in this design system is a `color-mix` in oklab of four inks, and jsdom
computes neither `color-mix` nor `prefers-color-scheme`, so a unit test of the
same component reads back an unresolved custom property and proves nothing.
`support/getContrastFailuresFromPage/` measures every element carrying its own
text against
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
The self-test beside it checks the rule on pages written for it rather than
against the product: one case it must credit (the segmented
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

**The item sweep parks the pointer first; `contrast.spec.ts` does not.** A
press leaves the pointer wherever the control was, and whether whatever is
drawn there next is painted hovered depends on when Chromium next looks at a
pointer that has not moved. Two places park it in the top-left corner:
`item.contrast.spec.ts` before every measurement, because a sweep should
measure the page rather than where a click happened, and `signIn.spec.ts`
before each of its twin photographs of a member's and a stranger's answer,
which are compared byte for byte: once the item specs ran ahead of it, the two
photographs differed by a hover.

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
routes, against `step-6b.md` § Verification. The three ways in that the specs
share (the burst's first frame, one day's first photograph, the seeded video)
are in `e2e/support/itemHelpers.ts`:

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
  a video, one claim per test: the arrows move along the strip and keep its
  focus, Shift+Tab stays inside the reactions picker, focus is back in the
  composer's field once a comment lands, and a comment can be pinned to a
  moment. It is also where the reactions picker's focus trap is proved. The picker is portalled to the end
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
clients are already written against `administration.md`. 8a is server-only, so
once it has merged, the next frontend step that touches the picker checks
their schemas against 8a's real routes and turns the case on.

## The upload spec

`e2e/upload/__tests__/upload.spec.ts` is the step 6a design's Verification 13. Its first test
sends a rotated JPEG, a rotated HEIC, a forwarded JPEG with no metadata, an
H.264 and an HEVC clip, a file large enough to go multipart, and a PDF to
refuse, through to a settled batch with its items on their days. Its second
closes a tab mid-transfer and reopens to the same batch, with its edit plan
intact, sending only what is missing. Its third picks one photograph twice
under two names: presign cancels the copy, which sends nothing and is the
transition that settles the batch. All three assert against what the product
wrote, which is the catalog, the outbound mail and the bucket's request log,
and read the harness's own record only for what only the browser knows: the
order of the engine's events and which completion settled the batch.

**Four projects, in order.** `chromium` runs every other spec. `upload-setup`
depends on it, which is what puts every upload after `empty.spec.ts`, and
signs the uploader in once for both browsers. `upload-chrome` runs the spec in
the installed Google Chrome, because Playwright's bundled Chromium decodes no
HEVC, which is what a phone records, and skips with a message where Chrome is
not installed. `upload-webkit` runs it in Playwright's WebKit.

**WebKit cannot hold the session cookie, so it is handed one.** Playwright's
WebKit neither stores nor sends a `Secure` cookie over `http://localhost`, and
the session cookie is `Secure` unconditionally
(`apps/server/src/auth/sessionCookie.ts`). That was measured: such a cookie
reaches neither a WebKit page nor its `context.request`. So the setup project
signs in through surface 1 in Chromium and saves the state under
`test-results/`, and `getUploaderStorageState` gives WebKit the same cookie
without the attribute. The server reads the cookie's value and nothing else,
and production is HTTPS.

**The harness is in this build and in no other.** The run serves the built
app, and `upload-proof.html` is a development page, so `E2E_BUILD_ENVIRONMENT`
sets `WEB_BUILD_UPLOAD_PROOF=true` for the build half of the web server
command, and `apps/web/vite.config.ts` then adds the page as a second entry
and writes the build to `apps/web/dist-e2e` rather than `dist`. `dist`
therefore never holds the harness, so a `pnpm start` after a run serves none.
The spec drives the engine through the page and reads `window.__uploadProof`.
`pnpm build`, the Dockerfile and `fly deploy` never set the variable, and a
build without it that reaches the harness fails.

**The bucket is a stand-in**, `e2e/support/createFakeS3Server/`, started as a second
`webServer` on `127.0.0.1:9099`. It answers the S3 calls the upload flow
makes, path-style, and checks no signature; anything else is a `501`, so a
new call fails loudly rather than passing against a fake that guessed. It
does check what Backblaze would refuse and a signature cannot see: parts out
of order, an ETag that names no part, a part under 5 MiB that is not the
last, and a CORS request outside the rule `pnpm b2:cors` writes, which it
builds with the same function rather than a copy. Its log at
`/__fake-s3/requests` records each request with its response's status, which
is how the spec proves the large file went up in parts and was joined, and
that nothing that had landed was sent again. Its own Vitest tests post the
exact `CompleteMultipartUpload` body `@aws-sdk/client-s3` sends, captured from
the SDK, entities and element order included.

**The fixtures are generated, never photographs.** `e2e/fixtures/upload/` is
three pictures drawn by ImageMagick, the HEIC encoded by macOS's own `sips`,
two clips of FFmpeg's test pattern, and a PDF, written by
`makeUploadFixtures/makeUploadFixtures.ts` on a Mac and committed through the one deliberate
`.gitignore` exception for them. The multipart file is too big to commit, so
the spec writes it at run time: the H.264 clip padded with a `free` box, which
every MP4 reader skips, to half a part past the 32 MiB threshold, so it goes
up in three parts and is still a playable video with a poster to draw.

**The resume holds the third completion.** At one transfer at a time, the
spec lets two `complete` calls through, holds the third, and aborts it as it
closes the tab. That is what a tab closed at that moment leaves: the third
file's bytes in the bucket, its row `sending`, and the server never told. It
is aborted rather than left open because WebKit was measured delivering a
request held open across `page.close()`. The reopened tab picks all five
again: the two that landed match by hash as `already_done`, each of their
originals reached the bucket exactly once, and no request made after the
resume began names either of them, so nothing that had landed is presigned or
sent again.

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

## The routed Upload surface

`e2e/upload-surface/` drives `/upload`, its native input, ordinary bulk forms,
visibility control and router links. It never drives `upload-proof.html` or a
product debug global. A fresh uploader context and batch cleanup isolate each
case while keeping the existing setup dependency, catalog lock and one worker.

Rendered tests that combine the upload UI with its real session controller live
in `apps/web/src/Upload*.integration.test.tsx`, their shared source boundary.
Provider lifetime tests live in `apps/web/src/upload/`. Component-only tests stay
beside the component, with split suites under that component's `__tests__/`.
The label and occasion render helpers shared by these suites live in
`apps/web/src/testing/`. Test names describe the asserted outcome, and the
snapshot suite exercises production reducers rather than fixture-only lookups.

The large batch declares 264 distinct valid mixed originals and a refused PDF,
applies a tag and person through the UI, leaves Everyone untouched and sends all
accepted files independently of ticks. Assertions read the catalog, eligible
recipient outbox rows and fake-S3 log. Completion drives progress and one final
whole-session refresh, with no per-file detail polling. Runtime fixtures insert
JPEG COM segments or ISO BMFF `free` boxes while retaining capture headers. A new
nonce per invocation prevents later cases from accidentally testing deduplication.
Co-named Vitest tests check uniqueness and unchanged parsed capture metadata.

Recovery closes the real tab after two completions, verifies saved edits and
visibility plus the complete missing list, and re-picks the whole batch. Landed
file ids must never appear in later bucket requests. Separate cases distinguish
failed PUTs from refused picks, prove settled retries leave the outbox unchanged,
and abort completion requests through the normal retry budget: bytes in storage
remain unconfirmed until the server answers. Router navigation during sending
and sign-in returning to an addressed draft exercise the signed-in provider.
For WebKit's localhost-only Secure-cookie limitation, the reauthentication case
removes Secure from the intercepted actual sign-in response; production is HTTPS.

`upload.contract.spec.ts` labels milestone list/create/patch and full member/group
responses as client-contract coverage. Inline creation, attachment retry, widening
and restrictive visibility parsing/order are covered. Step 7a's milestone routes
are now merged, but these controlled-response cases do not prove their live
integration. Live Upload acceptance remains pending for `GET/POST /api/milestones`
and `PATCH /api/milestones/:milestoneId`; the full `GET /api/members` and
`GET /api/groups` directories still await their backend owners.

The responsive matrix captures sixteen prototype states plus denied, unavailable
and server-owned undated fallback rows at 1280, 768 and 400px in Day/Night. States
come from user actions and validated controlled API detail, with no shipping state
parameter. Ignored `.playwright-mcp/` holds product/reference captures and logs.
Full-page captures retain below-fold groups;
additional viewport captures keep mobile dialogs and sticky selection controls
visible at the current interaction position.
Real ready thumbnails are ticked, scrolled away with genuine wheel input and
revisited with explicit viewport entry/exit checks in both schemes. WebKit
measured descendant `scrollIntoViewIfNeeded` stopping outside skipped day
content; genuine scrolling loads and reenters the ready image with product
containment unchanged. The ready cases cover both schemes,
including 640x450 as the layout-equivalent CSS viewport of 1280x900 at 200%.
This is viewport equivalence, not genuine browser zoom. A separate zoom suite
checks tag/person dialogs, occasion choice/create/date-fix forms, restricted
visibility, undated capture-date controls and done/partial actions in Day/Night
in both browser projects. Each visible enabled control receives focus and must
be fully reachable through actual wheel scrolling, with horizontal overflow and
ancestor clipping checked. The oracle includes textarea controls; the current
occasion blurb is a single-line input, whose typed value is also checked.
Reduced motion keeps counts and status words. Keyboard cases retain native file
choice, real tag/person writes, modal trapping, full typed-value assertions and
focus return. Identified client-contract paths choose and attach an occasion,
choose a valid restricted group through keys, and assert saved selection plus
exact edit/visibility/commit request order. These contract replies do not prove
live milestone or full-directory persistence.

The keyboard driver uses Option+Tab (and Option+Shift+Tab backwards) in macOS
WebKit, where ordinary Tab skips native buttons without the user's keyboard
navigation setting. This follows [WebKit's documented navigation behavior](https://bugs.webkit.org/show_bug.cgi?id=199671);
it changes no system setting and still reaches each control using keys.
Expired-auth recovery signs in through the real form. Its WebKit localhost-only
interception converts the real response's Secure cookie to `secure: false`,
including the cookie stored by `route.fetch`, using the existing upload setup
workaround. Production authentication is unchanged.

State actions wait for the addressed draft and enabled native controls. The
entire contrast sweep retries within the normal five-second assertion bound
while loading/saving settles. The established sweep checks active controls and
prose. Its raw
results include inactive controls, so surface tests exempt a reported selector
only when all matching text belongs to a genuinely disabled button/input/select/
textarea, including a label whose associated native control is disabled.
Each exclusion is logged. This narrow exception follows
[WCAG 2.2 SC 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html);
the shared sweep stays unchanged. Non-text focus-ring contrast still requires
visual inspection. Real-bucket phone media, an actual phone and an uncoached
uploader remain separate acceptance checks, never substituted by generated fixtures.

Upload surface verification recorded on 4 October 2026:

| Command                                              | Outcome                                                                                 |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `pnpm check`                                         | Passed: 377 files, 2,708 tests, with formatting/lint/types/build                        |
| `pnpm exec playwright test --project=upload-chrome`  | Passed: 109 tests, one existing item-directory fixme                                    |
| `pnpm exec playwright test --project=upload-webkit`  | Passed: 109 tests, one existing item-directory fixme                                    |
| Final affected Chrome (keyboard/auth/preview/matrix) | 96 passed, one keyboard failure, one existing fixme; all 15 other affected cases passed |
| Corrected final keyboard, Chrome and WebKit          | Passed: 83 tests including both keyboard cases, one existing dependency fixme           |

Project totals include Chromium and upload setup dependencies. Complete outputs,
failed diagnostic predecessors and final captures are retained under ignored
`.playwright-mcp/task-9-logs/` and `.playwright-mcp/task-9-artifacts/`. Final full
logs are `upload-chrome-verified.log` and `upload-webkit-complete.log`. Final
keyboard log is `keyboard-initial-focus-final.log`; the affected Chrome failure
is retained in `upload-chrome-affected-final.log`. The full WebKit pass preceded
the final readiness-only keyboard change, covered by the two-browser focused run.
The reduced-motion modal trace exposed transient React autoFocus before Mantine
initially focused Close. That historical test observed settled trap focus before
Tab, so it did not cover immediate typing. The final review fix removes the
competing React autofocus and marks the input for Mantine's initial focus.
`upload.interactions.spec.ts` now checks immediate full-token typing/insertion in
both tag and person dialogs, alongside route-away milestone target retention,
original-target attachment retry and distinguishable same-name/size recovery.
Recovery uses different red/blue originals and checks 400px Day/Night contrast,
clipping, incoming ordinal/metadata, bounded previews and safe skip. Chrome paints a
readable native calendar glyph in Day/Night; WebKit displays the native date
field and text without that glyph in either scheme.

Native date verification additionally measures screenshot pixels for enabled,
blurred empty placeholders and filled values, plus focused selected/unselected
segments in Day/Night in both browser projects. Digit-only crops exclude slash,
border, caret and calendar-glyph contamination. WebKit's native empty-field style
[lightens placeholder color in engine code](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/html/shadow/DateTimeFieldElement.cpp).
Upload-only segment text fill supplies existing print ink; selected segments use
inverse print colors for readable text. Disabled controls retain native styling.
After successful occasion attachment clears ticks, the original trigger becomes
disabled. On exit, a fallback focuses the Upload heading captured at opening only
when selection is empty, the heading remains connected and focus is lost after
modal removal. Cancellation retains the enabled trigger; deliberate focus and
navigation are preserved.

Final Chrome viewport sheets for all 19 states, paired reference/product lower
sections and all eight real-ready captures were regenerated and inspected after
the affected run. Final full-WebKit contextual and real-ready sheets were also
inspected, including the native date fields at full resolution.

Task 9 review fix verification, also on 4 October 2026:

| Focused command/coverage                                                    | Outcome                                                                                                             |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Fresh `pnpm check` after the production fixes                               | Passed: 377 test files, 2,711 tests; formatting/lint/types/build passed                                             |
| Owning occasion modal tests                                                 | 10 passed, including lost-focus fallback, preserved deliberate focus and detached heading                           |
| Both projects, amended keyboard/19-state matrices/640x450 forms/native date | 101 passed, two Chrome selected-color sampler failures, one existing dependency fixme                               |
| Both projects, corrected native date measurement                            | 85 passed, one existing dependency fixme; all 24 rendered-color samples passed                                      |
| Both projects, 640x450 real ready-image entry/tick/exit/reentry             | All four affected cases passed in the earlier corrected focused run (91 passed/four independent failures/one fixme) |

The amended run passed both full keyboard paths, all twelve ordinary state
matrices and all four zoom-equivalent form cases. It is not called an all-green
run: its two remaining sampler failures assumed selected ink was always light.
Chrome actually paints black text on a pale native highlight; corrected
extraction checks the actual highest-contrast glyph pixels against the dominant
digit-crop background. Final native samples are 4.722 Day/5.328 Night for blurred
and focused-unselected empty/filled dates in both engines. Selected samples pass
with native black-on-pale Chrome painting and inverse-print WebKit painting.
Exact logs are `review-amended-final.log`, `review-native-final.log`,
`review-accessibility-corrected.log`, `review-root-check-final.log` and
`review-occasion-unit-selection-final.log`
under `.playwright-mcp/task-9-logs/`. Earlier failed measurements and traces remain
retained. All 36 final 640x450 zoom captures were inspected in four sheets, along
with final native empty/filled selected/unselected/blurred control captures.

Remaining acceptance includes live milestone/full-directory routes,
at least 200 approved phone files against the real bucket, actual-phone recovery
and an uncoached uploader. These remain unchecked. Step 7b is implemented; acceptance pending.

The generated routed Upload media helper lives at
`e2e/support/makeUploadSurfaceFixturePaths/makeUploadSurfaceFixturePaths.ts`,
with its co-named test. Final review fix logs are retained under
`.playwright-mcp/final-fix-logs/`; the final-fix report records command chronology
and separates failed diagnostic runs from verified passing runs. Generated
fixtures remain local test evidence, never real-bucket or family acceptance.

Upload's real-wheel helper derives the current signed distance to full viewport
entry on every step, capped by the requested wheel magnitude. Layout shifts or
an overshoot cannot leave it scrolling away from its target. The 640x450 preview
regression deliberately wheels past the selected print to the heading, proves
the print is outside the viewport, then proves ready, selected reentry in both
themes and engines. The full-visibility assertion is unchanged.

Final review fixes were verified on the unchanged tree with `pnpm check`
(380 files, 2,724 tests, exit 0) and
`pnpm exec playwright test --project=upload-chrome --project=upload-webkit`
(157 passed, one existing skipped, exit 0). The browser total consists of 80
Chromium dependency cases, one Upload setup and 38 cases in each Upload browser
project, using one worker and shared dependencies once. Logs are
`check-wheel-verified.log` and `upload-browsers-verified.log` under
`.playwright-mcp/final-fix-logs/`. The preceding combined run remains recorded as
155 passed, two Chromium wheel-reentry failures, one skipped, exit 1; its
successful successor does not change that outcome. Actual-device, real-bucket
and human acceptance remain pending.

### Final re-review limits

The independent re-review of the final fix wave confirmed the three original
Important findings were addressed, then reproduced a new wrong-occasion retry:
failed attachment to occasion A followed by choosing B still writes A. It also
reproduced a multi-label retry that restores an already completed label after a
later label fails, allowing duplicate edit rows. These focused production-function
diagnostics failed even though the complete workspace/browser suites above passed;
the missing retry sequences required regression coverage and correction.
At that checkpoint, integration was not approved. Three comment-width violations
and missing saved-edit component keys also remained nonblocking debt. At that checkpoint the plan-owned ignored SDD workspace was preserved with the
review, reproduction and rulings; browser artifacts remain
under `.playwright-mcp/final-fix-logs/`. Live/manual acceptance remains pending.

### Task 10 retry corrections (4 October 2026)

Rendered form/controller regressions reproduce the wrong-occasion write and the
1,001-target, two-label failure sequence before the fixes. They verify that a
changed occasion writes its newly submitted id and current targets, while the
same occasion retains original targets and skips confirmed chunks. The label
regression confirms that completing a retained tail removes that name from the
form even when the next label fails; the final retry writes only the unresolved
label. Exact targets, four unique saved edits and confirmed Undo marker removal
are checked. Multiple saved rows and removing the first now produce no React
missing-key warning. The three reported comments meet the 80-column bound.

The focused owning suite passes 128 tests in 15 files. The actual `/upload`
client-contract retry cases in `upload.edit-retries.spec.ts` passed all 20 runs
(five repetitions per case in Chrome and WebKit), including observable saved-label
counts and Undo. These tests use schema-validated paged catalog replies and explicit
API rejection/confirmation contracts; they do not prove live milestone routes.
Existing interaction, contract and actual 264-file surface cases passed in both
browsers in the affected runs. The earlier complete 157-case browser evidence
above remains the coverage for unchanged engine, layout and recovery matrices.

The initial repeated retry/keyboard run reports 110 passed, one failed and one
existing dependency skip, exit 1. The unchanged Chrome keyboard case passed four
of its five repetitions, while WebKit passed all five. Its failure is the visible
focus-ring predicate on the Escape-restored milestone trigger, before attachment:
the preceding focus assertion passed, but the computed outline check failed. The
trace does not establish that focus remained on the trigger during the ring poll.
At that checkpoint this intermittent failure remained a review concern, with no
change to keyboard or focus behavior in the production-fix commit. The affected predecessor runs and test-fixture corrections are retained
honestly, including the initial wrong Undo mock URL and its corrected DELETE path.
Complete commands, outputs, exit codes and traces are under ignored
`.playwright-mcp/task-10-logs/`. At that checkpoint Task 10's scoped review
and integration approval remained pending. Real-bucket, physical-phone, uncoached and live API acceptance
remain unchecked.

### Task 10 keyboard readiness follow-up (4 October 2026)

The scoped production review approved all four corrections. The separate keyboard
diagnosis identified an opening-readiness gap: the failing trace sent Escape only
8.585ms after Enter, while the picker still had opacity 0. Both immediate and
settled diagnostic variants passed, so the diagnosis does not prove a root cause
or a rapid-Escape product fix. The recorded failed runs remain failed evidence.

The bounded test-only amendment waits for initial Close focus and dialog opacity 1
before Escape, then waits for the dialog to become hidden before checking the
restored trigger and reopening. Genuine keyboard inputs and the existing visible
ring predicate remain unchanged; no product focus or CSS behavior changed.
Using the full repository config and its one worker, five keyboard repetitions in
each browser passed: 91 passed, one existing dependency skip, exit 0. All ten
keyboard executions passed, with the prerequisite suite and uploader setup run
once for the command. This verifies the amended settled-picker interaction,
without proving the rapid-close lifecycle safe.

The subsequent final affected run passed both browser projects' retry,
interaction, contract, keyboard and normal actual 264-file surface cases:
109 passed, one existing dependency skip, exit 0. Its prerequisite suite and
uploader setup again ran once. No ring failure recurred in these bounded runs;
rapid-Escape behavior and the original intermittent failure's root cause remain
unproven. Exact commands and complete outputs are preserved in
`keyboard-readiness-repeat.log` and `browser-readiness-final.log` under
`.playwright-mcp/task-10-logs/`. The subsequent scoped review approved the
readiness amendment with no new findings. Fresh `pnpm check` passed formatting,
lint, types, builds and all 2,727 tests in 382 files (`readiness-check.log`).
All real-bucket, physical-phone, uncoached and missing live API acceptance remains
unchecked. The earlier failure's cause and rapid-Escape safety remain unproven.

After these clean scoped reviews, the plan workspace was closed. Its coordination
ledger, rulings, implementation reports and reviews were preserved under
`.playwright-mcp/task-10-logs/coordination/`, alongside the retained command
outputs, traces and screenshots. The local branch/worktree remain available
for review; no publication or integration was performed.

### Avandar Auto review verification (4 October 2026)

The Auto review reorganized Upload's modules and component-owned styles,
clarified helper names and type contracts, and moved cross-module tests to
integration suites. Final scoped Vitest verification passed 436 tests in 60
files; the generated media fixture helper passed its two tests separately.
Workspace lint, type-checking, production build and changed-file formatting
also passed.

The routed Upload browser run recorded 151 passed, four failed and one existing
dependency skip. All four failures came from a missing image argument in an
extracted scroll helper. After restoring that argument, `--last-failed` passed
85 cases with one existing skip, including all four repaired cases and their
prerequisites. Together the runs verify all 74 routed Upload cases across Chrome
and WebKit. Logs are `.playwright-mcp/avandar-auto-upload.log` and
`.playwright-mcp/avandar-auto-reentry.log`. The first run remains failed evidence;
live API, real-bucket, physical-phone and uncoached acceptance remain pending.

## Asking and occasions acceptance (5 October 2026)

`e2e/occasions-and-removals/` runs after the empty archive case. It extends the
existing cached admin fixture and caches an asker and uploader once each. Each
case owns its item, tag and occasion; it preserves the archive, links member
people tags, and PUTs actual thumbnail/display/original bytes into fake S3.
Live flows use real read and mutation JSON. Withdrawal mail is inspected through
a second catalog handle and the shared frozen-payload schema, proving queued
notification rather than delivery.

The focused Chromium suite passed 34 cases, including nine live flows, genuine
Tab/Shift+Tab/Enter traversal, dialog restoration/trapping and unavailable media.
Controlled visual/edge cases cover all 19 states at 1280/768/400 in light/dark,
plus every state at 640px equivalent reflow, long 4,000-character replies and
failed controls. These responses are visual fixtures, separate from live claims.
All 114 production/prototype comparisons were captured and inspected. The visual
suite requires the read-only prototype server at 5174; start `pnpm dev:prototypes`
first if it is not already running. Review subsequently found a missed dark
reconciliation Back to the list contrast defect. The owner now supplies a print
background, verified by freshly inspecting light/dark 1280/768/400 and 640px
reflow captures. The original failed captures remain preserved.

All five live occasion cases also passed with the browser initially dated April 2027. The form helper pins only browser current time to its October fixture
month before opening the calendar; timers and the real API clock keep running.
This follows an observed out-of-month RED and does not replace real mutations.
The bounded fix-round browser command passed eight cases, including keyboard
attachment, milestone reflow and the six reconciliation comparisons.

MCP manual acceptance reused private ignored storage states without fresh codes:
three-person asking, withdrawal and queued uploader mail, exact decline words,
Ask again, two open asks settled by deletion, and keyboard attachment. Actual
native 200% zoom passed all three production surfaces: 1280x900/DPR 1 became
640x450/DPR 2, controls stayed within the viewport and document width stayed 640.
Direct CDP viewport captures provide usable painted focus evidence; earlier
Playwright native-zoom screenshots are retained as capture diagnostics.

`pnpm check` passed all workspace gates. Impacted Chromium item/account/filter
and asking/occasion coverage passed 72 cases with the existing administration
visibility-picker `fixme` still parked. No required Step 8b case is skipped.
Baseline JSDOM scrollTo notices remain. Logs, screenshots, manifests, native
metrics and manual results are ignored under `.playwright-mcp/step8b-acceptance/`.
