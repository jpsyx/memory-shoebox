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
item routes step 5a delivered. **Eight surfaces are live: sign in (surface 1),
the timeline (2), one photo (3), one video (4), the empty archive (5), filter
and search (6), the people directory (7) and My account (9)**; the other nine
routes still render a placeholder inside the real chrome, and a later step
replaces each one.

## Layout

```
apps/web/
├── index.html                the single HTML document
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
    │   ├── Item/                  surfaces 3 and 4: one route, the viewer, the
    │                              strip, the thread, the sheets, every write
    │   ├── People/                surface 7: the directory and one card
    │   └── Account/               surface 9: one sheet per section
    ├── session/
    │   ├── requireSignedIn/       the route guard
    │   └── firstSignIn/           the one-time line after a first sign-in
    ├── api/
    │   ├── client/client.ts       apiFetch, jsonInit and ApiRequestError
    │   ├── auth/, me/, publicSettings/   one module per resource
    │   ├── timeline/              the selection, the day stream, the rail
    │   ├── vocabularies/          the facets and the two vocabularies
    │   ├── seen/seen.ts           the latch, and what suppresses it
    │   ├── bursts/bursts.ts       a burst's frames, as BurstFrameRef
    │   ├── items/                 the permalink, and the writes that answer with it
    │   ├── comments/              say something, edit it, take it down
    │   ├── reactions/             set or clear mine, on an item or a comment
    │   ├── visibilityRules/       find or create the rule an item is pointed at
    │   ├── members/, groups/      the picker's lists, against step 8a's contract
    │   └── health.ts              the worked example
    ├── testing/                  fixture builders, the surface harness, the
    │                             item fixtures and harness, and callQueryFn
    ├── routes/                   file-based routes: two shells, five live, nine placeholders
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
lifted out of `prototypes/src/system/` in step 3b: most were retyped against
the frozen DTOs in `packages/shared` in the process (a handful, like `Pile`
and `ProductBar`, still declare a small local prop type for a shape that has
not been frozen yet), and every read of a prototype fixture module became a
prop instead.

`src/system/labelHelpers/` holds every string derived from a number or a date
(a count, a relative time, a date range), kept in one place so the same value
never gets formatted two different ways in two components.

`src/system/FocusKeepingButton/` is the button for anything pressed and then
busy, such as Send or a Save: it says it is unavailable without `disabled`,
so it keeps focus (§ Surfaces 3 and 4). `src/system/focus.ts` holds the two
questions asked before focus is moved once something has finished: whether
focus is lost, and whether it is still inside a given element.

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
"photograph" or "video" in `itemCopy/`. The pile links in from a print and from
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
  `attemptsRemaining` on a sign-in code). `message` is for a log or a
  fallback and is never the primary UI copy. A 204 response has no body, so
  `apiFetch` returns `undefined` for it rather than trying to parse one.
  `jsonInit` beside it builds a request carrying a JSON body, for `POST`,
  `PATCH` and `PUT`; `PUT` is the method of the routes that replace something
  whole: an item's tag set, its people set, and a reaction.
- **One module per resource**, exporting TanStack Query `queryOptions` rather
  than hooks, and a plain function per write. Options can be used by a
  component, a route loader, or a prefetch; a hook can only be used by a
  component. `health.ts` is the example to copy.

`src/queryClient.ts` retries a failed request once, except a 4xx: Memory
Shoebox talks to its own server on the same origin, so a same-origin failure
is usually real, and a 404, a 403 or a 429 is real by definition. Retrying
one only doubles the latency of a genuine refusal. The item permalink
overrides that rule with a stricter one of its own (§ Surfaces 3 and 4).

There is no configurable API base URL, by design. The API is always at `/api`
on the same origin: Fastify serves both in production, and the Vite dev server
proxies `/api` to port 8080 in development. See
[architecture.md](architecture.md#one-origin-one-deployment).

## Development server

`pnpm dev:web` starts Vite on **http://localhost:5173** with `strictPort`
behavior left at Vite's default. `/api` is proxied to `http://localhost:8080`,
so the API server has to be running too. `pnpm dev` from the repository root
starts both.

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

**The harness records what was sent, not only where.** `testing/surfaceHarness`
stubs `fetch` with canned answers keyed by `"METHOD /path"`, and records each
request's method with its address (`recordedRequests`) and its body
(`recordedBodyOf`). The item page needs both, because it has a read and a
write at one address: `GET /api/items/:itemId` counts an open and
`PATCH /api/items/:itemId` saves a description, and most of its tests assert
what a write sent, such as a people set carrying a known person by id and a
new one by name. `testing/itemFixtures` builds an `ItemDetail`, a video, a
burst's frames and the three sets of capabilities a viewer, another uploader
and the item's own uploader hold; `testing/itemHarness` is the item route's
canned server, answering `GET /api/members` and `GET /api/groups` with the
`404` they are until step 8a. `testing/callQueryFn` runs a `queryOptions`
result's query function directly, which is how the API modules' tests check
what a response parses into.

**There is a second layer above this one.** Vitest renders a component against
a mocked `apiFetch`; it cannot tell you that a cookie survived a reload, that
a device signed out in one browser stops working in another, or that a code
minted by the server can be read out of an email and typed in. Those run in a
real browser against a real Fastify process, in `e2e/`. See
[e2e.md](e2e.md). They are `pnpm test:e2e`, not part of `pnpm check`.
