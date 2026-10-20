# Theater production verification

October 20, 2026. Production React/Vite SPA served by an isolated local Fastify
catalog with loopback fake media, `NODE_ENV=development`, fake email enabled and
injected no-mail delivery. No production data, audience, provider or deployment
was used. The retained prototype is a design reference; no prototype code is
imported into the production viewer.

## Acceptance evidence

The seven groups in the [approved specification](superpowers/specs/2026-10-20-theater-design.md)
map to the following evidence. Browser scenarios live in
`e2e/admin/video-theater/__tests__/` and run in both Chromium and WebKit. The five
focused specs cover navigation, focus, conversation, authority/playback and
geometry. Run them with the `video-theater` filter; the existing configuration
still discovers all 24 scenarios in each engine. Deep race combinations remain
covered by the existing real-hook and route integration tests.

| Group                            | Production browser evidence                                                                                                                                                                                                                                                                                                                | Complementary deterministic evidence                                                                                                                                                                                                                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Ownership and navigation      | Native/window host identity across photo/video transitions, fullscreen exit/reentry, same selected node/composer through presentation changes, Back/reentry on current item, no extra open, actual page scroll restoration.                                                                                                                | `ItemTheater.navigation`, `ItemNavigation.theater`, existing filtered/burst navigation and readiness suites cover burst/day boundaries and rapid intents.                                                                                                                                                                                   |
| 2. Approved layout               | 1440×900 desktop, 390×844 touch, 390×480 keyboard-sized viewport, 844×390 landscape; photo/video, comments open/closed, reduced motion, full-width and tall photo. Geometry and pointer hit tests cover composer/send/reaction/slider/speed. Header 48px/12px, ellipsis, edge backing, contain/black and no hint.                          | Shared photo viewport/source selection and theater playback tests preserve full-stage candidate measurement and normal paper sizing.                                                                                                                                                                                                        |
| 3. Dock and drafts               | Animated hover/keyboard autofocus, moment pause/capture, Escape/navigation bubble restoration, collapse/presentation/item retention, cursor arrows, zero/subsecond Whole video, timestamp clearing, nested portals, pending focus retirement and reduced-motion reopen. Collapsed panel is inert/aria-hidden and absent from role queries. | `TheaterCommentDock` verifies exact 450ms departure, reentry cancellation, nested ownership, reply/edit retention and source-independent presentation. Draft hook/provider suites cover capture stability and revision ownership.                                                                                                           |
| 4. Shared writes and permissions | Real local photo/video posts, video replies, edits, deletions and media/comment reactions persist through reload. Failed post retains body/anchor and real retry succeeds. A held successful response cannot erase newer/different-item drafts or permit a duplicate post. Author/viewer/admin actions match server authority.             | Draft/provider/write-hook tests cover additional response ordering, item retirement, failed retries and pending-post combinations. Photos retain the existing non-reply comment contract.                                                                                                                                                   |
| 5. Playback                      | Real native playback, comment pause, usable Play after deliberate autoplay refusal, shared control key exclusions, visible emoji controls, and existing seeking-state browser suites. Expired playback URL retry now also runs inside theater.                                                                                             | `useTheaterVideoPlayback`, `ItemTheater.playback`, `RegisteredVideo`, renewal/playback tests cover queued readiness versus explicit pause, stale nodes/items, source retry, metadata edits, mute carryover and rate reset.                                                                                                                  |
| 6. Counter                       | Viewer walk skips hidden media and verifies 1/3 → 2/3 → 3/3 without wrap. Pending/failed position never delays media or displays stale rank.                                                                                                                                                                                               | `mediaPreview.position` compares every rank/total with a full neighbor walk across filters, hidden burst frames, burst/capture ties and date boundaries; missing/hidden/out-of-selection is null with unchanged side effects. `mediaPreview.scaling` records sparse/dense cost.                                                             |
| 7. Authority and teardown        | Slow/denied destination exposes no previous conversation or live media after denial, retains host/Back; server error and actual-detail retry grant no premature writes. Deep links and full-document navigation to an unlocked page are exercised.                                                                                         | `ItemTheater/__tests__/ItemTheater.navigation.test.tsx` uses actual-router navigation to prove SPA unmount releases scroll/inert ownership; `useTheaterMode/useTheaterMode.test.tsx` proves owned fullscreen/pause cleanup on unmount. Existing lease/decoded-handoff/renewal/navigation suites cover media/session retirement and budgets. |

The current selected photo is awaited through its decoded `data-photo-ready`
handoff before asserting native-node identity. Replacing a thumbnail during
ordinary decode is valid media loading, not a presentation remount.

Deletion persistence is asserted only after the reloaded, authorized composer is
editable. Comments belong to that same real item-detail payload, so absence is
checked after data readiness rather than against the SPA loading shell. This
review correction strengthens browser evidence and changes no production behavior.
The scroll scenario asserts restored scroll and entry focus only. Persisted open
counts are checked separately by the native/window mode-change scenarios. The
focus scenario uses `page.goto("/")`, so its unlocked destination is document
navigation evidence, not proof of React cleanup. Actual-router teardown and
controller unmount tests supply that complementary evidence.

## Integration repairs

- A detached focused composer lost bubble restoration during mixed-media
  navigation. The dock retains pending restoration across an inert placeholder;
  Back/unmount and subsequent user movement retire it.
- Back during pending authorization tried to focus an absent current entry.
  The host observes the replacement entry, uses `preventScroll`, and retires
  deferred work on user input, reentry or teardown.
- Mantine's fixed modal inner retained the corner portal's static horizontal
  origin. Scoped viewport anchoring keeps the reused delete dialog onscreen.
- Short viewports clipped the composer under a fixed clearance. Short portrait
  compacts shared spacing; short landscape places the dock beside transport. The
  bottom-anchored phone bubble/panel now lifts controls and reactions above the
  open panel, and empty marker rows no longer inflate the transport.
- Edge hit areas now have no full-height disabled border, with keyboard focus
  drawn around the circular arrow affordance.
- Edge navigation intercepted speed/Play controls. Shared theater transport now
  sits above edge hit regions, with player isolation relaxed only in theater.
- WebKit retained CSS `visibility:hidden` across immediate reduced-motion reopen.
  Redundant visibility hiding was removed. Existing inert/aria-hidden,
  tabIndex/pointer-events and opacity own collapsed interaction and animation.
  No asynchronous focus retry or duplicate focus owner was introduced.

The old isolated Vite dock harness/server were removed after integrated motion
coverage passed in both engines. Existing video moments tests need no label
change; conversation fullscreen expectations now target Enter theater and the
shared host, with complete fallback behavior when native fullscreen is absent.

## Checks

| Command                                                                             | Result                                                                                                 |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `pnpm check`                                                                        | 5,229 passed; seven existing server skips. Skills, format, lint, workspace types and build pass.       |
| `pnpm test:e2e:video --reporter=list,json`                                          | 88/88 passed across Chromium/WebKit.                                                                   |
| `pnpm exec playwright test -c playwright.video.config.ts video-theater`             | 48/48 passed after the review split and authorized reload readiness correction.                        |
| `pnpm exec playwright test -c playwright.admin.config.ts item-conversation.spec.ts` | 8/8 passed after final style repairs, including reaction-failure visibility/contrast and burst layout. |
| Video conversation `--grep 'grouped moments'`                                       | 2/2 passed after final style repairs, retaining real marker rows inside the fullscreen host.           |
| Theater `--grep geometry`                                                           | 8/8 passed with settled captures, explicit close visibility/reachability and both engines.             |
| Web `ItemTheater TheaterCommentDock ItemNavigation`                                 | 66/66 passed after final visual repairs.                                                               |

The full video run preceded the final visual repair batch. The affected theater,
grouped-moment and photo suites above were rerun afterward. The final workspace
check and static checks cover the resulting source. Native fullscreen was
observed in both engines; forced rejection confirmed complete window fallback
with no native fullscreen element. No browser project or acceptance group was
skipped.

Review fix round 1 also passed the focused photo/video deletion checks in both
engines (4/4), root `pnpm type-check`, `pnpm lint` and `pnpm format:check`.
Before/after discovery has identical scenario titles and projects: 48 theater
tests. Full video discovery remains 88 tests in 12 files. This test/docs-only
round did not rerun the workspace unit suite or non-theater browser scenarios.

Final Minor cleanup verification passed 143 affected web tests in 21 files and
four position-server tests. The complete theater browser suite passed again:
48/48 in Chromium/WebKit after local CSS ownership and selector-prefix changes.
Root types, lint, formatting and build also pass. This cleanup moves existing
modules/tests, extracts an explicit query-state renderer, adds conditional braces
and narrows two evidence claims. No new behavior required red/green tests, and
no full workspace unit suite was repeated. The prior broad review remains ready
with no blockers; scoped review of this cleanup is pending.

Existing jsdom scroll/navigation and Video.js notices, the build's React compiler
module-directive advisory and Playwright's NO_COLOR/FORCE_COLOR notice are baseline
noise. No unrelated warning cleanup was included.

The position growth fixture uses one SQL statement. Task 1 measured dense/sparse
6-item catalogs at 1.282/0.417 ms and 1,006-item catalogs at 2.193/0.255 ms.
These are single local in-memory samples, not production latency guarantees;
selection-sized CPU work remains possible. Neighbor budgets remain unchanged.

## Visual record and limits

Screenshots are retained under `.playwright-mcp/theater-production/` and mirrored
into `~/Downloads/memory-shoebox_theater-prototype/theater-mode/screenshots/`.
The batch includes each browser's four viewport sizes, both media kinds,
comments open/closed, reduced motion, plus full-width/tall photo edge cases.
The approved prototype screenshots were compared with the desktop/phone batch;
clipping and modal origin defects were repaired together. Controller confirmation
identified three concrete remaining discrepancies, repaired as one follow-up:
bottom-anchored phone dock/order, empty transport height and edge borders/focus.
The final settled captures confirm them. Close comments is explicitly visible
and reachable on phones; finite dock transitions are awaited before capturing.

Browser emulation is not a physical phone test. Native fullscreen, autoplay,
safe-area hardware and software-keyboard behavior on real devices remain
platform-dependent. A 390×480 viewport proves constrained geometry, not actual
keyboard animation or iOS fullscreen. No screen-reader or physical-device
acceptance is claimed. All six tasks are independently reviewed; final broad review found no blockers.
The seven Minor cleanup findings are addressed; scoped cleanup review remains
pending. Review verdicts remain separate from implementation checks and do not
authorize merge or publication.

## Reuse

One `ItemSurface` query/host/controller/transport/draft provider remains in charge.
The same `ItemNavigation`, `PhotoFrame`, registered video player, timeline,
controls, reaction widgets, `ItemComments`, `ItemComposer`, comment rows, reply
forms and write hooks serve both presentations. There is no second media loader,
comment store, player, route loader or mutation pipeline. See [theater](theater.md).
