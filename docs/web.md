# The web app (`apps/web`)

All stored-media surfaces use explicit availability. Timeline and burst prints,
people, occasions, removal requests, completed uploads and the selected viewer
share `system/MediaPlaceholder`: missing previews retain numeric oriented
layout and their accessible description. Host media boxes retain their fixed
sibling-strip size, selected-view height cap and compact thumbnail bounds,
including for portrait placeholders. Fixed sibling boxes use short, wrapped
status labels. Pending previews say "Preparing
preview"; unavailable previews say "Preview unavailable". Catalog processing
state distinguishes preparing media from unavailable representations.
Photo image elements consume nullable image roles; videos consume the
separate playback source and its catalog MIME type. The shared selector chooses
display candidates for the surface, viewport and local format capabilities,
retaining economical original and thumbnail fallbacks. [items.md](items.md) and
[archive.md](archive.md#explicit-media-availability) describe the read purposes.

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

## Motion

The presentation layer connects timeline prints to their viewer, unfolds burst
fans, and animates the arrangement preview. Uploads, selections and conversation
notes share a brief paper-settling language. It adds no data requests or saved
state. See [motion.md](motion.md) for lifecycles, accessibility and fallbacks,
and [motion-review.md](motion-review.md) for the app-wide assessment.

## Product terminology

The chronological archive is called the **timeline** throughout the interface,
including navigation, upload completion, settings and viewing activity. Internal
`Pile` components and the persisted `pile.arrangement` setting retain their
existing names; they describe rendering and storage rather than product copy.

## Interface copy

Production screens use concise labels, status messages and instructions that
help members complete an action. Design rationale and descriptive review notes
in prototypes are reference material, not interface copy. The timeline, people
directory, item details, upload flow and administration screens omit that
commentary and redundant introductions.

Keep guidance that affects a decision: visibility and admin access, notification
recipients, destructive consequences, input requirements and error recovery.
Date-source labels and automatic image-description previews remain useful in
their editors. Empty comment threads need only their heading and composer;
neither comments nor reactions need an explanation of their role in the product.

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
    │   ├── bootstrap/             current navigation authority in one read
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

`src/main.tsx` imports Mantine defaults in the supplied `mantine` CSS layer.
Product tokens, global rules and component modules remain unlayered, so their
overrides retain precedence when Vite extracts shared component CSS before
the entry stylesheet. Source import order alone does not guarantee the order
of emitted shared stylesheets. The imports are:

1. `@mantine/core/styles.layer.css`, `@mantine/dates/styles.layer.css` and
   `@mantine/dropzone/styles.layer.css`, Mantine's own layered sheets.
2. `src/styles/fonts.css`, the `@font-face` blocks.
3. `src/styles/tokens/tokens.css`, the custom properties those fonts and every
   colour are written in terms of.
4. `src/styles/global.css`, which puts the product's focus ring on every
   Mantine control and field in place of Mantine's own, and needs the tokens
   above it to exist. Its unlayered control selectors override the vendor
   layer regardless of stylesheet extraction order.

Unlayered product rules still use their own specificity and cascade order.
The vendor layer establishes only the priority of product adaptations over
Mantine defaults; it does not replace the product's token or surface scopes.

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
in `e2e/item/__tests__/item.contrast.spec.ts`, so surfaces 2, 5, 6 and 7 are still
unswept, and it measures their text rather than their borders and outlines
(`docs/e2e.md` § The contrast sweep).

**`data-pile`** carries the pile's arrangement (`tidy` or `messy`) the same
way: an attribute on the signed-in shell, read by `system.module.css` wherever
the arrangement changes the pile's layout. The shell binds the saved arrangement
from the current account settings, so a local save or a remote settings refresh
updates the archive as well as the settings preview.

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

`src/system/Select/Select.tsx` wraps Mantine's `Select` for shared single-choice
menus: Jump to, roles, timezone, milestone dates, upload recovery, and playback
speed. It uses the shared input and dropdown theme, accepts
Mantine props, and reports the selected string through `onChange`. Choices
cannot be cleared by clicking the current option again; a deliberate empty
option remains available where the form needs one. The timezone field is
searchable. Playback speed opens upward inside the fullscreen player and
scrolls its options when the player's height is limited.

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

The signed-in product bar renders the Shoebox title as a home link to `/`.
Following it returns to the timeline with search and filters cleared, using
client-side routing on the current origin. Sign-in and setup titles remain
plain text, and surfaces with their own back bar keep that navigation.
The timeline renders its **Select photos** entry beside **Find** through a
header portal target. Selection state and the action remain owned by the
timeline, so navigating to another surface removes the action automatically.
The empty target takes no space in other pages' headers.

**First-run setup.** `/setup` is an anonymous narrow form only while the
catalog contains no member rows; `/setup/invite` is a private active-admin
invitation step. Each actual navigation reads one fresh `/api/bootstrap`,
including its guard redirect chain and navigation after a speculative preload
(which performs no bootstrap read). A one-use redirect receipt is claimed by a
root-independent router navigation hook; independent navigation/retry discards
it even before the destination consumes it. The response seeds account and
progress caches before the destination
mounts. Failed authority reads remain explicit retry states, and ordinary
anonymous deep links preserve their destination. See [setup.md](setup.md).

**The route map is flat.** The routes cover the product's web surfaces;
there is no `/admin` prefix, because role is an attribute of a destination
and not a path segment. Two surfaces share a route each: `/items/$itemId`
covers both a photo and a video, since a link cannot know which until the
item has been fetched, and `/` covers the timeline, the empty archive and
the filtered pile, since a filter is a search parameter on the same pile
rather than a different page.

**One query answers the guard and My account.** `src/api/me/me.ts` exports
`meQueryOptions` for `GET /api/me`, and that single cache entry is what
the root `beforeLoad` seeds from the current bootstrap and the account surface reads. The app
guard narrows the root's account result without fetching a second account.
There is no separate "session" fetch: the account response already carries the member,
their role, their four notification switches and the three instance settings
the shell draws with, so a reload has the same values a fresh sign-in does.

Account and anonymous public settings reads have 30-second freshness. One root
synchronization owner refreshes every 30 seconds while the tab is visible and
on focus, reconnect, or returning to visibility. A successful settings save
also broadcasts a same-origin change notification, containing no settings or
member data. Browsers without BroadcastChannel retain polling and browser-event
refresh. The owner compares settings values before invalidating route context
and dependent queries; unchanged polling responses do not rerun the router.
Admins also refresh the existing private settings endpoint, including when the
settings page is closed, so changes to the URL and sender update open pristine
forms and the global mail diagnosis. Dirty drafts keep their input.

Reads are serialized and account/settings writes cancel earlier reads, so late
responses cannot overwrite a saved result. Anonymous clients refresh only their
public settings after the account read; losing authority removes private caches.
A transient navigation bootstrap failure while a settings or group save awaits
reconciliation retains the committed snapshot in an explicit refresh-only recovery
screen. An anonymous bootstrap returns a null account and follows the guard redirect.
QueryClient-owned cache subscriptions protect account writes independently of
the fallible root layout. Pending writes and their successful account
publications cancel older bootstrap reads, including while root recovery is
mounted. Every successful non-bootstrap account publication advances that fence,
even after an authority refusal removes a still-running mutation from the cache.
This leaves mutation clearing and queued-write behavior unchanged. An ordinary
account poll that publishes during navigation can also cancel that read and
require an explicit retry, even if the account data is unchanged. The same
client-owned publication listener retires private queries on identity/role changes
during recovery, using the settings observer's shared
retirement policy. A per-client write generation also rejects a response that already
finished fetching but has not yet seeded the account cache. Cancellation stays
retryable rather than restoring stale identity. Timezone changes
invalidate filter and people queries along with the other dated views, and ask
the member's upload controller to refresh metadata. That action keeps its
File handles, byte progress and active engine; an older metadata response is
discarded and reread if completion has advanced the session. Failed remote
dependent refreshes remain pending and retry on a later successful account read,
even when its settings are unchanged. Retries are serialized, do not loop
immediately on failure, and are cleared when authority changes or the owner
is disposed. A remote timezone change observed during committed local recovery
also stays pending when that local save does not cover it. After recovery clears,
the next successful account read reconciles it even if polling returns the same
timezone; the local save's own timezone observation needs no duplicate work.

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
intersection observer, and `windowing/TimelineRows` draws measured day
headers, grid rows and burst fan lines. `DayBlock` remains the non-windowed day
composition for other callers. Its grid fills each row before wrapping, preserving photo proportions
and the thumbnail scale on sparse days. Expanded bursts and milestone content
span the full width. The jump anchor takes no photo slot. `JumpRail` moves the
whole field with labels such as `15 sep · 4 photos · 4 videos`. Counts come
from the full filtered, viewer-visible rail response, including individual
burst frames and zero-count milestone days. `FilterSheet` and `FilterChips` are
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

The timeline retains at most five atomic-day pages. Server-issued
`previousCursor` restores newer eligible days after older-direction eviction;
both directions still stop at the effective jump boundary, and every page is
ordered newest first. `useTimelineData` exposes guarded `onReachEnd` and
`onReachStart` callbacks that share the query's actual fetch slot with refresh.
Start and end sentinels request one measured viewport ahead through those guards.
They disconnect while paging or exact-cursor recovery owns the query, then reobserve
on idle so an already intersecting sentinel can request the next page without
requiring another scroll. Retired observer callbacks cannot rearm an old view.
TanStack Virtual mounts a measured viewport on either side of the reading
position, including rows inside a very large atomic day or expanded burst.
Intrinsic image proportions and original per-day scatter seeds survive row
slicing. Lightweight day shells retain jump targets; measured rows do not use
content-visibility because skipped geometry cannot be measured reliably.

Each retained web page carries `selectionResultCount`, copied from the view's
uncursored response. It preserves the filtered count through eviction and
remount without falling back to facets outside the jump. A retained-page
refresh asks for `includeResultCount=true` only on its first cursor request,
then carries that fresh count across the sequential fetch. Ordinary paging
does not recount. Canceled and replacement refreshes have separate signal-owned
count state. A weak signal key holds only the scalar count: retaining an older
reader cannot retain a completed fetch signal and Query's prior pages through
its abort listeners. This scalar does not change any page's metadata timestamp.

If a retained refresh head becomes empty after a deletion or selection edit,
the query retries that head once without a cursor in the same effective view.
It then follows the restarted page's ordinary older cursors, including the
surviving day at the old exclusive boundary. A web-only `requestCursor` records
each page's actual request. The public `structuralSharing` callback normalizes
`pageParams` from that provenance before publishing the cache result and keeps
unchanged references through `replaceEqualDeep`. A saved containing-page cursor
and subsequent refresh therefore replay the actual page source. Manual cache
seeds without provenance retain their existing opaque parameter.

The exceptional empty-head recovery costs one extra page request and, for a
filtered view, a second authoritative count on the uncursored retry. It retries
only once; an empty or fully restricted effective selection remains empty with
both cursors null. Canceled restarts cannot publish over a newer operation.

The media provider owns compact navigation memory for at most 20 effective
member/view keys. Each holds one exact containing-page cursor/item/optional-burst/offset and
at most 20 recently expanded burst IDs with scalar reserved heights. Evicting
an older expansion collapses it. Frame arrays are separate: only retained,
expanded bursts remain cached (at most 20 reads of 200 frames); the existing
selection owner keeps selected-frame metadata separately. Returning to an
expanded burst with evicted frames reserves its height and reads frames only
on positive intersection or explicit opening, because an actual burst read
marks its frames seen. Committed Back/navigation to a saved frame is explicit
restoration intent: it may request that one burst before intersection. Route
preload and ordinary remembered overscan do not qualify. The restoration shares
an already pending read and waits for the frame response and committed fan rows
before correcting the saved frame offset. A transport failure keeps the original
anchor and offers Retry; successful omission or 404 finishes at the surviving
day. Pending/error scrolls and unmount cannot replace the requested position.
View retirement and superseding restoration abort the waiting correction, while
the existing frame owner fences late metadata and retires unobserved queries.

One focused row retains its own bounded members and keyed DOM parent across
regrouping and directional page eviction. It retires on blur, view/authority
change, denial, invalidation, or authoritative metadata replacement. Selected
IDs remain in the selection owner without mounting the whole fan. Collapse and
Escape return focus to the cover.

Saved-cursor recovery reuses the C2 page producer, requests a fresh effective
selection count, and atomically replaces InfiniteData with the actual issued
request cursor and request-start timestamp. Exact-query invalidation, competing
fetch/publication, view change and authority retirement fence late answers.
Committed rows remain available on failure with a “Retry returning to your
place” action. Authoritative absence of the saved item finishes at a surviving
position; it does not repeatedly search for a deleted item. Cached positions
reuse their retained page. The one empty-head restart described above also
applies to a collected query.

`useVisibleThumbnail` withholds image sources until a positive, zero-margin
intersection. Mounted overscan therefore initiates neither image requests nor
seen latches. The provider shares six eager slots across all lists on a
committed surface/view, closes the initial budget on scrolling, and resets it
only after committed navigation. Speculative preload and pending navigation do
not reset that budget. Automatic queued lease renewal rechecks actual and
document visibility before flushing; explicit invisible retry remains allowed.

Timeline seen buffering keeps at most 500 unique unseen sightings. It drains a
full batch immediately and starts a 500 ms deadline on the first pending entry;
continued intersections never postpone that deadline. Familiar prints allocate
no pending work. Changing the member-bound view or detaching its archive clears
the buffer, and retired observers reject callbacks already queued for delivery.
An already-started valid request is not retractable.

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

**Previous and next share the photo/video viewer's top bar.** Left Arrow or
`h` goes to the previous item; Right Arrow or `l` goes to the next. Navigation
follows the timeline's server-provided order, walks every matching frame in a
burst, crosses day boundaries, skips empty occasion days, and stops at either
end. Opening from the timeline carries its filters in history state; direct
item links use the whole visible archive. Moves replace the current history
entry and retain scroll, so Back still returns to the originating timeline.
Shortcuts leave typing, dialogs, video controls, fullscreen playback, modified
keys, and already-handled keys alone. Controls wait while an item loads.
Neighbour reads first reuse fresh, non-invalidated query data for the exact member
and canonical selection. Contiguous retained timeline pages or an already-known
neighborhood must prove the whole directional window; unknown burst edges, page
gaps and missing boundaries fall back to the bounded media-only endpoint through
the member operation gate, never another item's permalink. It supplies exact
directional burst edges without reading a whole day or burst. Only missing or expiring media refs use the
safe preview batch. Derived neighborhoods retain the oldest contributing page's
original metadata timestamp, so reuse cannot extend the 30-second ordering
lifetime. Failed reads offer a retry.
Item edits that change order or filtering refresh the neighbours.

**Immediate media never grants interaction authority.** Hover, keyboard focus and
touch intent warm safe preview metadata and route code. Known timeline and burst
thumbnails seed the member-only preview store. During selection, the requested
item's cached media replaces the preceding photo immediately; comments and
mutation controls remain inert until the ordinary detail read answers. An
unsuccessful detail read hides the preview and retains the existing retry rules.

**Photo choice follows the measured, uncropped viewport and device pixel ratio.**
The viewer chooses the smallest usable candidate that covers the fitted width,
with the largest available source as the limit. Supported WebP competes with JPEG
by encoded size at the same dimensions. A responsive `picture`, width `srcset`,
and measured `sizes` expose the selected source to the browser. The source set
contains the shared policy's exact choice, so a cached browser alternative cannot
silently diverge from the warmed rendition. A selected thumbnail or aspect-ratio
placeholder stays visible until that exact source decodes; item, source and DPR
changes invalidate older decode completions. Display bytes wait for measurement.

After decode and 250 ms dwell, the member scheduler warms two neighbors in the
travel direction and one behind. The same selector chooses those photo sources.
Video neighbors warm posters only. A selected video's metadata enables poster
warming; its measured container viewport, including resize/DPR changes, also
supplies navigation promotion and photo candidate choice. Photo transfers wait
for its first frame and either two seconds buffered or paused playback. `RegisteredVideo` owns readiness listeners on the actual native
media node, so explicit retry detaches the old node and observes its replacement.
The existing two-operation gate and byte/decode/network
budgets remain authoritative. No optimized-video metadata transport is enabled.

Navigation acquires an exact-source foreground lease before old-route cleanup.
A replacement acquires its lease before releasing the pending owner, including
repeated selection of the same rendition, so stale callbacks cannot abort it.
The member coordinator transfers that existing lease to the matching view and
releases rejected, redirected, superseded or unadopted work. A same-commit
preview-to-detail replacement keeps the same lease; source exit or member
retirement releases it. This coordinator is separate from actual-detail caches.
The timeline's itemNavigationSelection carries canonical IDs and the effective
earlier of its explicit until and jump at bounds. C2 pagination must retain this boundary and the
opaque page-parameter chain: evicted or disconnected pages cannot establish an
unseen neighbor.

The main timeline waits for member identity and produces member-bound query data.
Each web-only `TimelineQueryPage` adds `metadataUpdatedAt`, captured when that
page's metadata request starts. This is not part of the HTTP response. C2/C3 must
retain each page's timestamp while appending, evicting or editing media refs;
only rereading that page's ordering metadata establishes a new timestamp.
Neighbor reuse takes the oldest page contributing identities, continuity or an
archive boundary and falls back when that provenance is missing or expired.
The infinite query's aggregate `dataUpdatedAt` cannot establish page freshness.
Existing `timeline` prefix invalidation still covers the member-bound stream.

After reverse restoration, either matching server-issued edge proves adjacent
pages. A first page with `previousCursor: null` proves the bounded view's start,
even when it was fetched with a newer cursor. Missing edges, gaps and stale
contributing pages still require the safe neighbor endpoint, including empty
pages used to prove a boundary.

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

Photo and video reaction controls show the action and reaction summary without an
explanatory paragraph beneath them.

**The pile is marked stale, not refetched**, after any write that changes what
it draws (everything but comments and reactions), and catches up when somebody
returns to it.

**Controls are drawn from `ItemCapabilities`, never from the role.** The split
is by consequence (`conventions.md` § Who may change an item): any uploader
may tag it, name who is in it and describe it; only its own uploader or an
admin may change who sees it, correct its date or delete it. A test gives an
admin's role a viewer's capabilities, and a viewer's role every capability, to
keep it that way.
The removal-request action additionally excludes the photo's own uploader,
even when they are tagged. Tagged admins can still ask about somebody else's
photo, independently of their permission to delete it.

**Burst membership is reversible.** In an expanded timeline burst, each photo
that the member owns (or can manage as an admin) has a photo-options menu with
**Make standalone**. Confirmation separates the photo into its own timeline
print without deleting it. The photo's More drawer offers **Return to burst**
when its remembered group is available on the same capture day. Both actions
use server-supplied capabilities. Selection mode hides these membership controls.
The mutation uses the returned detail directly, refreshes timeline and burst
reads, and marks cached sibling details stale without counting extra opens.
Visible burst counts say **photos**. The collapsed count sits inside the cover
print, so it shares the photo's hover transform, stays above the thumbnail,
and opens the burst when clicked.

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

**Photos and videos share one conversation surface.** `ItemConversation/` owns
the heading and metadata on the page background, media/comment grid, composer,
comment rows and the top-right **More** drawer. There is no enclosing white card.
The media frame, rounded reaction bar and full white comments panel each retain
their own elevation; the shared layout owns the spacing for both media kinds.
`system/PolaroidContainer` owns the square white paper edge and shadow for both
full-size photos and videos, plus timeline and burst thumbnails. Its viewer size
uses a 10px edge; thumbnails use 5px (4px in a burst fan). It renders a div for
viewers or the existing native button for timeline prints, preserving refs,
selection, navigation and motion. Video fullscreen targets the inner player,
so the paper edge stays outside fullscreen. The drawer contains people, tags,
visibility, capture date, description and original/actions, with the same
capability checks for either kind. It fills the phone width, lets nested dialogs
handle Escape first, and returns focus to More without replacing the media.
The item app bar retains its full-height back-link target with no extra vertical
padding. A shared spacing-token gap separates that bar from the photo or video container.
At desktop widths of at least 1100px and heights up to 800px, that top gap is
16px so the viewer fits vertically while retaining the same media height.
The shared container header and media spacing are compact, recovering
vertical room without lowering the photo's existing 70vh size limit. Reaction
counts sit beside the emoji bar. On wide desktop layouts, burst thumbnails share
that footer row, retaining full-size touch targets and keyboard navigation. The
header supplies the frame count and the strip keeps its accessible label.
On desktop, long comment threads scroll within
the sidebar instead of making the whole viewer taller. On phones, comments
stack below the media with normal document scrolling. The photo column and sibling strip
stay mounted across frame changes; comments and details are keyed by item and
writes remain inert while the previous frame is drawn.

`system/MediaReactionBar/` owns the emoji buttons, overflow picker and Comment
action used by both media kinds. Photo reactions still toggle one of the six
whole-item reaction kinds, with their member counts and optimistic rollback.
Video reactions still save timed events. Both kinds' comment rows use
`system/Reactions`' inline variant, including the same React button and hover
bar. Change shared components and their CSS once to update both views.

`VideoConversation/` retains Video.js React 10.0.1, media sources, playback,
timeline marks, timed reactions and replies. It provides the shared composer
with a transport so comments can capture a moment; photo comments always send
without a timestamp and do not offer replies. The contract supplies duration,
with decoded metadata as a fallback. Nothing autoplays.

Focusing a new comment captures its moment once, so later seeking cannot move a
draft. Replies inherit their parent's timestamp. Timed emojis use a separate
`api/videoReactions/` collection, with stable IDs for retry and author/admin
removal. Whole-item and comment reactions keep their original contracts. See
[video conversations](video-conversations.md) for persistence and edge cases.

**People tagging requires an explicit selection.** Typing, pasting, commas,
and leaving the combobox or drawer do not submit a name. Clicking a suggestion
or pressing Enter accepts it. Existing choices keep person IDs through selection,
removal and queued saves, including two people with the same name. Unsaved names
are matched against earlier save responses before another request goes out.
The upload picker shares the explicit-submission behavior and retains its existing
same-name disambiguation step.
The chosen-name pills center their labels within the pill's height, alongside
the remove button, independently of Mantine's input-size line height.

The item picker requests management capabilities for the current photograph.
Ad-hoc suggestions, including selected people, offer a pencil to their creator or
an admin. A modal edits the shared name, which changes everywhere tagged. A trash
button appears only when no other item references the person; deletion also
removes the current tag. The pill's X only untags. Linked members never expose
these management actions. The server rechecks every permission and reference
inside the write transaction, including hidden items.

Management writes share the item's mutation queue. Suggestion caches are updated
immediately after rename/delete and refreshed before editing resumes, so a failed
refresh cannot restore a deleted choice. Active member identities are backfilled
and synchronized on the server; account names are available in the picker even
before their first tag. See [archive.md](archive.md#person-identity-and-tag-corrections).

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
thing to wait for. A skipped file is a duplicate: presign or completion found its bytes in
the shoebox or another file of the batch and cancelled it, and the
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
restores available temporary originals, and sends only its missing rows after
Resume upload or Retry upload. Re-picked files still use worker hashes when
browser storage is unavailable, expired, or absent for an older batch. Selecting
the entire original batch is safe: already completed files are skipped.
Uploading batches re-declare matched existing ids with their hashes; settled
batches only retry existing failed ids and never patch the manifest. "Send what
did arrive" is `commit` with `intent: "close"`, and arming a draft batch is
`intent: "arm"`.

### The routed Upload surface

`/upload` owns its single Back to the timeline bar. Its optional `session` search
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

A same-session settled refresh retains the receipt while the authoritative read
is pending. Its existing action nodes and keyboard focus survive canonical URL
updates; reading another session still shows the loading state.

After Put arms the batch, navigating between Upload and the pile keeps the
controller, browser file handles and transfer alive. An arm request already in
flight is preserved because the server may have accepted it. A real unmount or
member replacement destroys local resources; StrictMode's effect probe cancels its
deferred teardown. Reloaded armed sessions retain server edits and restore missing
originals from the member-scoped temporary store when available. Recovery always
reads the server manifest first and waits for an explicit Resume or Retry action. Server cancellation refuses
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
No file handles enter URL history. Unstarted drafts remain transient; armed
batches keep temporary originals for recovery. Viewers have no timeline dropzone.

The surface composes selection, reading, draft, sending, partial, resume, refusal
and done states. Refused files remain in the declaration and receive specific
explanations without Retry. Resume shows the entire missing set, recognizes files
already up, asks for one ambiguous match at a time, and reports extra picks without
sending them. Resume and Retry operate on all recoverable retained files, with a
file picker for originals the browser no longer has. Sending and missing rows
show bounded thumbnails beside filenames and status; completed rows can use
server media thumbnails after refresh. Preview work remains bounded while
transfers run. Reentry discards unstarted drafts instead of asking for their local
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

### Burst choices during upload

Each eligible upload preview shows its automatically detected burst and photo
count. **Make standalone** keeps the file in the batch and marks it to land as
a standalone photo. **Return to burst** reverses that choice. These controls are
separate from removing a file from the upload, and are available only to the
batch owner or an admin. Server-derived grouping considers the whole batch,
including files beyond the loaded page, and exclusions survive transfer and
settlement. Completed upload previews retain the same controls.

Membership writes run through the upload controller's serialized edit queue.
Pending changes disable conflicting actions; a failed write preserves the
previous confirmed state and offers retry through the same control.

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

A separate injectable `createUploadOriginalStore` keeps temporary original blobs
in IndexedDB, keyed by member, session and server file id. The controller awaits
per-file saves before sending, so an interrupted batch can reconnect exact file
bytes and metadata after refresh. Saving each file in its own transaction keeps
earlier copies available if a later copy hits quota. Storage is optional: denial,
quota exhaustion or a stalled database produces a visible keep-this-tab-open
notice and leaves the current upload working from its in-memory originals.

Complete server reads decide which stored originals may resume; restoration never
sends automatically and never retries completed, refused, cancelled or duplicate
rows. Confirmed terminal rows are removed promptly, failed or pending rows survive
controller destruction, and an explicit local reset clears the batch after any
in-flight save. Abandoned copies older than seven days are pruned on the next
store operation. Browser eviction can remove copies earlier, so recovery retains
the whole-selection fallback. Stored originals contain no signed URLs; the small
localStorage hint remains metadata only.
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
headers and SHA-256 checksums of accepted originals in two lanes, then declares
every picked file in sequential chunks of 500. Each lane owns a media worker:
checksums stream through bounded slices outside the shared decoder slot, and
photos also produce optional visual fingerprints before declaration. The worker reuses orientation-aware native
decoding and the HEIC fallback, normalizes the full image to a small sRGB canvas
over white, and reads pixels without encoding or replacing the original. HEIC
attempts recycle each lane's worker at the existing bounded threshold, including
failed decodes. Videos keep exact-byte checks only. Unsupported, empty and
oversized files bypass hashing and decoding and remain subject to server refusal.
A decode or canvas failure leaves the visual fingerprint absent while retaining
SHA-256, so the file remains eligible for upload. Failed checks retain picks for
retry; reset or close terminates both workers and suppresses late answers.

The pending pick caches its checks and keeps a stable `pickId` across declaration
retries. Separate selections, even of one `File` handle, get separate identities
and saved outcome rows, so each skipped file has a notice. Filenames never supply
photo identity. Exact or conservative visual matches against the archive or the
current batch appear as skipped duplicates before Upload, including after reload.
Outcomes pair to handles by `clientRef`; repeated `fileId` values retain
one transfer handle. Refusal stays the server's decision. Every successful chunk
refreshes the complete authoritative detail, including server capture days. A
later chunk or detail-read failure retains earlier saved rows and local handles;
`pickFiles([])` continues retained picks or the failed final read without opening
another batch. A failed page never publishes an incomplete manifest.

Draft files have individual trash controls, a bulk Remove action for ticked
files, and a Delete all action on the selection toolbar. Delete all includes
every waiting or refused file in the loaded manifest, including unticked rows
and rows whose local originals are missing. Each thumbnail's corner control has
a compact 28px opaque
mark inside a transparent 48px touch target, keeping the photo visible without
making removal hard to tap. The photo and its remove control share the same
moving frame: tilt, enlargement and stacking keep them together when either
button is hovered or focused. All removal actions freeze the chosen targets and ask
for confirmation that removal cannot be undone in this upload; the originals
on the device stay unchanged. Cancel leaves the batch unchanged. Removal reads
the complete server manifest
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
terminal activity publishes immediately. A duplicate gets its own marker and a saved
`duplicateReason` (`archive` or `batch`), rather than appearing as a lost
photograph. Draft notices explicitly identify a duplicate and say the file
will be skipped. Archive matches explain that it is already in the shoebox;
batch matches explain that it is already selected. Finished batches say
"Skipped duplicate", including mixed batches with unrelated failures. These
notices reveal no matched archive filename, date, item ID or visibility.
The explanation and duplicate rows survive reload and remain visible in the
draft and finished batch. A duplicate-only draft has no eligible files to upload
and can be cancelled or receive more files. Duplicates discovered during transfer
finish normally; duplicates have no
Retry action, while genuine failures retain recovery. An unanswered completion remains locally
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

`UploadDraft` composes the sticky selection bar, saved plan, days, a required per-file
capture-date review and visibility control. Its commit button counts the whole
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
the upload picker continues to hold names until that choice is made. Failed directory queries show
unavailable plus Retry, while allowing explicitly typed new labels.

`amendDates` sends known waiting manifest rows in chunks of 500, without reading
local files again. It sends the chosen calendar day as
`YYYY-MM-DDT00:00:00.000Z`; clock preservation stays on the server. Every saved
chunk refreshes day groups, undated rows and milestone mismatches. The capture-date
review uses the server's undated file ids and waiting eligibility, including
non-null fallback days. Each row shows a local thumbnail, an independently
editable date, the suggestion's basis, and a Confirm date button aligned with
the date input. Thumbnails fit inside fixed preview bounds without cropping or
overflowing their rows. Confirm all saves every displayed date, including unsaved
edits, through the existing chunked date amendment. It is disabled while saving
or when any date is invalid or empty. Failed bulk saves retain unconfirmed rows
and their edited dates for retry. An accent-tinted
panel, warning icon and explicit heading identify the required review without
relying on color alone. A row disappears only when the authoritative refresh
confirms its correction. Failed saves keep the row and edited day for retry;
other rows retain their unsaved edits.

The browser's received file order survives header-reading concurrency and
manifest chunking in the server's one-based `position` field. Date-review
labels use that ordinal directly. Suggestions use that order,
not filenames or capture-day sorting. A missing date uses the preceding known
day; a leading run of missing dates uses the following known day. Matching
neighbors are identified as supporting the same suggestion. Removed, refused
and duplicate files are excluded. Unconfirmed guesses never become evidence
for other guesses; a confirmed correction can guide remaining rows. Without
known neighbors, the existing file-modification or upload-day fallback is
prefilled and explicitly labeled. The source app's visible ordering is not
something the website can guarantee, so every suggestion still needs review.

Both the draft upload button and controller's start action require all waiting
undated files to be confirmed. This is a browser review requirement, not a new
server capture source or API constraint. Confirmation uses the existing
`uploader_set` amendment. The ordinary fallback day grouping stays visible until
correction. Review thumbnails use separate cache identities from day-group
prints, decode only near the viewport, and release their URLs on removal.
Native date inputs retain the print's light control context in both schemes.
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
one image worker lazily and requests only `thumb` through the worker protocol
and video poster helper. Display images and video posters are encoded only by
transfer preparation, never by the preview queue. It creates an object URL only
for the thumbnail. HEIC recycling follows
`appConfig.upload.heicWorkerRecycleCount`, including failed WASM attempts;
worker errors discard that worker before another image is prepared.

Development prebundles the worker-only `hash-wasm` and libheif glue dependencies
at startup. Discovering them on the first preview would otherwise let Vite reload
the page, losing every selected original's in-memory File handle. The worker and
HEIC decoder still load lazily in the browser. A JPEG already smaller than the
thumbnail target and at most 128 KiB reuses its original URL. JPEG display
reuse also requires at most 2048 px and 1.5 MiB. An oversized JPEG is encoded
even when its dimensions fit, and the encoder's returned Blob must actually be
JPEG. Both the producer and the preview fallback apply the same eligibility.

`getPreview(fileId)` returns a stable preparing, ready, or unavailable object
until that file changes, and undefined before request or after release or cache eviction.
`subscribe` publishes value changes, making the queue suitable for
`useSyncExternalStore`. The signed-in Upload provider owns the queue.
Its `setPaused` method remains available for explicit suspension. Transfer progress keeps preview work
enabled so newly visible originals can be recognized while sending; decoding
shares the session's single decoder slot across duplicate fingerprinting,
previews and transfer preparation. Waiting active preparation overtakes queued
previews; it never preempts a running decode. Streaming hashes and the two
network transfer lanes remain independent. Pausing holds subsequent previews;
an active decode finishes.
Offscreen deactivation cancels unfinished interest but retains completed previews.
An inactive least-recently-used cache holds up to 100 entries and 24 MiB of
thumbnail bytes; active previews remain pinned. Reentry reuses the same URL
without decoding. Explicit release, removal, batch replacement and teardown
revoke thumbnails and invalidate late answers. Queued cancellation removes the
decode before it can invoke a retired worker. Cancelling an already-running
noncancellable decode stops awaiting its result but retains the slot through
actual settlement. Destroy returns synchronously; an already-started video's temporary
URL and hidden element are cleaned by the existing helper's poster timeout and
bounded hidden-tab wait, without holding provider teardown open. The 20-second
capture deadline retires the video/source/URL and aborts media/frame waits. It
prevents later encodes, but an already-started native encode keeps the shared
slot until actual settlement; a stalled platform encoder can delay later decoder
jobs beyond that deadline. Timed-out output is discarded.

`useUploadResources` creates and injects the one coordinator into the controller,
preview queue and transfer engines. Its existing microtask lease protects this
owner from StrictMode's cleanup probe; actual member replacement or teardown
cancels consumers and disposes the coordinator. Checking workers end after the
checking generation, transfer workers end after the run, and abandoned preview
workers end on cancellation/error or queue destruction. A still-owned preview
worker may remain idle, and the existing eight-use HEIC recycling policy applies
per worker. One active decode bounds concurrent work, not the sum of retained
WASM heaps. Browser transfer preparation still makes no 960 px candidate; the
server processing queue adds responsive upgrades asynchronously.

`UploadDayGroup` renders non-duplicate files from the complete server manifest,
twelve prints initially and an explicit Show all control for the remaining
prints. Saved duplicate reasons and duplicates detected during transfer exclude
those files from the bottom gallery; their dedicated duplicate notices remain
visible. Day counts and Show all totals use only the remaining files, and a day
containing only duplicates is omitted.
Draft day groups share a responsive grid, flowing left to right and wrapping
to one column on narrow screens. Each day's previews also fill rows from left
to right and wrap, keeping their natural image proportions. This upload-specific
layout uses the available sheet width without horizontal scrolling; it does not
inherit the archive pile's offscreen height estimates.
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

`vitest.setup.ts` shims six things jsdom does not provide. The first four
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
- **`Element.prototype.scrollIntoView`**, which Mantine uses to keep the
  highlighted dropdown option visible. The no-op shim permits keyboard and
  pointer selection tests; tests of timeline scrolling install their own spy.

The other two are stubs of the same kind: **`window.IntersectionObserver`**,
which the day stream's paging sentinel creates, and **`document.fonts`**,
which Mantine's autosizing `Textarea` (the comment editor) listens on to
measure itself again once a web font arrives. Neither ever fires.

**The harness records what was sent, not only where.**
`testing/fetchStubHelpers` stubs `fetch` with canned answers keyed by
`"METHOD /path"` and records every request with its method, address and body.
It needs neither React nor the router, so the API modules' own suites use it
directly. `testing/surfaceHarnessHelpers` builds on it for a rendered surface, and
reads the record back as lines (`recordedRequests`, and
`getRecordedCountFromLine` for how often one was sent) and as bodies
(`getRecordedBodyFromRequest`). The item page needs both, because it has a
read and a write at one address: `GET /api/items/:itemId` counts an open and
`PATCH /api/items/:itemId` saves a description, and most of its tests assert
what a write sent, such as a people set carrying a known person by id and a
new one by name. `testing/itemFixtureHelpers` builds an `ItemDetail`, a video,
a burst's frames and the three sets of capabilities a viewer, another uploader
and the item's own uploader hold; `testing/itemHarnessHelpers` is the item
route's canned server, with member and group directory fixtures; `testing/itemWriteTestHelpers` is what each
write hook's own suite renders it with, a client already holding the item.
`testing/callQueryFn` runs a `queryOptions` result's query function directly,
which is how the API modules' tests check what a response parses into.

It also fills in `Blob.prototype.arrayBuffer`, which jsdom 27 lacks on `Blob`
and `File` alike. The upload engine reads every header and every hash slice
through `blob.slice(start, end).arrayBuffer()`, so the shim reads the same
bytes through jsdom's own `FileReader`, and stands down the day jsdom ships
the method.

Upload component tests inject controlled controller snapshots and commands.
Date and occasion dialogs can then verify pending states, original retry
targets, and preview retention without running the transfer engine. Controller
tests separately exercise manifest refreshes, acknowledged edit chunks, and
failed-write recovery. Browser tests own file selection, route/session changes,
visibility choices, cancellation, and receipt navigation through the real app.

Account mutation tests exercise the actual HTTP hooks with a QueryClient.
Bootstrap recovery tests inject a controlled pending mutation to check private
cache eviction and late-publication fences independently of the account form.
Shared query/media wrapper factories provide stable React providers for these
fixtures.

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
When reconnect also refreshes the current account as a viewer, the presence
surface hides the table and shows its admin-only refusal even if the self-only
presence request itself succeeded.

### Authorized step 9 follow-up

The Settings save round-trip defect and archive seed default are corrected in the
bounded follow-up. Juan Pablo accepted the recorded incomplete keyboard/native
zoom traversal and unverified VoiceOver limits. This acceptance closes the user
acceptance gate without claiming additional screen-reader or native checks.
Provider delivery, email-client transformations, health-only mail diagnosis and
the earlier family/phone trial qualifications remain as recorded in
[step 9 verification](prds/2026-09-27-memory-shoebox/plan/step-9-verification.md).

Filter controls express pure edits to the latest pending Router selection. A tag,
person or date edit made while bootstrap is still resolving preserves other pending
edits. Selection edits drop the jump, clear-all keeps the current jump, and a rail
restart preserves current filters; each action retains the current Find state.

Video reaction hints and the whole-video comment toggle use the standard print
text color on the sunken print surface, retaining readable small-text contrast
in both themes.

### Media component ownership

Print media, overlays, and runtime indicators own their styles separately.
Photo-frame presentation, video player controls, and item conversation controls
also import their own CSS modules. Parent modules retain layout rules; explicit
data attributes preserve hover, portal, and nested-control selectors across
component boundaries. The selected photo and registered video retain their
existing decode and element lifetimes through these presentational boundaries.
