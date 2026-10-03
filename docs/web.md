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
`surfaces/Item/`: `ItemSurface` fetches and chooses between loading, not here,
failed and the viewer; `ItemViewer` draws two columns, the frame, the line
under it, its reaction and its run (or on a video, the pinning sheet) on the
left, and the thread and the sheets on the right; `itemWrites/` holds every
write and `itemCopy/` every string that says "photograph" or "video". The
step design is
[`superpowers/specs/2026-10-02-item-viewer-design.md`](superpowers/specs/2026-10-02-item-viewer-design.md).

The pile links in: a print and a fanned frame both open the viewer, and
`api/bursts` now parses the `BurstFrameRef` that step 5a's frames route really
answers with, where step 5b had written it against an `ItemSummary` guess.

**The route has no loader and must not grow one.** `GET /api/items/:itemId`
counts an open every time it runs, surface 17 prints that count, and the
router preloads a route's loader whenever a pointer rests on a link to it
(`defaultPreload: "intent"`). A loader would count an open for every print and
every frame a mouse crossed. The surface fetches with `useQuery` instead, and a
test pins it: preloading an item link sends nothing. An address that is not a
UUID is not asked about at all, since the only answer is "not here".

**One query, refetched on arrival and at no other time.** It refetches on
mount, because arriving at a photograph again is opening it again, and never on
window focus or on reconnecting, because neither is. No timer re-signs its
media either: an image already drawn keeps its bytes, and leaving and coming
back already refetches. It carries its own retry instead of the client's: once,
and only when the server itself failed with a 5xx. A body that fails to parse
was answered `200` and counted, so asking again would count one arrival twice.

**Every write lands in the cache, and nothing invalidates the item.** The five
writes that answer with a whole `ItemDetail` (the description, the tags, the
people, who can see it, and the capture date) replace the entry; comments and
reactions answer with something smaller, which `itemWrites/itemCacheUpdates/`
folds in. Invalidating would be a refetch, and a refetch is an open. Every
write on one item shares one mutation scope, for the reason surface 9's two
`PATCH /api/me` writes do: two whole-item answers landing out of order would
revert each other. Every write also carries a `mutationKey` naming its ids,
because a re-render hands its new options to a mutation still pending unless
the key has changed, and the viewer moves along a burst without remounting:
without the ids in the key, a write queued on one frame would be sent to the
next. A `403` or `404` on a write refetches the item once, so the page stops
offering what the server will refuse, but only while something is still
showing it, since a refusal landing after somebody has left would count an open
nobody made.

**Reactions are written before the request goes, and the latest tap wins.** A
tap moves the viewer's own row in the cache in `onMutate` and a failure moves
it back, because a reaction that waits for a round trip gets tapped twice. A
counter says which tap is the latest, and only that one writes its outcome,
onto whatever the cache holds by then. The scope delays a tap's request but not
its `onMutate`, so an earlier save's answer can land on top of the optimistic
row, and comparing the cache with the tap would then mistake the tap's own
answer for a stale one. **A comment's send and the item's delete ignore a
second press** while the first is in flight: `isPending` reaches the component
a macrotask after `mutate`, and a double press inside that window would post
the comment twice or send a second `DELETE`.

**The pile is marked stale, not refetched.** After every write that changes
what the pile draws (the five whole-item writes and the delete), the timeline,
its facets, both vocabularies and the burst fans are invalidated with
`refetchType: "none"`. Nothing refetches under the viewer, not even a
vocabulary an open editor is reading; each refetches when it is next mounted,
which is how the pile shows the new lock, the new day or the missing print once
somebody returns to it. Comments and reactions leave it alone, because the pile
draws neither.

**Controls are drawn from `ItemCapabilities` and never from the role.** The
split is by consequence (`conventions.md` § Who may change an item): any
uploader may tag, name people and describe; only the item's own uploader or an
admin may change who sees it, correct its date or delete it; and the way to ask
for it to come down is drawn only when `canRequestRemoval` says so. `me.role`
is not read anywhere on the surface, and the capabilities test holds that both
ways: an admin's role with a viewer's capabilities draws nothing, and a
viewer's role with every capability draws everything.

**The burst strip is one tab stop.** The open frame takes Tab; the arrow keys,
Home and End move along the rest, and a key with a modifier is left to the
browser, so Alt and the left arrow is still Back. Each frame is a link named
for its position ("Frame 7 of 45") over a decorative image, and the strip is a
`nav` labelled by its visible caption ("45 frames over 28 seconds"). A move
replaces the history entry, so Back leaves the burst rather than stepping back
through it, and leaves the page's scroll alone, so the frame stays under the
reader; the strip scrolls itself, never the page, to centre the open frame. It
draws from `burstFrames`, which the server caps at sixty, or for a longer run
from the frames route, and never from a sibling's permalink, which would be an
open per thumbnail. **It latches nothing itself**: the item's own `GET` writes
`first_opened_at` for the item and `first_seen_at` for every visible sibling
(`server.md` § The item slice).

**A move along the burst keeps the left column.** While the next frame loads,
the previous item stays drawn (`placeholderData`) and the left column is not
remounted, so the strip keeps keyboard focus across the move and the frame
swaps when the answer lands. Not once that frame has failed, though: trying it
again draws the loading state, because the previous item is not what is at
this address. The right column is keyed by item, because a half-typed comment
or an open editor belongs to one item, and on the left so are the reaction row
and the video.

**The video transport is a slider whose marks come from the contract.** The
duration is `media.durationMs`, so every mark is where it belongs on first
paint instead of jumping once metadata loads, and the clock, the slider and
the marks share that one scale; the element's own duration is only the
fallback for a payload without one. The scrubber is a `role="slider"` covering
the whole bar, a second on the arrows, a tenth of the video on Page Up and Page
Down and the two ends on Home and End, so a press anywhere seeks and nothing
needs dragging. The marks sit in a layer over it rather than inside it, because
a slider's children are presentational to assistive technology. The position
and the pin are held above both columns (`useVideoTransport`), since the left
column draws the bar and the pin button and the right one the composer and the
stamps, and both start again for each item; the `<video>` itself is keyed by
item, because swapping a loaded video's sources does not load the new clip.
Nothing autoplays.

**Tagging saves as it changes.** Every add or remove sends the whole set and
nothing is pressed, and a failure puts the field back to what the server has.
The people field holds names, because it accepts one the archive has never
heard of, so a name becomes a person only as its request goes out: matched
trimmed, composed and case-insensitively against the item's own people, then
the people that editor's earlier saves were answered with, then the directory.
A name somebody already carries goes as their id and anything else as a new
name, so "mateo " is Mateo and never a second Mateo, even after he has been
tagged, taken off and tagged again. `PeopleField`'s `anyone` mode offers each
known name once, because two people can share a name and the combobox refuses
a repeated option, and offers the typed text itself as a real option, so a new
name can be confirmed with the pointer or the arrow keys as well as Enter.

**People and tags are links into the pile filtered by them** (`ChipLink`),
because a person is a filter rather than a profile and a chip with nothing to
do would be a focusable button that does nothing. `Chip` now emits
`aria-pressed` only when `active` is passed, so a chip that is an action
("+ Tag somebody") is announced as a plain button rather than as a toggle that
is off.

**The visibility picker is written against step 8a.** `api/members` and
`api/groups` parse both shapes of those routes with schemas local to
`apps/web`, because 8a owns the shared ones and will replace these. Each has a
cache key of its own (`["members", "picker"]`, `["groups", "picker"]`), so 8a's
admin queries, which read whole rows, never share an entry with this stripped
shape. The lists are fetched only when the editor opens. Until 8a merges both
answer `404`, and the picker offers the people and groups the rule already
names plus the viewer, so "Everyone" and "Only me" work end to end. Saving
finds or creates the rule and then repoints the item, skipping the repoint
when the rule found is the one the item already has, and sends nothing at all
when nothing changed.

**Focus goes back to the opener when an editor closes**, by Done, Cancel or a
save. The people, tags, visibility and date editors are each drawn in place of
the button that opens them, and the editor unmounting would otherwise drop
focus on the page behind. A comment's editor gives focus back to its Edit
button the same way.

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
