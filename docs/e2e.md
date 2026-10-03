# End-to-end tests (`e2e/`)

Sixty-three Playwright tests that drive a real browser against a real Fastify
process, one of them parked until a frontend step turns it on, and three
skipped on a machine without Google Chrome. They are the layer above `pnpm test`: Vitest renders a component
against a mocked `apiFetch`, and there is a class of promise this product
makes that no mock can check. That a cookie survives a reload. That a device
signed out in one browser stops working in another on its next request. That a
six-digit code the server actually minted, in a message it actually rendered,
gets somebody in. That a colour written as a mix of four inks is still legible
once a browser has resolved it.

`e2e/signIn.spec.ts` covers surface 1, `e2e/account/` covers surface 9,
`e2e/empty.spec.ts` covers surface 5, `e2e/pile.spec.ts` covers surface 2,
`e2e/filter.spec.ts` covers surface 6, `e2e/people.spec.ts` covers surface 7,
`e2e/scroll.spec.ts` measures the pile's scroll, `e2e/contrast.spec.ts` covers
surfaces 1 and 9 against WCAG AA, `e2e/upload/__tests__/upload.spec.ts` drives the upload engine
end to end in Chrome and WebKit after `e2e/upload.setup.ts` signs its uploader
in, and `e2e/support/` holds the modules they share.

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

The upload spec also wants Google Chrome itself, installed where Chrome
installs: Playwright's `chrome` channel finds it there, and without it the
`upload-chrome` project skips with a message saying so rather than failing.
`pnpm test:e2e --project=upload-webkit` runs one browser's upload spec, and
still runs `chromium` and `upload-setup` first, because it depends on them.

**It is not part of `pnpm check`**, deliberately. It needs a browser binary
that a fresh clone does not have and a free port that a shared machine may not
have, and it builds the web app before it starts. `pnpm check` has to be
runnable by anybody who has just cloned the repository; this is run
deliberately, before a step is called done.

## The topology it runs in

**One Fastify process serves both the API and the built web app**, on one
origin, which is exactly how this deploys (see
[architecture.md](architecture.md)). Nothing is proxied and the API is not
stubbed, so the static-serving path is exercised rather than assumed and there
is no CORS configuration on it to get wrong in a test that production would
not have. The cost is a `pnpm build` before the run. **The one stand-in is the
bucket**: see § The upload spec.

`e2e/support/e2eEnvironment.ts` is the one place that shape is written: the
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

**The run spends 18 of the 20, which is exactly what the guard counts.** Only
`POST /api/auth/sign-in-codes` and its resend twin carry
`signInCodeRequestPerIp` (`apps/server/src/routes/auth.ts`), and every request
to either one goes through `support/signIn.ts`. The eighteenth is
`upload.setup.ts`, which signs the uploader in once for both upload projects:
a sign-in in each would have cost two. Two are left, which is the headroom the
next frontend step has to work in.

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
or it is not. Surface 5 needs it empty and surfaces 2, 6 and 7 need it full.

`e2e/support/archive.ts` writes the development archive into the run's catalog,
and the specs that need data call it in a `beforeAll`. `empty.spec.ts` does
not, and asserts the catalog is empty before it starts. Files run
alphabetically under one worker, so `empty` precedes `filter`, `people`,
`pile` and `scroll`; that assertion is what turns a change to the ordering
into a named failure in the spec that depends on it.

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

`e2e/contrast.spec.ts` checks both built surfaces in both colour schemes at
both widths: eight tests, four views of surface 1 and one of surface 9 in each.

**It is here rather than in Vitest because it cannot be anywhere else.** Every
colour in this design system is a `color-mix` in oklab of four inks, and jsdom
computes neither `color-mix` nor `prefers-color-scheme`, so a unit test of the
same component reads back an unresolved custom property and proves nothing.
`support/contrast.ts` measures every element carrying its own text against the
nearest opaque background behind it, resolving both through a 1x1 canvas,
which is the one thing in a browser that turns any valid colour into sRGB
bytes.

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
scheme could see it.

**It costs no sign-in codes at all.** Surface 9 needs a session and surface 1
does not, and the four signed-in sweeps take the run's shared admin from
`support/signedIn.ts` through the `adminPage` fixture. The one refusal state it
sweeps is reached by spending digits against an address with no live code,
which is answered `410 sign_in_code_expired` and costs a redemption rather than
a mint.

**It emulates reduced motion, which is a correctness measure and not a
courtesy.** `.buttonRoot` carries `transition: background 150ms`, so the submit
button spends a tenth of a second part way between the ink it had and the ink
it is going to, and a sweep landing in that window measures a blend of the two:
the refusal state read 2.86:1 on a button half way back from disabled.
`global.css` answers `prefers-reduced-motion: reduce` by cutting every
transition to nothing, so asking for it is the same page with the tweening
taken out rather than a wait dressed up as a setting.

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
