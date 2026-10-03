# The web app (`apps/web`)

A React 19 single-page application built with Vite, styled with
[Mantine](https://mantine.dev), routed by
[TanStack Router](https://tanstack.com/router), and fetching through
[TanStack Query](https://tanstack.com/query). There is no server-side
rendering and no server entry point: everything runs in the browser.

Step 3b built the skeleton: the design system, the theme, the route map and
the chrome. Step 4b made it talk to a server, and built the first two product
surfaces on top of it. Step 5b built the archive itself, live against the read
path step 4a delivered. **Sign in (surface 1), the timeline (2), the empty
archive (5), filter and search (6), the people directory (7) and My account
(9) are live**; the other ten routes still render a placeholder inside the
real chrome, and a later step replaces each one.

Step 6a added the upload engine, which has no surface yet: surface 8 is step
7b's, and it draws on top of `src/upload/` and `src/api/uploads/`. Until then
the engine is driven by a development-only harness page, `upload-proof.html`.
See § The upload engine.

## Layout

```
apps/web/
├── index.html                the single HTML document
├── upload-proof.html         the dev-only upload harness: see The upload engine
├── vite.config.ts             plugins, dev server, /api proxy
├── vitest.config.ts           jsdom, the setup file, and the test glob
├── vitest.setup.ts            the DOM shims described under Tests
├── public/
│   ├── favicon.svg
│   └── fonts/                 three self-hosted variable faces (.woff2)
└── src/
    ├── main.tsx                mounts React, the providers, and the stylesheets
    ├── router.ts                creates the router and registers its types
    ├── queryClient.ts           the TanStack Query client and its retry rule
    ├── styles/
    │   ├── tokens/tokens.css     four renditions, the scales, the dark-mode block
    │   ├── fonts.css             the three @font-face blocks
    │   └── global.css            the enamel panel, the focus ring, reduced motion
    ├── theme/
    │   ├── theme.ts              createTheme and the Component.extend adaptations
    │   ├── cssVariablesResolver.ts  the palette, bridged onto Mantine's variables
    │   ├── variantColorResolver.ts  the button and action-icon variants
    │   └── components.module.css the adaptations themselves
    ├── system/                   one directory per component family, plus
    │                             system.module.css and labelHelpers/
    ├── surfaces/                 one directory per built product surface
    │   ├── SignIn/                surface 1: the card, the flow, the copy
    │   ├── Timeline/              surfaces 2, 5 and 6: the pile, the rail,
    │                              the filter sheet, the two empty states
    │   ├── People/                surface 7: the directory and one card
    │   └── Account/               surface 9: one sheet per section
    ├── session/
    │   ├── requireSignedIn/       the route guard
    │   └── firstSignIn/           the one-time line after a first sign-in
    ├── api/
    │   ├── client/client.ts       apiFetch and ApiRequestError
    │   ├── auth.ts, me.ts, publicSettings.ts   one module per resource
    │   ├── timeline/              the selection, the day stream, the rail
    │   ├── vocabularies/          the facets and the two vocabularies
    │   ├── seen/seen.ts           the latch, and what suppresses it
    │   ├── bursts/bursts.ts       a burst's frames, against step 5a
    │   ├── uploads/uploads.ts     one plain function per upload route
    │   └── health.ts              the worked example
    ├── upload/                   the headless upload engine, and proof/ for
    │                             the harness page's own modules
    ├── testing/                  fixture builders and the surface harness
    ├── routes/                   file-based routes: two shells, four live, ten placeholders
    ├── routeTree.gen.ts          generated. Never edit.
    └── boundaries.test.ts        asserts nothing under apps/ imports from prototypes/
```

## Providers

`src/main.tsx` imports its stylesheets before anything else, in an order
that matters:

1. `@mantine/core/styles.css` and `@mantine/dates/styles.css`, Mantine's own
   sheets.
2. `src/styles/fonts.css`, the `@font-face` blocks.
3. `src/styles/tokens/tokens.css`, the custom properties those fonts and every
   colour are written in terms of.
4. `src/styles/global.css`, which overrides Mantine's own focus ring and
   needs the tokens above it to already exist.

Each layer depends on the one before it, so a later import beats an earlier
one on specificity exactly where that is intended.

It then mounts three providers, outermost first:

1. `QueryClientProvider` with the shared client from `src/queryClient.ts`.
2. `MantineProvider` with the theme from `src/theme/theme.ts`, the
   `cssVariablesResolver` from its own file beside it (which bridges the design tokens onto Mantine's own
   CSS variables), and `defaultColorScheme="auto"` (which lets Mantine's own
   `color-scheme` agree with whichever panel is actually showing, without
   changing any colour: the resolver writes the same palette into both of
   Mantine's colour-scheme blocks).
3. `RouterProvider` with the router from `src/router.ts`.

## Styling

The visual language is documented once, in [`../DESIGN.md`](../DESIGN.md);
`src/styles/tokens/tokens.css` is that record expressed as CSS custom
properties.

**Four renditions, four inks each.** Day, Porcelain, Slate and Night each
declare exactly four inks (`--panel`, `--print`, `--ink`, `--accent`), and
every other colour in the system is a `color-mix` in oklab of those four.
That is why switching renditions is one `data-rendition` attribute on
`<html>` rather than a second stylesheet, and why a fifth hand-picked colour
is a bug rather than a design choice.

**The rendition follows the operating system, not a setting.** Nothing in
the product lets a member choose a rendition: `design-spec.md` gives no
surface a control for it, and the pile arrangement is the only thing
`DESIGN.md` names as instance-level. So `tokens.css` ships all four
renditions but only two are reachable: a `@media (prefers-color-scheme:
dark)` block maps a dark system preference to Night's four inks, light
(and no preference) stays Day. The media query only applies to
`:root:not([data-rendition])`, so an explicit `data-rendition` attribute on
`<html>` still wins over the system preference; nothing writes one today,
but the rule (and Porcelain and Slate) stay reachable for the day something
does.

**A quiet ink belongs to the surface it is read on.** There is one quiet ink
for text on the panel and another for text on a print sheet, and picking the
wrong one is invisible in Day, where both mixes land dark, and a contrast
failure in Night, where the panel is the dark ink. `--on-panel-quiet` appears
ten times in `system.module.css`, and surfaces 2, 5, 6 and 7 brought seven of
them into use: the spine's month and count label, the archive's end row, a
milestone's meta line and its continuation day, and a person's count. All
seven are drawn straight on the panel, which is the right ink for them.
Whoever builds the next surface should check which of the two a piece of text
is actually drawn on. `e2e/contrast.spec.ts` will say so if they get it wrong,
but only once that surface is added to it: the sweep still runs over surfaces
1 and 9 alone, and over their text rather than their borders and outlines
(`docs/e2e.md` § The contrast sweep).

**`data-pile`** carries the pile's arrangement (`tidy` or `messy`) the same
way: an attribute on `<html>`, read by `system.module.css` wherever the
arrangement changes the pile's layout. `index.html` currently hardcodes
`data-pile="messy"`; nothing computes it from a setting yet.

CSS Modules for anything custom, Mantine components and theme tokens for
everything else, no TailwindCSS. The full rules are in
[rules/styling.md](rules/styling.md).

## The design system

`src/system/` holds the thirteen shared components (the chrome, the pile, the
reactions control, the people field, and the rest of the world Mantine does
not give us) and one 180-class CSS module, `system.module.css`. One component
per file, and a family that has several (`Chrome/`, `Pile/`, `Talk/`,
`typography/`, `Chip/`) is a directory of them; anything with a test sits in
its own directory beside it. They were
lifted out of `prototypes/src/system/` in step 3b: most were retyped against
the frozen DTOs in `packages/shared` in the process (a handful, like `Pile`
and `ProductBar`, still declare a small local prop type for a shape that has
not been frozen yet), and every read of a prototype fixture module became a
prop instead.

`src/system/labelHelpers/` holds every string derived from a number or a date
(a count, a relative time, a date range), kept in one place so the same value
never gets formatted two different ways in two components.

**Nothing under `apps/` may import from `prototypes/`.**
`src/boundaries.test.ts` scans every file under `apps/` for an import
specifier that mentions `prototypes` and fails if it finds one, so the rule
in `AGENTS.md` is enforced rather than just stated.

## Routing

File-based. Add a file under `src/routes/` and the TanStack Router Vite plugin
regenerates `src/routeTree.gen.ts`. Never edit that file, or any other
`*.gen.*` file, by hand. `src/router.ts` registers the router type globally so
route params and search params are typed everywhere.

**Two shells.** `__root.tsx` holds no chrome of its own; every page renders
inside one of two layout routes beneath it:

- **`sign-in.tsx`**, the signed-out shell: a top bar and a centred card. It is
  a sibling of `_app`, not a child, because a guard that redirected to a
  guarded route would loop.
- **`_app.tsx`**, the signed-in shell: the guard runs in `beforeLoad`, then
  the product bar wraps an `<Outlet />`. The other thirteen routes are its
  children.

**The route map is flat.** Fourteen routes cover the product's web surfaces;
there is no `/admin` prefix, because role is an attribute of a destination
and not a path segment. Two surfaces share a route each: `/items/$itemId`
covers both a photo and a video, since a link cannot know which until the
item has been fetched, and `/` covers the timeline, the empty archive and
the filtered pile, since a filter is a search parameter on the same pile
rather than a different page.

**One query answers the guard and My account.** `src/api/me/me.ts` exports
`meQueryOptions` for `GET /api/me`, and that single cache entry is what
`_app.tsx`'s `beforeLoad` awaits and what the account surface reads. There is
no separate "session" fetch: the account response already carries the member,
their role, their four notification switches and the three instance settings
the shell draws with, so a reload has the same values a fresh sign-in does.

`src/session/requireSignedIn/` turns that response into route context.
`requireSignedIn` takes the whole `MeResponse | null` rather than a viewer,
narrows it once, and returns `{ viewer, settings }`: the viewer is the lossy
part (id, display name, role, `isAdmin`) that every route context carries, and
the settings are what the product bar needs. Given `null` it throws a redirect
to `/sign-in` carrying the attempted href, so a shared link that requires
sign-in leads there and then back. A redirect to `/` is left off the search
parameters, because that is where sign-in lands anyway.

**Why the query answers `null` rather than `undefined`.** `GET /api/me`
answers `401 not_signed_in` to an anonymous caller and `apiFetch` turns that
into a thrown `ApiRequestError`, so the query function catches that one code
and returns a value instead. The value has to be `null`, which is otherwise
against house style: **TanStack Query rejects a query function that returns
`undefined`**, treating it as "this query has no data" rather than as data.
That rejection does not happen when the function is called directly, only when
it runs through a query client, so returning `undefined` turned every guarded
route reached while signed out into an error screen instead of a redirect,
while three test files went on passing. `routes/rendering.test.tsx` renders a
guarded route while signed out and is the standing guard against it. Every
failure other than `not_signed_in` still throws, because every other failure
is a fault rather than an answer.

Because routing is client-side, a hard refresh on a deep link reaches the
server, which serves `index.html` and lets the router resolve the path. See
[server.md](server.md#serving-the-web-app).

## The six built surfaces

**Surface 1, sign in.** Its state lives in the URL rather than in the
component: `?redirect=` says somebody arrived from a permalink, `?sent=true`
says a code has been asked for, and `?email=` pre-fills the address from an
invitation link. A reload mid-flow therefore keeps the address, which matters
because retyping it mints a fresh code and stops the one already in somebody's
inbox from working. `makeSafeHrefFromRedirect` exists because `redirect` is an
arbitrary string off the URL and an arbitrary href is exactly what an open
redirect needs.

**There are six states, not the seven the design spec's surface table lists.**
`unknown` is not one of them. `POST /api/auth/sign-in-codes` answers the same
`202` for a member and for an address nobody has heard of, deliberately, so
that the form cannot be used to find out who is in the Shoebox. The client
therefore cannot compute the difference and must not appear to, which makes
the conditional wording ("If x@y.z is in this Shoebox, a six-digit code is on
its way there now") the only correct copy for every outcome of that route.
`sent` and `unknown` collapse into one state because they are one response.

**Surfaces 2, 5 and 6 are one route.** `/` is the pile, the empty archive and
the filtered pile, because a filter is a search parameter on the same pile
rather than a different page. `surfaces/Timeline/` holds all three:
`TimelineSurface` chooses between them, `DayStream` pages the days behind an
intersection observer, `DayBlock` draws one day's spine, band, strips and
prints, `JumpRail` moves the whole field, `FilterSheet` and `FilterChips` are
surface 6's controls, and `EmptyArchive` and `NoResults` are the two ways a
pile comes back with nothing in it. The client half of the day stream itself,
including what makes the scroll fast, is documented beside the server half in
[archive.md](archive.md#the-client-half).

**The URL is the source of truth for the selection.** One
`TimelineSelection` (tags, people, `from`, `until`) is declared in
`api/timeline/selection/selection.ts`, and every query key, every request path
and every chip is derived from that one object, so the pile, the rail and the
facet counts cannot settle on different answers to the same question. Component state would have been a second copy of it,
and a filter is an address in this product: a texted
`?person=<id>&from=2026-09-01` has to land on the same pile the sender was
looking at. `_oneOrMany` in the route's search schema is what makes `?tag=a`
and `?tag=a&tag=b` the same shape.

**`?at=` is a start position rather than a filter.** The rail lists every
visible day while the stream pages ten at a time behind a cursor the client
must not mint, so jumping six hundred days down means starting the stream
somewhere other than the top. A day already loaded is scrolled to and nothing
is fetched; any other day sets `at=YYYY-MM-DD`, which goes on the wire as
`until` because `until` is the only upper bound the route takes, and where
both are set the earlier one wins. It is deliberately not a chip:
`design-spec.md` calls a filter left on by accident this surface's worst
failure, and a jump is not something anybody filtered by, so `at` never
appears in the filter strip and no clear-all touches it, neither the strip's
nor the dead end's own "Clear them all". Changing the selection is the one
edit that does drop it, and deliberately: `at` is an upper bound with no chip
to explain it, so carrying it into a filter somebody has just narrowed can
show a dead end for a person who has plenty of photographs above the jump.
Clearing everything cannot do that, because the day `at` names is a day the
rail listed. Two consequences look like bugs and are not. `resultCount` comes
back non-null, because the server counts `until` as a filter, and the client
ignores it when `at` is the only thing set. And the days above the jump stop
being reachable by scrolling up, which is what "start the stream here" means;
the rail is the way back and the rail never leaves.

**The two empty states are told apart by `me.role` and by nothing else.**
`timeline.md` transformation 9 makes a brand-new archive and a fully
restricted viewer return byte-identical bodies, on purpose, so nothing in the
response may be read to choose between them. The role is already in hand from
`meQueryOptions`: an admin or an uploader gets surface 5 `new`, with the
invitation to put the first things up, and a viewer gets `restricted`. The
member list would name somebody to ask and is deliberately not fetched,
because it is an admin route, so the copy reads "Ask whoever invited you about
it". A viewer looking at a genuinely empty archive therefore reads the
restricted copy. That is not a defect: it is the indistinguishability the
contract asks for, seen from the one side that cannot tell.

**Surface 7, the people directory.** `/people`, one card per person, with what
is typed carried in the URL like every other filter so a narrowed directory
can be sent to somebody. The field navigates with `replace: true` on every
keystroke while the query behind it is debounced separately, so typing narrows
the address without leaving one history entry per letter behind the back
button. Somebody with no visible photographs still gets a card and a ghost
frame, which is the state the server's `ON` clause kills silently
([archive.md](archive.md)). `peopleCount` counts people before the search
narrows them, so "6 of 10 people" never reads as somebody having been removed.

**Surface 9, My account.** Three kinds of write, and they are deliberately not
the same. The name has a button, so a round trip is expected and the answer is
written to the cache when it lands. The four notification switches write
optimistically: the cache moves in `onMutate`, before the request goes out,
and rolls back in `onError`, because a switch that waits for a round trip does
nothing when it is tapped and gets tapped again. Signing a device out is a
plain mutation that invalidates the device list.

Both writes to `PATCH /api/me` share one **mutation scope**, which serialises
them. Every answer to that route is a whole `MeResponse` carrying that
request's own snapshot of the fields it did not change, and both mutations
write the answer straight into the cache, so a name save and a switch flip
close together could come back out of order and revert each other. A shared
scope makes TanStack Query send the second only once the first has been
applied. It does not delay the optimistic write, because `onMutate` runs
before the retryer the scope gates.

## The upload engine

`src/upload/` is the whole client half of the upload contract, with no UI at
all. Step 7b draws surface 8 on top of it. The reasoning behind every choice
here is the step design,
[`2026-10-02-upload-design.md`](superpowers/specs/2026-10-02-upload-design.md),
whose spike measured the engine's approach in both browsers before any of it
was written.

Each module with a test is a directory of its own name, holding the module and
its co-named test.

| Module                        | What it does                                                                |
| ----------------------------- | --------------------------------------------------------------------------- |
| `getManifestEntryFromFile/`   | Capture evidence from the file's headers, before commit                     |
| `getImageHeaderFromFile/`     | EXIF date, offset and post-orientation size, through `exifr`                |
| `getQuickTimeHeaderFromBlob/` | A video's `mvhd` times and its `tkhd` size, read through `Blob.slice`       |
| `makeSha256HexFromBlob/`      | The streaming SHA-256, in 8 MiB slices through `hash-wasm`                  |
| `mediaWorker/`                | The worker's entry, its protocol, its answer, and the engine's client       |
| `jpegDerivatives/`            | The checked JPEG encode, the derivative sizes, the quality per encoder      |
| `makeImageDerivatives/`       | `display` and `thumb` through `createImageBitmap`, and the HEIC path        |
| `makeImageDataFromHeic/`      | `libheif-js` in WASM, loaded only when the browser cannot decode HEIC       |
| `makeVideoDerivatives/`       | A video's `poster` and `thumb`, on the main thread                          |
| `transferUploadFile/`         | Presign, the PUT or the parts, re-presigning, complete, and the transport   |
| `createUploadEngine/`         | Concurrency, the worker pool and its recycling, the events                  |
| `proof/`                      | The harness page's own modules, which no build but the end-to-end one takes |

**Evidence before bytes.** `getManifestEntryFromFile` reads EXIF
(`DateTimeOriginal`, `OffsetTimeOriginal`, dimensions and orientation) through
`exifr`, a video's creation time from its atom headers, and `lastModified`. It
decodes nothing, so the days list can exist before a byte moves. The browser
supplies the evidence and the server picks the rung.

**One pipeline per file**: a streaming SHA-256 in 8 MiB slices through
`hash-wasm`, in a worker; the derivatives; the original, as one PUT or, at
`appConfig.upload.multipartThresholdBytes` (32 MiB) and over, as 16 MiB parts
in order, each with its ETag; the derivatives' PUTs; then `complete`. Every
PUT, a part's or a file's, a first try or a retry, is re-presigned before it
starts if its URL could not carry it to the end at
`appConfig.upload.transferFloorBytesPerSecond`, judged on this browser's clock
from when the URL arrived. The floor rather than a measured rate, so a link
that slows mid-part still finishes before the URL lapses: that is what keeps
a transfer that is alive from going longer than the abandon grace without the
server hearing from it. A PUT that meets a `403` gets one fresh URL.
A presign answered `409` with `state: "sending"` lost a race to another
presign of the same file, and is presigned again. A `429` from any upload
route (presign, a derivative's presign, `complete`) is waited out for its
`retryAfterSeconds`, at least a second and at most a minute, and spends no
try, because the server is answering and asked only for a pause; ten of them
for one file and it fails. A request that got no answer while
`navigator.onLine` is false is not retried at all: the transfer waits for the
`online` event, spending no try, so a lift or a tunnel does not use up the
half minute of backoff on a network that is not there. One file waits at most
`appConfig.upload.offlineWaitCeilingMinutes` (20) in all, well inside the
abandon grace, because nothing reaches the server while it waits; after that,
and for every failure while online, the capped backoff applies as before.
**The budgets are per file**: the ten `429` waits and the offline ceiling are
spent by that file's transfer alone. A file that gives up reports its failure
with a fresh budget of the same size, so a give-up after a long outage is
still recorded, rather than failing at once and leaving the row `sending`
for the sweep. A PUT that makes no upload progress for 90 seconds
(`appConfig.upload.stalledPutTimeoutSeconds`) is aborted and reported as a network error, so a link that
drops without closing costs a retry of that part or file rather than a lane
that waits forever. The engine runs
`appConfig.upload.maxParallelTransfers` files at a time, which is two, because
the spike measured four buying a phone nothing and costing memory.

**Its events are everything surface 8 draws.** Each file emits `file-started`
and `file-progress`, then exactly one `file-done`, `file-failed` or
`file-skipped`, unless the run is cancelled, and a run emits **at most one**
`settled`, last. An empty input, a cancelled run and a run no `complete`
answered emit none, so **`start` resolving is the end of a run**, and the
thing to wait for. A skipped file is a duplicate: presign found its bytes in
another file of the batch and cancelled it (design decision 15), and the
engine then reads the batch for `settled`, because that cancel may be what
settled it. A file the browser could not read before its first presign is
ended with `complete` `outcome: "failed"` so the batch still settles.
`cancel` is final: it aborts the PUTs in flight, ends the workers and cuts
short any wait under way (a `429`'s, a backoff, an offline one), and a
cancelled file reports no ending. **A batch closed or cancelled elsewhere
stops the run the same way**: the first transfer told so (a
`409 upload_session_conflict`, or a `409` naming its own file `cancelled`,
which only a close or cancel of the whole batch does) aborts the run, so
nothing more is hashed, decoded or sent, and the run ends with one
`batch-closed` event instead of `settled`.

**`apps/web` reads `app.config.ts` directly.** The engine is the first code
here to import the root `appConfig`, by relative path and with no extension,
like every import in this package: the concurrency, the multipart sizes, the
transfer floor, the derivative sizes and the recycle count are the same
deployment constants the server reads, and one file keeps the two halves
agreeing. Vite bundles it and `tsc -b` follows it.

**What the browsers taught it.** Chrome cannot decode HEIC at all, so a HEIC
that `createImageBitmap` refuses is decoded by `libheif-js` in WASM, loaded
lazily into that worker so Safari never downloads it, and a worker that has
decoded `appConfig.upload.heicWorkerRecycleCount` of them is replaced, because
the WASM heap never shrinks. A worker is replaced at once after a decode that
timed out or failed, and after any error, since it may be broken. `libheif-js`
is LGPL-3.0 and bundles an HEVC decoder, accepted deliberately (design
decision 1). Derivatives are JPEG, because WebKit answers a WebP request with a
PNG several times the size, and the engine checks each blob's real type.
WebKit draws a black frame for a poster captured on `seeked`, so a poster
waits for `requestVideoFrameCallback` or a short timeout, whichever comes
first; on WebKit a wait that ended on the timeout gets no poster rather than a
black one, and a hidden tab's WebKit videos wait, up to a cap, for the tab to
be shown. A derivative the browser cannot make is dropped rather than fatal:
`MediaRef` falls back to the original. So is one over
`appConfig.upload.derivatives.maxBytes` (10 MiB), which `complete` would
refuse: it is dropped before it is presigned.

**Resume** is finding the batch with `GET /api/upload-sessions/current`,
declaring the picked files again with their hashes, and sending only what the
manifest does not answer `already_done`. A hash is the only thing that can
match a file that has already landed, so a resumed declaration always carries
one. "Send what did arrive" is `commit` with `intent: "close"`, and arming a
batch is `intent: "arm"`.

**`upload-proof.html` is a development tool and never ships.** Vite serves it
in development, and `vite.config.ts` builds `index.html` alone unless
`WEB_BUILD_UPLOAD_PROOF=true`, which only the end-to-end run sets: that run
serves the built app from Fastify, and its upload spec drives the engine
through this page. That build also writes to its own `apps/web/dist-e2e`, so
`dist` never holds the harness, and any other build that reaches the harness
fails. `pnpm upload:proof --dir <path> --browser chrome|webkit` signs a named
member in against the development catalog, opens the harness on `pnpm dev`,
picks every file in the directory, and reports per-file timings and memory. It
is the same page a phone opens for an on-device test.

**If a Content-Security-Policy is ever added**, it must allow
`'wasm-unsafe-eval'`: `hash-wasm` and `libheif-js` both run WebAssembly in the
media worker, and a policy without it stops every hash.

## Talking to the API

One shared client and one module per resource, under `src/api/`:

- **`client.ts`** holds `apiFetch`, which prefixes `/api`, sends credentials,
  and **parses the response body with a Zod schema**. Responses are validated
  rather than trusted, so a client and server that have drifted apart fail
  loudly at the boundary instead of producing `undefined` five components
  deep. A non-2xx response becomes a thrown `ApiRequestError` carrying the
  server's `status`, `code`, `message`, and now `details`: the structured
  data the error envelope carries beyond its English message
  (`fieldErrors` on a 400, `retryAfterSeconds` on a 429,
  `attemptsRemaining` on a sign-in code, and the upload slice's `sessionId`,
  `fileId`, `state` and `clientRefs` on its `409`s). `message` is for a log or
  a fallback and is never the primary UI copy. A 204 response has no body, so
  `apiFetch` returns `undefined` for it rather than trying to parse one.
- **One module per resource**, exporting TanStack Query `queryOptions` rather
  than hooks. Options can be used by a component, a route loader, or a
  prefetch; a hook can only be used by a component. `health.ts` is the example
  to copy.
- **`uploads/uploads.ts` is the one exception**: a plain function per upload
  route, each through `apiFetch` and parsed with the shared response schema,
  because the upload engine calls them outside React and outside a cache.

`src/queryClient.ts` retries a failed request once, except a 4xx: Memory
Shoebox talks to its own server on the same origin, so a same-origin failure
is usually real, and a 404, a 403 or a 429 is real by definition. Retrying
one only doubles the latency of a genuine refusal.

There is no configurable API base URL, by design. The API is always at `/api`
on the same origin: Fastify serves both in production, and the Vite dev server
proxies `/api` to port 8080 in development. See
[architecture.md](architecture.md#one-origin-one-deployment).

## Development server

`pnpm dev:web` starts Vite on **http://localhost:5173** with `strictPort`
behavior left at Vite's default. `/api` is proxied to `http://localhost:8080`,
so the API server has to be running too. `pnpm dev` from the repository root
starts both. The upload harness is at
**http://localhost:5173/upload-proof.html**; see § The upload engine.

## Tests

Vitest, running in `jsdom` with Testing Library
(`@testing-library/react`, `@testing-library/jest-dom`,
`@testing-library/user-event`), because the design system's thirteen
components are tested by rendering them.

`vitest.setup.ts` shims three things jsdom does not provide, all needed for
Mantine's dropdowns and menus to render in a test at all:

- **`window.matchMedia`**, which Mantine's internals call (`Modal`, for
  instance) even though nothing in this design system uses a responsive hook
  directly. The shim answers `false` to everything, which is enough for
  Mantine to fall back to its narrowest value.
- **`Element.prototype.getBoundingClientRect`**, along with the document's
  `clientWidth`/`clientHeight`. jsdom does no layout, so every element's
  bounding box and the viewport's own size come back 0x0 by default; Floating
  UI (what Mantine's `Popover` and every dropdown in this design system sit
  on) reads both to decide whether its target has been clipped out of view,
  and a 0x0 target inside a 0x0 viewport reads as fully clipped forever, so
  the dropdown renders `display: none` and never opens. The shim gives both
  sides a plausible size instead.
- **`window.ResizeObserver`**, which Mantine's `ScrollArea` (what a `Select`,
  `MultiSelect` or `TagsInput` dropdown scrolls its options inside) calls to
  size itself. jsdom has no implementation at all, so the shim is a no-op
  stub that never fires a callback; nothing here asserts on a resize, only
  that the dropdown mounts.

It also fills in `Blob.prototype.arrayBuffer`, which jsdom 27 lacks on `Blob`
and `File` alike. The upload engine reads every header and every hash slice
through `blob.slice(start, end).arrayBuffer()`, so the shim reads the same
bytes through jsdom's own `FileReader`, and stands down the day jsdom ships
the method.

**There is a second layer above this one.** Vitest renders a component against
a mocked `apiFetch`; it cannot tell you that a cookie survived a reload, that
a device signed out in one browser stops working in another, or that a code
minted by the server can be read out of an email and typed in. Those run in a
real browser against a real Fastify process, in `e2e/`. See
[e2e.md](e2e.md). They are `pnpm test:e2e`, not part of `pnpm check`.
