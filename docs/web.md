# The web app (`apps/web`)

A React 19 single-page application built with Vite, styled with
[Mantine](https://mantine.dev), routed by
[TanStack Router](https://tanstack.com/router), and fetching through
[TanStack Query](https://tanstack.com/query). There is no server-side
rendering and no server entry point: everything runs in the browser.

Step 3b built the skeleton: the design system, the theme, the route map and
the chrome. Step 4b made it talk to a server, and built the first two product
surfaces on top of it. Step 5b built the archive itself, live against the read
path step 4a delivered. Step 6b built one photo and one video, live against the
item routes step 5a delivered. **The archive and account surfaces are built:** sign in (1),
the timeline (2), one photo (3), one video (4), the empty archive (5), filter
and search (6), the people directory (7), Upload (8), My account (9), asking
for removal (10), milestones (14) and removal requests (15). Step 8b connects
asking, answering and dated occasions to the real Step 7a routes. The remaining
six surfaces were completed in step 9: Members, Groups, Shoebox settings,
Presence, item viewers and Changes. Their behavior is documented in
[`administration.md`](administration.md) and [`settings.md`](settings.md).

Step 6a added the upload engine. Surface 8 now draws on top of `src/upload/`
and `src/api/uploadsHelpers/`; the development-only `upload-proof.html` remains
a separate engine proof. Live member/group and milestone directories are still
pending contracts, so their Upload forms show unavailable with explicit retry.
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
    │   ├── Setup/                 first-admin creation and invitation progress
    │   ├── SignIn/                surface 1: the card, the flow, the copy
    │   ├── Timeline/              surfaces 2, 5 and 6: the pile, the rail,
    │                              the filter sheet, the two empty states
    │   ├── Item/                  surfaces 3 and 4: one route, the viewer, the
    │                              strip, the thread, the sheets, every write
    │   ├── People/                surface 7: the directory and one card
    │   ├── Upload/               surface 8: drafts, optional edits and recovery
    │   └── Account/               surface 9: one sheet per section
    ├── session/
    │   ├── requireSignedIn/       the route guard
    │   └── firstSignIn/           the one-time line after a first sign-in
    ├── api/
    │   ├── clientHelpers/clientHelpers.ts       apiFetch, jsonInit and ApiRequestError
    │   ├── auth/, me/, publicSettings/   one module per resource
    │   ├── setup/                 availability, creation and durable progress
    │   ├── inviteMember.ts        full private directory and invitation writes
    │   ├── mailHealth.ts          administrative delivery diagnosis
    │   ├── timeline/              the selection, the day stream, the rail
    │   ├── vocabularies/          the facets and the two vocabularies
    │   ├── seen/seen.ts           the latch, and what suppresses it
    │   ├── bursts/bursts.ts       a burst's frames, as BurstFrameRef
    │   ├── items/                 the permalink, and the writes that answer with it
    │   ├── comments/              say something, edit it, take it down
    │   ├── reactions/             set or clear mine, on an item or a comment
    │   ├── visibilityRules/       find or create the rule an item is pointed at
    │   ├── members/, groups/      the picker's lists, against step 8a's contract
    │   ├── uploadsHelpers/        one plain function per upload route
    │   └── health.ts              the worked example
    ├── upload/                   the headless upload engine, and proof/ for
    │                             the harness page's own modules
    ├── testing/                  fixture builders, the fetch stub, the surface
    │                             harness, the item fixtures, harness and
    │                             write-hook helpers, and callQueryFn
    ├── routes/                   file-based setup, sign-in and guarded app routes
    ├── routeTree.gen.ts          generated. Never edit.
    └── boundaries.test.ts        guards production imports from browser fixtures
```

## Providers

`src/main.tsx` imports its stylesheets before anything else, in an order
that matters:

1. `@mantine/core/styles.css` and `@mantine/dates/styles.css`, Mantine's own
   sheets.
2. `src/styles/fonts.css`, the `@font-face` blocks.
3. `src/styles/tokens/tokens.css`, the custom properties those fonts and every
   colour are written in terms of.
4. `src/styles/global.css`, which puts the product's focus ring on every
   Mantine control and field in place of Mantine's own, and needs the tokens
   above it to already exist. Its Mantine selectors weigh exactly what
   Mantine's do (a class and a pseudo-class), so they win only because this
   sheet comes after Mantine's.

Each layer depends on the one before it, and where two rules weigh the same,
the later import wins, which is exactly where that is intended.

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
Surfaces 3 and 4 brought an eighth, the line under the frame (`.viewerMeta`),
which is drawn on the panel too. Whoever builds the next surface should check
which of the two a piece of text is actually drawn on. The contrast sweep will
say so if they get it wrong, but only once that surface is added to it: it
runs over surfaces 1 and 9 in `e2e/contrast.spec.ts` and over surfaces 3 and 4
in `e2e/item/item.contrast.spec.ts`, so surfaces 2, 5, 6 and 7 are still
unswept, and it measures their text rather than their borders and outlines
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
adopted from the former surface reference in step 3b: most were retyped against
the frozen DTOs in `packages/shared` in the process (a handful, like `Pile`
and `ProductBar`, still declare a small local prop type for a shape that has
not been frozen yet), and every read of a prototype fixture module became a
prop instead.

`system.module.css` holds the classes lifted with them. A component written
since, whose rules belong to it alone, keeps them in a module beside it
instead, with class names prefixed by its own: the comment editor and its
actions under `Talk/CommentRow/`, the transport's slider and marks under
`VideoFrame/`, and on the item page the pin button and the capture date's
warning.

`src/system/labelHelpers/` holds every string derived from a number or a date
(a count, a relative time, a date range), kept in one place so the same value
never gets formatted two different ways in two components.

`src/system/FocusKeepingButton/` is the button for anything pressed and then
busy, such as Send or a Save: it says it is unavailable without `disabled`,
so it keeps focus (§ Surfaces 3 and 4). `src/system/focusHelpers.ts` holds the two
questions asked before focus is moved once something has finished: whether
focus is lost, and whether it is still inside a given element.

**Production modules do not import browser fixtures.**
`src/boundaries.test.ts` guards fixture imports under `apps/web`; the shipped
system, tokens and theme are owned locally. Generated cartoon fixtures and
reference screenshots are acceptance inputs, not runtime dependencies.

## Routing

File-based. Add a file under `src/routes/` and the TanStack Router Vite plugin
regenerates `src/routeTree.gen.ts`. Never edit that file, or any other
`*.gen.*` file, by hand. `src/router.ts` registers the router type globally so
route params and search params are typed everywhere.

**Two shells.** `__root.tsx` holds no chrome of its own; every page renders
inside a signed-out setup/sign-in surface or the signed-in layout:

- **`sign-in.tsx`**, the signed-out shell: a top bar and a centred card. It is
  a sibling of `_app`, not a child, because a guard that redirected to a
  guarded route would loop.
- **`_app.tsx`**, the signed-in shell: the guard runs in `beforeLoad`, then
  the product bar wraps an `<Outlet />`. Its app surfaces, including
  `/setup/invite`, are children.

**First-run setup.** `/setup` is an anonymous narrow form only while the
catalog contains no member rows; `/setup/invite` is a private active-admin
invitation step. The root fetches fresh setup status at every navigation
boundary, then reads `/me` and admin-only progress. Initialization errors show a
retry screen. The shared `getSetupRedirectFromNavigation` decision preserves
ordinary anonymous deep links after setup and resumes the pending creating
admin. `/join?address=` is an unvalidated sign-in prefill alias. See
[setup.md](setup.md) for mutation, recovery and invitation behavior.

**The route map is flat.** The routes cover the product's web surfaces;
there is no `/admin` prefix, because role is an attribute of a destination
and not a path segment. Two surfaces share a route each: `/items/$itemId`
covers both a photo and a video, since a link cannot know which until the
item has been fetched, and `/` covers the timeline, the empty archive and
the filtered pile, since a filter is a search parameter on the same pile
rather than a different page.

**One query answers the guard and My account.** `src/api/me/me.ts` exports
`meQueryOptions` for `GET /api/me`, and that single cache entry is what
the root `beforeLoad` awaits and what the account surface reads. The app
guard narrows the root's account result without fetching a second account.
There is no separate "session" fetch: the account response already carries the member,
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

## The built surfaces

Surfaces 3 and 4 have a section of their own below, because one item carries
more writes than every other surface put together.

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

## Surfaces 3 and 4

`/items/$itemId` is both one photo and one video, chosen once the item answers,
because a link cannot know which kind it points at until then. They live in
`surfaces/Item/`, with every write in `itemWrites/` and every string that says
"photograph" or "video" in `itemCopyHelpers/`. The pile links in from a print and from
a fanned frame, whose frames `api/bursts` now parses as the `BurstFrameRef`
step 5a returns. The decisions are in the
[step design](superpowers/specs/2026-10-02-item-viewer-design.md).

**The route has no loader and must not grow one.** `GET /api/items/:itemId`
counts an open every time it runs, surface 17 prints that count, and the
router preloads a route's loader whenever a pointer rests on a link to it. A
loader would count an open for every frame in the strip a mouse crossed; a
print in the pile is a button that navigates, so only the strip's links invite
a preload. The surface fetches with `useQuery` instead, and a test pins it.

**One query, refetched on arrival, and never on focus or reconnect**, because
arriving again is opening again and neither of the others is. Nothing re-signs
its media on a timer. It retries once, and only on a 5xx: a body that failed
to parse was already counted, and any other refusal is an answer.

**There is one "not here"**, for a `404`, a `400` and an address that is not an
item's, in the same words for a deleted item and one the viewer may not see:
the server answers both with a byte-identical `404`, and telling them apart
would say what exists.

**The way back is history when the app has some**, which returns to the pile
with its filter and scroll intact, and otherwise `/?at=<capturedOn>`, the day
the item was taken. The not-here, loading and failed states go back the same
way, to the whole pile when there is no day to read.

**Every write lands in the cache, and nothing invalidates the item**, because a
refetch is an open. All writes on one item share one mutation scope, for
surface 9's reason: two whole-item answers landing out of order would revert
each other. Each is keyed by its ids, so a pending write cannot follow the
viewer to another frame. A `403` or `404` on a write refetches the item once,
so the page stops offering what the server refuses, but only while somebody is
still looking at it. Reactions are written before the request goes and the
latest tap wins, because a reaction that waits for a round trip gets tapped
twice. A comment's send and the item's delete ignore a second press while the
first is in flight.

**The pile is marked stale, not refetched**, after any write that changes what
it draws (everything but comments and reactions), and catches up when somebody
returns to it.

**Controls are drawn from `ItemCapabilities`, never from the role.** The split
is by consequence (`conventions.md` § Who may change an item): any uploader
may tag it, name who is in it and describe it; only its own uploader or an
admin may change who sees it, correct its date or delete it. A test gives an
admin's role a viewer's capabilities, and a viewer's role every capability, to
keep it that way.

**The burst strip is one tab stop**, so forty-five frames are not forty-five
tab stops; the arrow keys, Home and End move along it. A move replaces the
history entry, so Back leaves the burst, and keeps the page's scroll, so the
frame stays under the reader. It draws from the frames the item carries, or
the frames route for a run past sixty, never from a sibling's permalink, which
would be an open per thumbnail, and latches nothing itself: the item's own
`GET` already marks every visible sibling seen (`server.md` § The item slice).
While the next frame loads the previous one stays drawn and the left column is
not remounted, so the strip keeps focus; the right column is keyed by item,
because a half-typed comment or an open editor belongs to one item. Drawn is
all the previous frame is until then: the right column and its reaction row
are `inert`, because a write from either would land on the frame being left.

**The video transport takes its duration from the contract**, so every mark is
in place on first paint rather than jumping once the file's metadata loads.
The scrubber is a slider a keyboard can hold, a press anywhere on it seeks, and
the marks sit in a layer over it, since a slider's children are hidden from
assistive technology. The position is held above both columns, because the bar
is on the left and the composer that pins to it on the right. Nothing
autoplays.

**Tagging saves as it changes.** A typed name becomes a person only as the
request goes out, matched trimmed and case-insensitively against the item, the
editor's earlier answers and the directory, so a name somebody already carries
never makes a second person. `PeopleField`'s `anyone` mode offers each name
once and a typed name as a real option.

**People and tags are links into the pile filtered by them**, because a person
is a filter rather than a profile and a chip that did nothing would be a
focusable button with no action. `Chip` emits `aria-pressed` only when `active`
is passed, so an action chip such as "+ Tag somebody" is not announced as a
toggle that is off.

**The visibility picker is written against step 8a.** `api/members` and
`api/groups` parse 8a's documented shapes with local schemas, under cache keys
of their own so 8a's admin queries never share an entry with a stripped row.
Until 8a merges they answer `404`, and the picker offers the people and groups
the rule already names plus the viewer, so "Everyone" and "Only me" still work.
A save that changes nothing sends nothing.

**Focus is never dropped on the page by something the person did.** Closing an
editor with its save or its Cancel gives focus back to the button that opened
it, so a keyboard user keeps their place; an editor that goes because a
refetch took the right to use it away goes with that button, and focus is left
where the browser puts it. A button that is busy keeps focus: Send, every Save
and the delete dialog's choices say they are unavailable with `aria-disabled`
and Mantine's `data-disabled` look rather than `disabled`, which a browser
takes focus away from, and ignore a press while they are
(`system/FocusKeepingButton`). Send also stays that way while the composer is
empty, and the description's Save while it holds what is saved, since each is
focused at the moment it gets there. Once a comment lands, focus goes from Send
to the composer's field, where the next words are written; once a comment's
delete lands, its row goes and the composer's field takes focus from it. Both
moves happen only when focus is still where the press left it (in the
composer, or lost with the row), so somebody who moved on while the request
was out keeps their place.

**Nothing is named by a bare number or left unnamed.** The reaction summary
reads "3 reactions. See who left them" from visually hidden words, with its
marks hidden; a `<video>` carries its composed alt text as `aria-label`, as a
photograph's `<img>` does; and the theme's `Modal` adaptation names every
dialog's close button "Close", since that button takes focus when a dialog
opens. The same adaptation draws it in the sheet's ink (`--on-print`) and
stands it at `--tap` square with its mark kept at 1.25rem. All of this is
checked through jsdom's accessibility tree and a Playwright keyboard; nobody
has yet used surfaces 3 and 4 with a real screen reader, and that pass is left
for a person (the plan README says so too).

## The upload engine

`src/upload/` is the whole client half of the upload contract, with no UI at
all. Step 7b draws surface 8 on top of it. The reasoning behind every choice
here is the step design,
[`2026-10-02-upload-design.md`](superpowers/specs/2026-10-02-upload-design.md),
whose spike measured the engine's approach in both browsers before any of it
was written.

Each upload module groups its implementation, types and tests in a directory
of its own name. Larger suites live in `__tests__/`, with shared fixtures beside
them. The engine separates preparation, events and transfer lanes; the transfer
module separates presigning, PUTs, retries and completion. Imports point directly
to the leaf that owns each operation.

| Module                          | What it does                                                                |
| ------------------------------- | --------------------------------------------------------------------------- |
| `getManifestEntryFromFile/`     | Capture evidence from the file's headers, before commit                     |
| `getImageHeaderFromFile/`       | EXIF date, offset and post-orientation size, through `exifr`                |
| `getQuickTimeHeaderFromBlob/`   | A video's `mvhd` times and its `tkhd` size, read through `Blob.slice`       |
| `makeSha256HexFromBlob/`        | The streaming SHA-256, in 8 MiB slices through `hash-wasm`                  |
| `mediaWorker/`                  | The worker's entry, its protocol, its answer, and the engine's client       |
| `jpegDerivativesHelpers/`       | The checked JPEG encode, the derivative sizes, the quality per encoder      |
| `makeImageDerivativesFromFile/` | `display` and `thumb` through `createImageBitmap`, and the HEIC path        |
| `makeImageDataFromHeic/`        | `libheif-js` in WASM, loaded only when the browser cannot decode HEIC       |
| `makeVideoDerivativesFromFile/` | A video's `poster` and `thumb`, on the main thread                          |
| `transferUploadFile/`           | Presign, the PUT or the parts, re-presigning, complete, and the transport   |
| `createUploadEngine/`           | Concurrency, the worker pool and its recycling, the events                  |
| `proof/`                        | The harness page's own modules, which no build but the end-to-end one takes |

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
from when the URL arrived. The estimate uses the floor rather than a measured
rate, allowing for a link that slows mid-part. Every individual PUT also has a
hard maximum duration of `appConfig.upload.presignTtlSeconds` (one hour), even
while progress continues: exceeding it aborts the request and reports a
retryable network error. The deadline and the stall timer are cleared on
`loadend` and if `send` throws. The server retains orphan cleanup rows for the
URL's start window plus that maximum duration before its first recheck, then
keeps checking daily. This browser deadline cannot bound suspended tabs or
other clients' transfers, so server cleanup tombstones remain durable.
A PUT that meets a `401` or a `403` gets one fresh URL: Backblaze answers
an expired URL with `401` (`UnauthorizedAccess`), S3 with `403`, and the
transfer reads them alike, for a single PUT, a part and a derivative.
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

**Resume** reads the current or URL-addressed batch's complete manifest,
checks re-picked files with worker hashes, and sends only its missing rows.
Uploading batches re-declare matched existing ids with their hashes; settled
batches only retry existing failed ids and never patch the manifest. "Send what
did arrive" is `commit` with `intent: "close"`, and arming a draft batch is
`intent: "arm"`.

### The routed Upload surface

`/upload` owns its single Back to the pile bar. Its optional `session` search
parameter uses the shared id schema; newly declared sessions replace the current
URL, and an expired login returns through sign-in to the addressed batch. A failed
addressed read keeps its requested URL and Retry target even when the provider
still holds a different batch; that retained detail cannot replace the address. Viewers
see an explanation with no upload actions or queries.

`UploadSessionProvider` belongs to the signed-in shell and is keyed by member id.
Before Put, leaving Upload, browser Back, refresh and tab closure discard the local
batch. The page releases original handles, staged drops and preview URLs immediately
and cancels its uncommitted server draft with a keepalive DELETE. A late draft-open
answer is cancelled too, and a new read waits for cancellation to finish. A fresh
page discards an unstarted draft found on the server, covering interrupted page-exit
cleanup; addressed cancelled drafts return to the empty picker.

After Put arms the batch, navigating between Upload and the pile keeps the
controller, browser file handles and transfer alive. An arm request already in
flight is preserved because the server may have accepted it. A real unmount or
member replacement destroys local resources; StrictMode's effect probe cancels its
deferred teardown. Reloaded armed sessions retain server edits but need missing
originals picked again when local handles are gone. Server cancellation refuses
committed batches, so exit cleanup cannot cancel an upload that was armed meanwhile.

Admins and uploaders can drop files or whole folders anywhere on an empty or
populated timeline. Mantine's fullscreen dropzone appears only during a file
drag; ordinary print clicks still open the viewer. Its default directory reader
collects nested folders and every reader batch. The member's shell retains the
original `File` handles in a transient intake, navigates to Upload, reads the saved
batch first, then picks the staged files once through the existing declaration
and recovery rules. StrictMode shares the pending read, and a failed read leaves
the files available to Retry, including a failed recovery baseline read. A shared
intake drains later drops that arrive during declaration. If saved originals need
an explicit association, later drops wait until those choices are matched or
skipped, then join the draft without another drop. A fresh drop after a
completed or cancelled batch opens a new draft; files dropped during an active
transfer stay queued with an explanation until Upload more opens the next batch.
No file handles enter
URL history or persistent storage, and viewers have no timeline dropzone.

The surface composes selection, reading, draft, sending, partial, resume, refusal
and done states. Refused files remain in the declaration and receive specific
explanations without Retry. Resume shows the entire missing set, recognizes files
already up, asks for one ambiguous match at a time, and reports extra picks without
sending them. Reentry discards unstarted drafts instead of asking for their local
files again. Send what did arrive is offered only for an uploading batch. Done
uses the server summary and notification queue figures without claiming delivery;
a settled recovery explicitly says that it will appear without another email.

Visibility defaults to Everyone for a new form. Reading a live local draft restores
its rule even if local declaration counts remain after a failed arm; only a choice
made before picking in the currently mounted form takes precedence. Only and Except require a finished subject choice
before starting. Directory failure keeps the saved restriction and known subjects,
including the current member, with an unavailable notice and Retry. Upload directory
keys include the member id (`members`, `groups`, `tags`, `people` and `milestones`,
followed by `upload` and that id), so another member cannot receive former cached
choices. Milestone invalidation still uses the general prefix, including inactive
archive queries.

Draft form state survives a same-session read/check after a failed mutation; actions
freeze while the controller is busy. Drafts are keyed by actual session id, and the
shell key resets even an identically named session for another member. Label forms
stay mounted when closed, query vocabularies only while open, retain failed same-kind
text and reset when changing between tags and people. The occasion modal similarly
keeps confirmed or uncertain creation state across close/reopen. Modal dismissal
restores its action's focus; state changes use a restrained live announcement.
Operation errors use stable code/operation copy and a safe fallback, never raw
exception messages or schema diagnostics. Error prose outside a sheet uses panel
ink, including the unavailable state.

The browser suite exercises `/upload` against the real API and a local S3 stand-in,
including a distinct 264-file batch, tab-close recovery, silent settled retry,
unconfirmed completion loss, router navigation and addressed sign-in/reload.
Prototype comparisons use controlled API states and ordinary actions. A real-bucket
batch of phone media, an actual phone and an uncoached uploader remain acceptance
pending alongside the absent milestone and full directory routes.

Copy follows persisted authority: closing the tab stops browser-owned transfer
because File handles, workers and sending lanes live in that tab. Landed files and
the edit plan stay saved; navigating inside the signed-in app keeps sending alive.
Resume asks for missing originals rather than promising background work, and the
settled retry promises no second email. Completion copy describes a notification
being queued and never claims delivery. A failed completion report leaves a file
Not confirmed up, even when storage has its bytes.

### Upload surface state helpers

Surface 8's headless controller reads complete manifests through
`api/uploadsHelpers/getWholeUploadSessionFromSessionId/`. The adapter follows every cursor
with `UPLOAD_LIMITS.detailPageMax`, preserves state filters, merges rows by id
and orders them by manifest position. Repeated cursors and failed later pages
reject the whole operation, so the controller can retain its displayed complete
session. The detail's `pendingFiles` remains the server's capped reference list;
selection and recovery must use the complete `files` set.

`upload/createUploadSessionController/` defines the shared browser snapshot and its
completion reducer. Every successful complete answer, including a failed file,
updates that file's row. Within a run, terminal counts order aggregate progress;
confirmed done counts/bytes and evidence of settlement do not regress when
answers arrive late. An explicit retry must replace the detail with a fresh
server baseline before reducing its answers. The reducer makes no reads and
does not infer mail delivery or a finished engine run from settlement.

Recovery storage is optional and injectable. A versioned, member-scoped hint
contains only the last session id and known edit target ids. Restoring markers
requires a complete live session with matching edit ids, target counts and file
ids; undone, stale or ambiguous hints are ignored. Storage errors and corrupt
values never block upload or URL-addressed recovery. Hints never serialize
`File` handles, blobs or signed URLs, and never replay server edits. The controller
owns subscriptions, local handles, draft actions, recovery and transfer
coordination and persisted draft edits for the product route.
Manifest reads/publication live in `uploadManifestReadHelpers`; declaration
orchestration remains separate. Transfer events/progress buffering live in
`uploadTransferEventHelpers`, while transfer orchestration keeps ownership of the
engine lifetime. Date edits have their own `amendUploadDates` boundary.
These helpers support the routed surface and its draft-only removal action.

`createUploadSessionController` opens no draft when constructed or loaded. It
loads an addressed session, otherwise the current batch, otherwise a remembered
batch (including one the sweep settled). If no batch remains, it releases previous local
handles, pending picks, activity and counts before another pick can open a draft.
An explicit pick opens a draft, reads
headers in two lanes and declares every picked file in sequential chunks of 500. Outcomes pair to handles by `clientRef`; repeated `fileId` values retain
one transfer handle. Refusal stays the server's decision. Every successful chunk
refreshes the complete authoritative detail, including server capture days. A
later chunk or detail-read failure retains earlier saved rows and local handles;
`pickFiles([])` continues retained picks or the failed final read without opening
another batch. A failed page never publishes an incomplete manifest.

Draft files have individual trash controls and a bulk Remove action on the
selection toolbar. Each thumbnail's corner control has a compact 28px opaque
mark inside a transparent 48px touch target, keeping the photo visible without
making removal hard to tap. The photo and its remove control share the same
moving frame: tilt, enlargement and stacking keep them together when either
button is hovered or focused. Both freeze the chosen targets and ask for confirmation;
Cancel leaves the batch unchanged. Removal reads the complete server manifest
before updating file handles, activity, ticks, label targets and final upload
counts. Requests are bounded to the manifest chunk size. If a response is lost,
the controller reads the batch again; submission stays blocked until that read
succeeds. Removing the last file exposes the picker for a fresh selection.

Selection targets only waiting draft rows across the whole loaded manifest.
Day selection uses server `capturedOn`, includes offscreen rows, and makes no
request. Ticks never filter declaration or choose files for transfer. Conflicting
actions reject while an operation is busy; failures publish a structured error
and reject so callers can retain form input. An opening conflict loads and offers
the found batch, reports the conflict, and does not add the just-picked files.
Committed batches classify all re-picks against their complete manifest before
any declaration or retry. Unrelated extras stay outside the batch.

Recovery hashes files serially through the existing media worker client and
publishes checking counts. It indexes server hashes and name/size/type groups
once per check, avoiding repeated full-manifest scans for a large restored draft.
Picked types use the same normalization as initial declaration: an empty or
generic browser MIME type falls back to the filename extension, including HEIC,
HEIF and MOV. Both candidate lookup and competing-hash grouping use this declared
type, so re-selection reconnects the original row without bypassing recovery or
losing ambiguity checks when the browser reports different type metadata.
Exact hashes take precedence; name, size and type can
associate only a unique hashless candidate. Multiple candidates or different
picked hashes competing for the same hashless row require an explicit
`confirmRecoveryMatch` choice before any retry or transfer. The incoming side
shows the selected ordinal, filename, available capture metadata and a bounded
preview from the existing disposable queue. Its browser-only identity map is
never stored in recovery hints. Skip leaves the saved row missing so the user
can choose the original again. Draft extras are declared into this batch and
cleared from the unmatched list on success; committed extras remain outside it. Duplicate picked
hashes share one association and one queue entry. A failed hash read retains the
handles so `pickFiles([])` can check again. Reset, destroy and close terminate
the checking worker and invalidate late answers.

The headless controller can reassociate a draft with missing handles; the product
route discards such unstarted batches on reentry. Addressed
manifest entries omit `capturedAt`, preserving corrected capture days and the
server's existing edit plan; labels and visibility are never replayed. Only a
draft can declare unmatched extras, and it remains draft until explicit
`startUpload`. Uploading recovery re-declares only matched accepted rows and
retries failed rows. A manifest conflict reloads the addressed batch and switches
to settled recovery only when that fresh read proves settlement. Settled recovery
skips manifest writes and retries only retained failed ids. `retryMissingFiles`
also works from retained handles without declaring, saving visibility or arming.
Every retry replaces the completion baseline with a fresh authoritative read
before the engine runs. Its `isIncludedInEmail` flag survives preparation, byte
events, completions and the final read; false means the photograph appears
silently. The existing transfer action awaits one complete engine lifetime and
never chooses files from the ticked edit selection.

Snapshots remain stable between publications and listeners can unsubscribe.
Reset invalidates pending operations, releases handles and clears the remembered
batch. Destroy releases local work and listeners while preserving its recovery
pointer. Neither sends a server cancellation or commit. `cancelDraft` confirms
explicit cancellation; `discardDraft` releases unstarted local work immediately
and cancels its known or still-opening draft. The routed page and provider invoke
disposal before teardown, preserving any armed upload. API clients, header reader, engine, worker factory and storage
are injectable and default to their existing implementations.

`startUpload` validates visibility with the shared request schema, compares its
canonical mode/subjects with the saved rule, and saves only a changed rule before
arming. Everyone remains the default and empty Only/Except cannot arm. Setup
freezes draft controls; after commit, ticks and other draft mutations remain
locked. Transfer sends distinct accepted pending handles across the whole
manifest, independently of selection. A batch with no accepted files cannot
arm. The controller's recovery primitives can reassociate originals, but the
product intake discards stale unstarted drafts instead of offering draft recovery.
The existing engine still owns preparation, transport and retry policy.

The engine's injected complete delegate records and returns each unchanged API
answer, including failure completions. Server aggregate progress and browser wire
bytes remain separate: byte events publish once per animation frame, while
terminal activity publishes immediately. A duplicate gets its own marker, rather
than appearing as a lost photograph. An unanswered completion remains locally
unconfirmed until a later read establishes its outcome.

`startUpload` awaits the engine's entire promise and one complete final refresh;
there is no per-completion GET or progress polling. The engine may still make its
existing exceptional read after duplicate skips. A `settled` event carrying
`uploading` never claims success, and a server settlement during an active run
still shows Sending until the run ends. A failed final refresh preserves known
answers, reports the operation error and presents a partial/recovery state rather
than inventing a finished summary. Notification fields describe queued fan-out,
not delivery.

The setup lock and active run are separate. Loading the same session (or revisiting
without a session address) during a local run preserves that run and makes no
read. This lets the future signed-in provider keep sending during in-app
navigation. `closeBatch` remains available during transfer: it invalidates the
run's generation, cancels local work, then commits `intent: "close"` and reads any
remaining detail pages before publishing. Late completions and final reads from
the cancelled run cannot replace that close result. Reset and teardown also
cancel unpublished progress frames without changing the server plan.

Closing the browser tab during an armed upload stops its uploader; landed media and the server's edit
plan stay saved. The sending window prioritizes active rows, then recent
completions, within twelve visible rows. Intentional Cancel and Upload more
resets focus the new Upload heading. The sending surface must say: "Keep this tab open while they go
up. If you close it, what arrived and everything you added stay saved."

### Persisted draft edits (surface 8 foundation)

`applyEdits` captures the eligible ticked rows once, validates every request
against the shared contract, and saves labels sequentially. Existing tags and
people use their ids; new labels use `labelSnapshot`. Existing subjects,
milestones and new tags split into chunks at the shared 1,000-target cap. A
new-person action exceeding that cap rejects before any write, because splitting
it could create several people with the same name during ingest.

Each confirmed answer adds the actual server edit and its known targets to the
snapshot and optional recovery hint immediately. A later failure leaves earlier
success visible and keeps the selection for review. Ticks clear only after the
whole label submission succeeds; saved print markers are independent of ticks.
Forms can retain an explicit `applyEditAttempt` containing the submitted session,
labels and immutable target ids. Acknowledged chunks remain recorded for that
operation, so retrying the same attempt sends only unresolved chunks. The
controller-level single-label retry/Undo case is covered. Forms remove a name
once its complete action succeeds, including a retained partial attempt completed
on retry, even if a later label fails. Completion follows confirmed whole-action
results rather than edits added during only the latest submission. The ordinary
`applyEdits` entry point still captures the current selection for each call.
A lost response refreshes the authoritative plan and rejects with a review
message, without replaying the write or guessing the lost edit's targets. Reads
also reconcile same-session hints against live ids, counts and undone state.
`undoEdit` requires `canUndo`, replaces the saved row and removes known markers
only after confirmation, persisting their removal. Milestone writes and Undo
refresh day groups and mismatch data, including confirmed milestone chunks
followed by a later rejected edit. If that recovery read also fails, confirmed
edits and the original write error stay visible.

`UploadDraft` composes the sticky selection bar, saved plan, days, optional
undated sheet and visibility control. Its commit button counts the whole
accepted manifest independently of edit ticks. Photo and video counters use the
complete manifest's declared media types, including refused or cancelled media;
each counter is hidden at zero and uses the singular label at one. The overview
has no day counter. Saved-edit denominators still use the complete manifest,
including refusal rows; To upload sums declared bytes excluding refused and
cancelled rows. Commit-time session aggregates are not draft
pick totals. Start and milestone opening are callbacks from the routed Upload surface. The tag/person modal reads vocabularies
only when needed, preserves option counts and retains unsaved input for review.
Confirmed names stay out of pending input across later failed submissions;
unresolved names retain their original submitted targets and chunk progress.
Mantine alone owns initial focus via the input's `data-autofocus`, keeping an
immediately typed or pasted token intact.
Repeated person names require an explicit person-id choice inside this modal;
the shared `PeopleField` contract is unchanged. Failed directory queries show
unavailable plus Retry, while allowing explicitly typed new labels.

`amendDates` sends known waiting manifest rows in chunks of 500, without reading
local files again. It sends the chosen calendar day as
`YYYY-MM-DDT00:00:00.000Z`; clock preservation stays on the server. Every saved
chunk refreshes day groups, undated rows and milestone mismatches. Undated correction uses the server's undated file ids and waiting eligibility,
including non-null fallback capture days; it does not infer missing EXIF from a
null date. The ordinary fallback day grouping stays visible. Its native date input
uses the print's light control context in both schemes. Upload-local native segment
ink also keeps empty/filled and selected date text readable; disabled parts keep
their native styling. Setting a date
remains optional and never becomes a condition for uploading accepted files.
The product Upload route composes these draft components.

### Inline upload occasions (surface 8 foundation)

`UploadMilestoneModal` reads the entire paged occasion directory, showing its
names, inclusive date spans and per-viewer attachment counts. Creation persists
only on explicit form submission, before attachment or upload. The selection's
server capture days prefill the first and last day, and a one-day occasion sends
equal endpoints. Deliberate date overrides remain available. Waiting manifest
file ids are never sent as landed `itemIds`: attachment is a milestone draft edit
through an explicit submitted edit attempt, which refreshes the upload grouping.
Creation captures the original target ids before awaiting POST, including across
route exit/reentry; later selection changes never redirect that attachment.
Retrying the same existing occasion retains its original targets and acknowledged
chunks. Choosing a different existing occasion submits a new explicit action
against the current ticks, so the retained prior occasion cannot replace it.

Attachment clears the ticks and disables its original bulk trigger. After the
modal exits, lost focus returns to its captured, still-connected Upload heading.
Cancellation retains the enabled trigger, and deliberate focus is preserved.

A confirmed creation keeps its returned id if attachment fails, including when
this mounted modal closes and reopens. Retry attaches that same occasion to the original submitted ids without
another POST or temporarily replacing the current selection. A lost or malformed creation answer is uncertain: the form requires
a successful list reload and explicit review before another Create, and never
identifies an occasion by its potentially repeated name. A cancelled upload may
leave the explicitly created, empty occasion behind.

`UploadMilestonePrompts` offers every mismatch group. `UploadMilestoneFix` moves
waiting rows through the separate manifest-date writer, `amendDates`, rather than
the landed-item reconciliation route. A single-day occasion supplies its only day;
a span requires an initially empty native date input for every file. Clock
preservation remains server-owned. Widening PATCHes the occasion's inclusive span,
then reloads upload detail, without amending any manifest row. A failed read after
a confirmed widening retries the read without another PATCH. Changed occasion or
file dates invalidate inactive timeline and milestone queries. Leave dismisses
this browser's prompt only: attachments and capture days stay saved, and no
server mismatch acknowledgment is claimed. Reopening the draft may offer it again.

**Milestone helpers now use the shared route contracts.** The established
upload helper names and call shapes remain, with name/blurb limits of 200/280.
Pre-ingest upload creation omits optional landed `itemIds`; selected landed items
can use that shared field. The upload directory helper still follows every
opaque cursor and returns one complete directory. Failed requests retain form
or prompt inputs and offer explicit retry. Contract fixtures verify client
parsing and payloads, not live route acceptance. The product route composes these
controls; live milestone API acceptance remains pending. Identified browser
contract cases cover the forms, and the responsive matrix covers their designed
states.

### Asking and occasion client contracts

`api/removals/` validates request and response bodies with the shared schemas.
Blank optional asking words become null; declining requires nonempty responder
words. Withdrawal sends no JSON body. Deletion uses the existing item DELETE
client, which accepts a 204; deleting an occasion instead parses its 200 summary
and detached-item count. Structured API field errors remain available to forms.

The removal history and queue query factories include member identity in their
keys, with queue state kept separate from item history. Occasion detail,
directory, span-candidate and mismatch factories also include the member and
request branch. Their keys derive from the same paths and query strings sent to
same-origin `/api` routes, and reads pass TanStack Query's abort signal to fetch.
Paged reads retain opaque cursors, continue through empty pages with a cursor,
and stop only when `nextCursor` is null.

`milestoneItemsHelpers` applies attachment deltas and posts move or acknowledge
reconciliation using the shared batch contracts. Each attachment direction and
reconciliation batch caps at 500 items. These helpers use landed item IDs;
manifest file IDs remain upload draft identities.

Attachment-picker timeline selections can send `attachedToMilestoneId` and
`excludeAttached`. Picker callers must supply `memberId` in the options passed
to `makeTimelineQueryOptionsFromView` so different members cannot share its
cached items. Existing archive callers retain their ordinary timeline paths and keys.

### Capture-day previews (surface 8 foundation)

Upload-specific styles live beside their owning component, with prefixed class
names. Components with private child components, a stylesheet or companion
contracts form directory modules. The shared system and occasion styles remain
shared design-system assets. The session provider exposes separate controller
and preview hooks over the same owned resources.

`upload/createUploadPreviewQueue` owns a small sequential preview queue. It starts
one image worker lazily, reuses the engine's worker protocol and video poster
helper, and creates an object URL only for the thumbnail. Display and poster
blobs fall out of scope immediately. HEIC recycling follows
`appConfig.upload.heicWorkerRecycleCount`, including failed WASM attempts;
worker errors discard that worker before another image is prepared.

Development prebundles the worker-only `hash-wasm` and libheif glue dependencies
at startup. Discovering them on the first preview would otherwise let Vite reload
the page, losing every selected original's in-memory File handle. The worker and
HEIC decoder still load lazily in the browser. A JPEG already smaller than the
thumbnail target reuses its original URL after successful decoding: the upload
derivative policy deliberately skips an unnecessary re-encode at that size.

`getPreview(fileId)` returns a stable preparing, ready, or unavailable object
until that file changes, and undefined before request or after release or cache eviction.
`subscribe` publishes value changes, making the queue suitable for
`useSyncExternalStore`. The signed-in Upload provider owns the queue and calls `setPaused(isRunning)`
while transfer owns the preparation lanes. Pausing holds subsequent decodes; an active decode finishes.
Offscreen deactivation cancels unfinished interest but retains completed previews.
An inactive least-recently-used cache holds up to 100 entries and 24 MiB of
thumbnail bytes; active previews remain pinned. Reentry reuses the same URL
without decoding. Explicit release, removal, batch replacement and teardown
revoke thumbnails and invalidate late answers. Destroy returns synchronously; an already-started video's temporary
URL and hidden element are cleaned by the existing helper's poster timeout and
bounded hidden-tab wait, without holding provider teardown open.

`UploadDayGroup` renders capture days from the complete server manifest, twelve
prints initially and an explicit Show all control for the remaining prints.
Tick all always calls the controller for every eligible row on that day,
including unrendered rows. `UploadPrint` requests a preview when its observer
enters the viewport plus a 1,500px margin above and below, deactivates it
offscreen and releases it on unmount,
and uses server media for landed files. Intrinsic dimensions and seeded tilt
follow the shared Print styling. A mounted print also keeps its learned width
and height after cache eviction, so a portrait retains its shape if reentry
needs to prepare another thumbnail. This
geometry belongs to that file and does not carry into a replacement row.
Undecodable accepted originals stay tickable
as filename and media-kind placeholders: empty derivatives or a browser decode
error make a preview unavailable, never a refused original or upload failure.
Before preparation starts, a local original shows "Preparing preview". A draft
restored without its local originals asks to choose the files again to preview;
"Preview unavailable" is reserved for an attempted decode that actually failed.
Markers count only known live edit targets, independently of current ticks.
The routed Upload draft uses these components; real ready-preview reentry is
covered by the surface browser suite.

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

Admin adapters live in `adminGroupsHelpers/`, `adminMembersHelpers/`,
`observationHelpers/` and `updateAdminSettings/`. Query-option factories name
their input, and component-owned styles stay beside their owning component.
Route rendering tests and their shared fixtures live in
`routes/rendering/__tests__/`. Vite excludes test files and `__tests__`
directories from route generation.

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
  `jsonInit` beside it builds a request carrying a JSON body, for `POST`,
  `PATCH` and `PUT`; `PUT` is the method of the routes that replace something
  whole: an item's tag set, its people set, and a reaction.
- **One module per resource**, exporting TanStack Query `queryOptions` rather
  than hooks, and a plain function per write. Options can be used by a
  component, a route loader, or a prefetch; a hook can only be used by a
  component. `health.ts` is the example to copy.
- **`uploadsHelpers/uploadsHelpers.ts` serves the headless engine**: a plain
  function per upload route, each through `apiFetch` and parsed with the
  shared response schema, called outside React and outside a cache.

`src/queryClient.ts` retries a failed request once, except a 4xx: Memory
Shoebox talks to its own server on the same origin, so a same-origin failure
is usually real, and a 404, a 403 or a 429 is real by definition. Retrying
one only doubles the latency of a genuine refusal. The item permalink
overrides that rule with a stricter one of its own (§ Surfaces 3 and 4).

There is no configurable API base URL, by design. The API is always at `/api`
on the same origin: Fastify serves both in production, and the Vite dev server
proxies `/api` to port 8080 in development. See
[architecture.md](architecture.md#one-origin-one-deployment).

## Surface 10: asking for removal

`surfaces/Removal/` owns the item-scoped asking page. Its thin route retains
`$itemId_` and `hasOwnBar`, so asking replaces the item page and draws exactly
one bar. Item history supplies the preview and action authority without a
counted item GET. Missing, malformed, and inaccessible items use the same
unavailable view with no request controls or photograph link.

Own open history wins over the optional form; newest declined/withdrawn history
can open a fresh form through Ask again only when refreshed `canRequestRemoval`
allows it. Incoming request cards stay alongside own history, including people
who can both ask and answer. Creation keeps failed words, guards duplicate
presses, and recovers a lost response through the unique own open request.
`useRemovalAsk` captures item/member generations so an old completion cannot
announce itself in a new view. It blocks another write when authority cannot
be refreshed. Returned settlements can update presentation without granting
fresh ask authority. Confirmed deletion goes to the queue with a local history
entry confirmation. See [removals.md](removals.md#web-asking-and-own-history).

## Surface 15: removal requests

`surfaces/RemovalRequests/` owns the uploader/admin answer queue and shared
request cards, dialogs, and action controller. Its guarded route replaces the
product bar with Back to my account. Open and settled pages are separate,
member-scoped queries; server counts include unloaded history, duplicate IDs
produce one card, and empty pages with a cursor continue. Settled outcomes are
deleted, kept with the resolver's exact words, and withdrawn. Null media never
produces a broken image or a dead item link.

Cards take action authority exclusively from DTO capabilities. Delete uses the
existing item DELETE; decline requires 1 to 4,000 trimmed characters; withdrawal
addresses the request ID. Dialog text belongs to its request and survives a
failed answer and cancellation. Submitted answers lock dismissal and switching.
The visible-item alternative opens the existing visibility editor and preserves
the request. Dialogs use Mantine focus return, with a selected queue-tab fallback
when a confirmed answer removes the original trigger.

The controller dispatches immutable operations with public TanStack
`MutationObserver` instances, captured mutation identities, item/request write
scopes, and an immediate duplicate guard. Success refreshes both queue tabs and
item history; archive and item detail become stale without active item GETs.
Uncertain replies reconcile from the request's authorized queue scope or item
history before retrying and never resend automatically. Settled proof takes
precedence when queue reads straddle settlement. A requester with inaccessible
history whose request is outside queue scope sees uncertainty/refresh guidance
and cannot replay the write until an
authoritative read succeeds. See [removals.md](removals.md#web-answering-and-queue).

## Surface 14: occasions

`surfaces/Milestones/` owns the address-backed occasion directory and forms.
The thin `/milestones` route validates the selected ID and flow mode before
rendering, replaces the product bar with Back to my account, and uses a safe
route error for malformed addresses. Refresh and browser Back recover the saved
selection; unsaved form words remain local.

The directory follows opaque cursors, offers continuation through empty pages,
and deduplicates occasion IDs. Wrapping rows show server counts and capability
controls; creation alone uses the member role. Detail gates existing writes,
without guessing permissions from the creator. The shared date controls keep
upload behavior unchanged. Confirmed creates go to the saved `created` step;
edits with mismatches go to `fix`, while other edits return to the list. The saved
`created` step mounts individual span candidates; `attach` combines independently
paged attached/available timeline branches with the existing tag, person and date
filters. `fix` mounts the saved capture-date reconciliation controller. Empty occasions use a real band
preview.

Forms retain refused words, prevent duplicate writes, and block uncertain
replays until the member reviews the refreshed list. A failed background detail
read retains the active edit or picker and its unsaved intent while disabling
writes until current authority is usable. Confirmed save navigation precedes cache refresh,
so a failed refresh cannot suppress a known saved result. Delete is label-only,
requires refreshed authority after refusal/uncertainty, and uses the response's
name/count for its confirmation. Late completions cannot navigate an unmounted
member/occasion form. The shared cache invalidator refreshes occasion/archive
reads while marking supplied item details stale without an item GET. See
[milestones.md](milestones.md#web-list-and-forms).

Attachment choices retain first-observed baselines across narrowing and refresh.
Only explicit changed item IDs enter the delta, with 500-ID direction limits
checked before requests. Bursts contribute their returned representative identity,
never inferred siblings, and itemless days add no choices. No-change Save makes
no PATCH; confirmed deltas show actual counts and offer date fixing. Cancel
retains the occasion. Picker facets and vocabularies accept optional member
identity, preserving ordinary callers and keeping typed `q` on vocabulary reads.

After an unconfirmed attachment answer, only another deliberate Save starts
recovery: current occasion detail plus unfiltered paginated `scope=all` candidates
verify every original uncertain-operation and current pending-choice identity.
Already-applied changes drop out, later toggles preserve current intent, and
unavailable IDs or repeated recovery cursors block writes. The hook never opens
item detail or records seen state for selection or recovery. These extra reads
may keep saving blocked until visibility is restored. See
[milestones.md](milestones.md#web-attachment-choices).

Attachment Save rechecks the member-scoped detail query after recovery, so
intervening failed or active detail reads block the final write. Picker-owned
thumbnail error handling keeps an unavailable photograph selectable without
rendering the failed image, including retained entries after read failures.

## Development server

`pnpm dev:web` starts Vite on **http://localhost:38473** with `strictPort`
enabled, so an occupied port produces an error instead of changing the origin. `/api` is proxied to `http://localhost:8080`,
so the API server has to be running too. `pnpm dev` from the repository root
starts both. The upload harness is at
**http://localhost:38473/upload-proof.html**; see § The upload engine.

## Tests

Vitest, running in `jsdom` with Testing Library
(`@testing-library/react`, `@testing-library/jest-dom`,
`@testing-library/user-event`), because the design system's thirteen
components are tested by rendering them.

`vitest.setup.ts` shims five things jsdom does not provide. The first three
are needed for Mantine's dropdowns and menus to render in a test at all:

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

The other two are stubs of the same kind: **`window.IntersectionObserver`**,
which the day stream's paging sentinel creates, and **`document.fonts`**,
which Mantine's autosizing `Textarea` (the comment editor) listens on to
measure itself again once a web font arrives. Neither ever fires.

**The harness records what was sent, not only where.**
`testing/fetchStubHelpers` stubs `fetch` with canned answers keyed by
`"METHOD /path"` and records every request with its method, address and body.
It needs neither React nor the router, so the API modules' own suites use it
directly. `testing/surfaceHarness` builds on it for a rendered surface, and
reads the record back as lines (`recordedRequests`, and
`getRecordedCountFromLine` for how often one was sent) and as bodies
(`getRecordedBodyFromRequest`). The item page needs both, because it has a
read and a write at one address: `GET /api/items/:itemId` counts an open and
`PATCH /api/items/:itemId` saves a description, and most of its tests assert
what a write sent, such as a people set carrying a known person by id and a
new one by name. `testing/itemFixtureHelpers` builds an `ItemDetail`, a video,
a burst's frames and the three sets of capabilities a viewer, another uploader
and the item's own uploader hold; `testing/itemHarnessHelpers` is the item
route's canned server, answering `GET /api/members` and `GET /api/groups` with
the `404` they answer for now; `testing/itemWriteTestHelpers` is what each
write hook's own suite renders it with, a client already holding the item.
`testing/callQueryFn` runs a `queryOptions` result's query function directly,
which is how the API modules' tests check what a response parses into.

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

### Saved occasion date decisions

`MilestoneReconcile` consumes saved detail and the current viewer, with `onDone`
and `onOtherMilestone(milestoneId)` navigation callbacks. `useMilestoneReconcile`
owns member-scoped detail/mismatch authority, item-keyed date choices, paged
500-item batches and distinct move, widen and acknowledge submissions. The
controlled `system/MilestoneFix` has parameterless action callbacks and receives
targets, total mismatch count, server widening metadata, pending state and
item-keyed errors. Its owned rows stack date controls at narrow widths and
replace failed thumbnails with unavailable text.

One-day moves contain an explicit target for every item. Multi-day choices start
blank and remain blank until chosen. Move/acknowledge apply only to displayed IDs;
widening uses the server's full-set span. Fresh preflight and a synchronous final
query-state/identity/capability check prevent stale authority writes. The final
check also validates the current cached mismatch identities, whole-set widening
span and page/detail spans against the submission, including successful
background reads that finish after mismatch preflight. Widen additionally requires
all cached pages to agree on the whole-set widening span. Failed
background reads preserve choices, explicit refresh restores authority, and an
uncertain answer triggers read recovery without automatic replay. Changed spans, newly changed widening extrema or inconsistent page/detail
spans require review, as do attachment conflicts before another deliberate action.
Confirmed results show returned counts, refreshed zero completes the fix, and
returned `raisedElsewhere` occasions have named onward controls. Cache invalidation
uses the existing occasion invalidator, including movement's bursts and item
staleness without automatic item GETs. The upload-owned fix remains unchanged.

Step 8b acceptance covers real three-person removal/withdrawal and occasion
changes, keyboard traversal, all prototype states in both schemes, equivalent
reflow and actual native 200% zoom. See [e2e.md](e2e.md) for evidence boundaries
and command results. Attachment filtering remains the full tag/person/date
query grammar, placed after the selected occasion heading. White sheets keep
blue separation from the directory. Failed picker and queue thumbnails use
local unavailable fallbacks; only an owning failed picker transfers focus.
Decline dialogs initially focus the required reply field.

### Asking and occasion final-review boundaries

Removal action feedback lives above the visibility-dependent history content.
A lost withdrawal response followed by unavailable history keeps its uncertainty
and a read-only retry visible without media or dead links. Shared request cards
receive the configured timezone from both route owners for their English-month
request, capture and settlement dates.

Occasion controllers share `runMilestoneWrite`, a QueryClient-owned target lock
that refuses overlapping edits, deletion, attachments and reconciliation even
after remount. It does not queue or replay writes. Preflights retain current
ownership and capability guards. Local/schema and server field validation now
attach to the form controls. Reconciliation invalidates returned affected
occasions before onward navigation uses their cached detail/mismatches, retaining
member isolation and the no-extra-item-open rule. Outside-sheet recovery and
paging controls use panel variants, with wrapped long reconciliation labels.

## Final acceptance and reference retirement

The five administrative routes are implemented against the existing shared
contracts. Member mutations separate a committed write from failed account
reconciliation: invitations retain their filled, disabled form and queued
status; recovery survives route changes and retries reads only. Current-device
revocation and self-removal clear the session and navigate to sign-in without
another account refresh. Groups retain directional Only/Except deletion consent.

At narrow widths Account device rows expose each labeled fact and the action
without a horizontal scroller. Each timeline day owns its sticky summary, so
milestones stop before the next day and archive footer. The removal request form
preserves its private optional reason and normalizes asking with the drawn
explanation and Flag action. No request behavior or server contract changed.

The former reference application is retired. Production owns its theme, tokens,
primitives and routes; tests own the generated cartoon media. See the lasting
[step 9 verification](prds/2026-09-27-memory-shoebox/plan/step-9-verification.md)
for the eighteen-surface comparisons, native zoom evidence and explicit limits.

### Administrative refresh recovery

Fresh canonical Settings values update pristine drafts and saved baselines.
Acknowledged saves also update the accepted-value marker, so another administrator
restoring the original value before the reconciliation read completes updates the
pristine field and its baseline on unblock. All four rendered draft owners cover
that successful-save round trip; the name field also verifies its Cancel baseline.
Deliberate edits remain local when another response arrives, and pending operations
finish before adopting a newer baseline. Timezone confirmation belongs to its
candidate and saved baseline: changing the baseline discards old consent, including
an older preview that finishes later. Returning to a former timezone does not
revive its old confirmation.

Presence directory, passive item-viewer reports and Changes treat 401/403 reads as
authority transitions. Cached privileged records are hidden immediately while the
current account and route guards reconcile. If that account recheck fails, an
explicit account-check retry remains available. Ordinary refresh faults retain
last-known rows with stale feedback and read-only Retry; older Changes-page faults
retain their existing cursor retry. Passive reports still never call the counting
item-detail endpoint. Group committed-write recovery now survives ordinary inactive
query collection for the account lifetime, just like Members and Settings.

The existing bare presence endpoint also supports a non-admin reading their own
record. After demotion it can therefore return a successful self-only response,
which replaces the old directory rows without a refusal or account recheck.
That 200 response does not assert an administrator role: cached navigation identity
can remain until the normal account refresh, navigation or a refused read reconciles
it. The client does not infer authority from the number of returned rows.

### Authorized step 9 follow-up

The Settings save round-trip defect and archive seed default are corrected in the
bounded follow-up. Juan Pablo accepted the recorded incomplete keyboard/native
zoom traversal and unverified VoiceOver limits. This acceptance closes the user
acceptance gate without claiming additional screen-reader or native checks.
Provider delivery, email-client transformations, health-only mail diagnosis and
the earlier family/phone trial qualifications remain as recorded in
[step 9 verification](prds/2026-09-27-memory-shoebox/plan/step-9-verification.md).
