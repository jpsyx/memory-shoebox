# Step 3b: the shell and the design system

**Step design** for step 3b of
[`docs/prds/2026-09-27-memory-shoebox/plan/step-3b.md`](../../prds/2026-09-27-memory-shoebox/plan/step-3b.md).

This is not the product spec. The product spec is
[`docs/PRODUCT.md`](../../PRODUCT.md) and
[`design-spec.md`](../../prds/2026-09-27-memory-shoebox/design-spec.md), and the
visual record is [`DESIGN.md`](../../../DESIGN.md). Those three are read, never
restated. This document records only what is specific to moving that system into
`apps/web`, and cites the rest.

## What this delivers

`apps/web` stops being a placeholder and becomes the application's skeleton: the
Mantine theme and all thirteen shared components lifted out of `prototypes/`,
the design tokens, the fonts, the global stylesheet, a file-based route per
surface, TanStack Query, `apiFetch` with the error envelope, and the chrome
every surface sits inside.

No product surface is built. Every route renders a placeholder inside the real
chrome. Nothing fetches: step 4b is the first that talks to a server.

`prototypes/` is untouched. `AGENTS.md` forbids `apps/` importing from it, so
this is a copy, and step 9 deletes the original.

## What already exists, and what it settles

| File                            | What it already settles                                                                                                            |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared/src/errors.ts` | `apiErrorSchema` and `apiErrorDetailsSchema`, with `fieldErrors`, `retryAfterSeconds` and `attemptsRemaining` already on `details` |
| `packages/shared/src/dtos.ts`   | The frozen DTOs eight of the thirteen components are retyped against                                                               |
| `apps/web/src/api/client.ts`    | `apiFetch` already prefixes `/api`, sends credentials and parses with a Zod schema. Only `details` is missing                      |
| `apps/web/vite.config.ts`       | The TanStack Router plugin, the `/api` proxy, and `@/*` resolving to `src/*`                                                       |
| `apps/web/postcss.config.js`    | `postcss-preset-mantine` and the breakpoint variables, identical to the prototypes' own                                            |
| `prototypes/src/theme/theme.ts` | The whole Mantine adaptation, written to move                                                                                      |
| `prototypes/public/fonts/`      | Three self-hosted variable faces, tracked in git                                                                                   |
| `timeline.md` § Shared types    | `TimelineDay`, which `Pile` needs and which step 4a freezes into `packages/shared`                                                 |

## Decisions

### 1. All thirteen components move, and most of them are retyped

Step 3b's scope says every component in `prototypes/src/system/` moves across.
Taken literally that is not a copy: seven of the thirteen read the prototype's
fixture modules directly, and the prototype's own `MediaRef` is a different
shape from the frozen `MediaRef` in `@memory-shoebox/shared`. So "moved intact"
means moved and retyped, and the question is only what each one is typed
against.

| Moved unchanged                                        | Retyped against `@memory-shoebox/shared`                                                                                                                                                                                                  | Prop type declared locally                             |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `Chrome`, `typography`, `icons`, `Chip`, `FilterStrip` | `Reactions` (`ReactionSummary`), `Talk` (`CommentDto`), `Visibility` (`VisibilitySummary`, `MemberRef`), `PeopleField` (`MemberRef`, `PersonRef`, `TagRef`), `VideoFrame` (`MediaRef`), `MilestoneFix` (`MilestoneRef`), `MilestoneDates` | `Pile` (`TimelineDay`), `ProductBar` (name and counts) |

Every read of a fixture module becomes a prop. `PeopleField` and `Visibility`
import `GROUPS`, `MEMBERS` and `PEOPLE` as module constants today; they take
them as props here, which is what they would have needed anyway the moment the
lists came from a route.

Two components need a shape step 1 did not freeze. `Pile` needs `TimelineDay`,
which is fully specified in `timeline.md` § Shared types but reaches
`packages/shared` with step 4a; it moves with that shape declared in
`apps/web/src/system/Pile.tsx`, and step 5b deletes the local declaration for
the shared schema. `ProductBar` needs the Shoebox name and the archive counts,
which come from `GET /api/public-settings` and `GET /api/timeline`; it takes
them as props, and this step supplies placeholder copy.

The alternative was to move the chrome now and let each surface step lift what
it needs. It was rejected because the three shared controls exist once on
purpose (`DESIGN.md` § The People Field: each replaced two or three
near-identical controls that had drifted apart), and lifting them five times
out of a directory step 9 deletes is how they drift again.

**They conform to the house rules on the way across.** The prototypes use
`interface` and inline props; `docs/rules/typescript.md` wants `type` and a
props type named `Props`. These are new files in `apps/web`, so they follow the
repository's rules rather than the scaffolding's.

### 2. `system.module.css` moves whole

180 top-level classes. 116 are used by the thirteen components; 64 are used only
by surfaces steps 4b to 9 build, including `.pageWide`, `.centred`,
`.requestRow` and `.viewerPreview`, which `design-spec.md` § Responsive
behaviour names by hand.

Moving it whole ships 64 classes nothing references yet. Splitting it ships five
later steps the job of finding the right classes in a directory that no longer
exists. The first cost is visible and bounded; the second is invisible and
compounding, so the file moves whole and step 9's deletion pass is where unused
classes are audited.

### 3. The rendition follows `prefers-color-scheme`, and is still not a colour scheme

`DESIGN.md` declares four renditions and says Day is the default. Nothing else
settles who picks one: `SETTING_DEFINITIONS` has `shoebox.name` and
`pile.arrangement` but no rendition, and `design-spec.md` gives no surface a
rendition control. That silence is deliberate next to
`DESIGN.md` § Do's, which says in as many words that the pile arrangement is an
instance-level setting. The rendition is not one.

So all four renditions ship in `tokens.css`, unchanged, and exactly two are
reachable: the operating system's colour preference picks between Day and Night.

```css
@media (prefers-color-scheme: dark) {
  :root:not([data-rendition]) {
    /* Night's four inks, and the two accents it solves in the other direction */
  }
}
```

`:root:not([data-rendition])` keeps `prototypes.md`'s rule intact: an explicit
attribute on `<html>` still wins, so switching renditions stays one attribute
and a fifth hand-picked colour stays a bug. No attribute is written into
`index.html`, because writing `data-rendition="day"` there would out-specify the
media query.

`MantineProvider` takes `defaultColorScheme="auto"`. The resolver writes the
same palette into both of Mantine's colour-scheme blocks, so this changes no
colour; it only stops Mantine's own `color-scheme` from disagreeing with the
panel it is drawn on.

### 4. The route map is flat, and a filter is a search parameter

Fourteen routes cover the seventeen web surfaces. Surface 16 is email and is
not a web surface. Surfaces 3 and 4 share `/items/$itemId`, matching
`GET /api/items/:itemId`: a link cannot know whether it points at a photo or a
video until the item has been fetched, so a caller that had to choose between
`/photos/` and `/videos/` would have to fetch before it could link.

Surfaces 2, 5 and 6 share `/`. `FilterSearch.tsx`'s own note settles it: the
results are "the pile again rather than a different object: same spine, same
prints, same stacks", and "filtering by a person is the path, and there is no
per-person page to land on". A filtered pile is the pile with search parameters
on it, and the empty archive is the pile with nothing in it.

| Route                         | Surface                  |
| ----------------------------- | ------------------------ |
| `/`                           | 2 the timeline, 5 empty  |
| `/?tag=&person=&from=&until=` | 6 filtered               |
| `/?find=true`                 | 6 the filter sheet open  |
| `/sign-in`                    | 1 sign in                |
| `/items/$itemId`              | 3 one photo, 4 one video |
| `/items/$itemId/removal`      | 10 request removal       |
| `/people`                     | 7 people directory       |
| `/upload`                     | 8 upload                 |
| `/account`                    | 9 my account             |
| `/settings`                   | 11 Shoebox settings      |
| `/members`                    | 12 members               |
| `/groups`                     | 13 groups                |
| `/milestones`                 | 14 milestones            |
| `/removal-requests`           | 15 removal requests      |
| `/presence`                   | 17 who has been looking  |
| `/changes`                    | 18 what has been changed |

There is no `/admin` prefix, matching `conventions.md` § Paths, which refuses
one for the same reason: role is an attribute of a destination, not a path
segment. The six admin surfaces are reached from My account
(`prototypes/src/surfaces/Account.tsx`: "Five things only an admin can reach.
They are here rather than on the top bar, because everybody else's bar should
not carry doors they cannot open"), so nothing about the URL has to carry the
role.

### 5. Two shells, and the guard has exactly one seam

`__root.tsx` holds two layout routes.

- **`sign-in.tsx`** is the signed-out shell: `TopBar` carrying the Shoebox name
  and the word "Sign in", then `Centred` and `Card`. It is a sibling of `_app`
  rather than a child, because a guard that redirected to a guarded route is a
  loop.
- **`_app.tsx`** is the signed-in shell: the guard in `beforeLoad`, then
  `ProductBar` and `<Outlet />`. The other thirteen routes are its children.

The session is step 3a's and `GET /api/me` does not exist yet, so the guard gets
one seam and no stub anywhere else. `src/session/viewer.ts` exports
`viewerQueryOptions` and `requireViewer`. `requireViewer` is the whole guard: no
viewer, and it throws a redirect to `/sign-in` carrying the attempted href, which
is what `PRODUCT.md` § Sharing requires ("Opening a link while logged out leads
to the login screen and then back to the item"). In this step
`viewerQueryOptions`' query function returns a placeholder viewer and never
touches the network. Step 4b replaces that function body with
`apiFetch({ path: "/me", schema: meResponseSchema })` and changes nothing else.

Because the placeholder resolves, `/sign-in` is reachable by URL rather than by
redirect, so both shells can be looked at today.

### 6. `ApiRequestError` carries `details`, and keeps throwing

`apiFetch` already turns a non-2xx into an `ApiRequestError` with `status`,
`code` and `message`. It drops `details`, which throws away the only structured
data the envelope has: `retryAfterSeconds` on a 429, `attemptsRemaining` on a
sign-in code, and `fieldErrors` on a 400. All three are things a surface has to
render, and `conventions.md` § Errors says `message` is never the primary UI
copy, so none of them can be recovered from the English.

The error stays a thrown class rather than becoming a returned result, because
TanStack Query's failure path reads a throw. The docstring says outright that
`message` is for a log or a fallback.

The query client stops retrying a 4xx. `docs/web.md` already explains why the
retry count is one (a same-origin failure is usually real); a 404, a 403 or a
422 is real by definition, and retrying it doubles the latency of every genuine
refusal.

### 7. The tests get a DOM

`apps/web/vitest.config.ts` is Node today with a comment saying to switch it to
jsdom and install a DOM testing library when the first component test is
written. Thirteen components arrive in this step, so that is now.

## Module layout

```
apps/web/
├── public/fonts/                    three .woff2 faces, copied from prototypes
└── src/
    ├── main.tsx                     providers, and the three stylesheet imports
    ├── router.ts                    unchanged
    ├── queryClient.ts               retry predicate added
    ├── styles/
    │   ├── fonts.css                three @font-face blocks
    │   ├── tokens.css               four renditions, the scales, the dark block
    │   └── global.css               the enamel panel, the focus ring, reduced motion
    ├── theme/
    │   ├── theme.ts                 createTheme, cssVariablesResolver, variantColorResolver
    │   └── components.module.css    the Component.extend adaptations
    ├── system/                      thirteen components + system.module.css
    ├── api/
    │   ├── client.ts                apiFetch, ApiRequestError with details
    │   └── health.ts                unchanged
    ├── session/
    │   └── viewer.ts                viewerQueryOptions, requireViewer
    └── routes/
        ├── __root.tsx
        ├── sign-in.tsx
        ├── _app.tsx
        └── _app/                    thirteen placeholder surfaces
```

`src/theme.ts` and `src/index.css` are deleted: they are the scaffolding
`theme/theme.ts` and `styles/global.css` replace. `src/routes/index.tsx` moves
to `src/routes/_app/index.tsx` and loses the health-check demonstration, which
`api/health.ts` keeps as the worked example `docs/web.md` points at.

## What moves and what changes, file by file

| From `prototypes/`                | To `apps/web/`                    | Change                                                                                        |
| --------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------- |
| `public/fonts/*.woff2`            | `public/fonts/*.woff2`            | None                                                                                          |
| `src/styles/fonts.css`            | `src/styles/fonts.css`            | None                                                                                          |
| `src/styles/tokens.css`           | `src/styles/tokens.css`           | Adds the `prefers-color-scheme: dark` block from decision 3                                   |
| `src/styles/global.css`           | `src/styles/global.css`           | Drops `body { padding-bottom: 4.5rem }`, which cleared the harness rail                       |
| `src/theme/theme.ts`              | `src/theme/theme.ts`              | None                                                                                          |
| `src/theme/components.module.css` | `src/theme/components.module.css` | None                                                                                          |
| `src/system/system.module.css`    | `src/system/system.module.css`    | None                                                                                          |
| `src/system/*.tsx`                | `src/system/*.tsx`                | Retyped per decision 1; `interface` to `type`; props named `Props`; links become router links |

`@mantine/dates` and `dayjs` join `apps/web`'s dependencies: `theme.ts` extends
`DatePickerInput` and `MilestoneDates` uses it. `@mantine/dates/styles.css`
joins the imports in `main.tsx`.

## The chrome, wired

`ProductBar`'s four buttons are dead in the prototypes. Here they are router
links: Find to `/?find=true`, People to `/people`, Add to `/upload`, and the
member's name to `/account`. Add is still hidden from a `viewer`, which is the
rule the component already carries.

`TopBar`'s back link is a `button` in the prototypes. Here it takes a `to` and
becomes a link, because a back link that is a button cannot be opened in a new
tab and cannot be read as a destination by a screen reader.

Neither takes its copy from a fetch. `ProductBar` takes the Shoebox name, the
archive total and the member count as props, and `_app.tsx` supplies placeholder
values in this step.

## Verification

Beyond `pnpm check`:

| Check                                                                                                                                           | How                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| The chrome, panel, type scale, colours and focus rings are indistinguishable from the prototypes at 1280px, 768px and 400px, in both renditions | Side by side against `pnpm dev:prototypes` on 5174 and `pnpm dev:web` on 5173, Playwright MCP             |
| Keyboard-only traversal of the shell: everything focusable reachable, the 3px accent ring at 2px offset visible on each, no trap                | By hand, both shells and one placeholder surface                                                          |
| 200% zoom, no horizontal scrolling, nothing clipped (`PRODUCT.md` § Accessibility & Inclusion)                                                  | Playwright at 640x450 CSS pixels, which is 1280x900 at 200%                                               |
| `apiFetch` surfaces a 404 envelope, and a 429 carrying `details.retryAfterSeconds`, as typed failures rather than thrown strings                | `src/api/client.test.ts`, with a 400's `fieldErrors`, a schema mismatch, and a 2xx alongside them         |
| The guard redirects to `/sign-in` with the attempted href, and passes a viewer through                                                          | `src/session/viewer.test.ts`                                                                              |
| All thirteen components render                                                                                                                  | Seven are rendered by the tests that cover their behaviour; the other six by `src/system/system.test.tsx` |
| Nothing under `apps/` imports from `prototypes/`                                                                                                | `src/boundaries.test.ts`, an import-specifier scan asserted rather than assumed                           |

## What the side-by-side found

The chrome matches. Measured rather than eyeballed, `apps/web` against
`prototypes/` at the same width. At 1280px the bar is 77px tall in both, with
the same `14px 22px` padding, the same 1px `rule` bottom edge, the same sticky
position, the same panel colour and the same 6px speckle; the title is Familjen
Grotesk 700 at 21px in the same ink; the buttons are 42px, zero radius, Archivo
at 18px. At 768px both are 133px tall with the four controls on one row at the
same offset and no horizontal scroll. At 400px both wrap the controls to two
rows. Keyboard
traversal reaches every control, each showing one 3px accent ring at 2px
offset with Mantine's own suppressed, and there is no trap. At 200% zoom there
is no horizontal scrolling and nothing is clipped.

Three things were fixed on the way: the bar's links carried the browser's
default blue and an underline, masked only by the button's flex box; there was
no favicon, so every page load 404ed; and the anchor needed `color: inherit`.

**Two findings were raised here and both are now settled.** Both were verified
as present in `prototypes/` too, so the copy was faithful in each case and the
question was about the design record rather than the port.

### The primary button disappears on a dark panel

`DESIGN.md` § Components gives the primary button `backgroundColor:
{colors.ink-dark}`. In Night, `--ink-dark` is `#0d1836`, which is also
`--panel`. On a print that is correct and high contrast, which is why sign-in
reads perfectly. On the panel the button's fill is the panel, so it vanishes:
measured, the top bar's "Add" has `rgb(13,24,54)` on a bar of `rgb(13,24,54)`.

Only one control is affected, and it is the product's main action for an
uploader. It never mattered before because Night was a switch on a mockup
rail; decision 3 made it what half the audience sees.

**Settled.** `DESIGN.md` § The Selection Bar already puts solid `on-panel`
with `panel` text on the enamel, precisely because a filled control there
cannot use the ink. That rule now covers the primary too, as a
`panel-filled` button variant recorded in § Components, and the bar's Add uses
it. Day barely moves: the label goes from print white to panel blue at about
9:1. Night gains a visible primary.

### The bar's buttons are under the target-size floor

`DESIGN.md` § Do's asks for 3rem (48px) minimum on every interactive target,
and `design-spec.md` § Accessibility records 2.75rem (44px) as measured, with
"chips, buttons and the reaction control all meet it". The top bar's four
buttons are 42px in both trees: Mantine's `size="md"`, which the theme sets as
the default. The jump select next to them is 48px, so the token is right and
the button default is what misses it.

**Settled, and it was a defect rather than a question.** The theme already
declared `--button-height: var(--tap)`, but Mantine writes
`--button-height: var(--button-height-md)` inline on the element, and an inline
custom property beats a class, so the theme's declaration never applied. The
small size was worse: 36px against the 44 it asked for, on the control that
clears a filter. Naming the per-size variables the inline declaration reads
fixes both, and `design-spec.md`'s measured claim, which was false, is
corrected.

For the record, 44px is WCAG 2.2's **AAA** target size (2.5.5); AA's minimum
(2.5.8) is 24px, which 42px met. What was missed was this product's own
higher bar, set deliberately in `PRODUCT.md` § Accessibility & Inclusion
because AA "permits type and tap targets that the real audience will struggle
with".

## Documentation

Updated in this step, per `AGENTS.md`:

- **`docs/web.md`**: the new layout, the theme and the tokens, the rendition
  rule, the route map, `apiFetch`'s `details`, the retry predicate, and the test
  environment, which that file currently describes as Node with instructions to
  change it.
- **`docs/architecture.md`** § What is not built yet: step 3b joins steps 1 and 2.
- **`docs/prototypes.md`** § Its life expectancy: the theme and the system have
  moved, so the directory is now the reference for the surfaces alone.

## Out of scope

Owned by a later step, and named here so this one does not drift into them:

- Every product surface. Placeholders only.
- Any fetch against a real route. Step 4b is the first that talks to a server.
- Deleting `prototypes/`, which is step 9's.
- The session itself, which is step 3a's. This step builds the guard's shape and
  one seam.
