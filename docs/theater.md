# Full screen photo and video viewer

The production item viewer offers **Enter full screen** for both photos and videos.
**Full screen** is the public name, including accessible labels; **theater** stays
an internal implementation term. Clicking the displayed photo or activating its
**View photo in full screen** action with Enter/Space opens the same viewer as the
header button. The photo's image node stays mounted across the change. Loading
previews awaiting item authorization and photo retry controls do not expose this
action. The embedded video full-screen button opens the shared viewer, including
comments and media navigation, rather than the video element's native fullscreen.
The same viewer fills a black stage and fits the complete media without cropping.
Back returns to the normal view of the **current** item. Re-entering starts there;
neither action returns to the original entry item or the timeline.

The page header keeps its full-screen and previous/next controls at 48px with
space above and below. They use the shared square-edged button styling and panel
palette. At phone widths, the back link sits above the action row so the complete
full-screen label remains visible.

## Presentation and navigation

`ItemSurface` owns one actual-detail query, transport, draft provider and stable
`ItemTheaterHost`. The host survives loading, route changes, errors and denials.
`ItemSurfaceContent` keeps query/state ownership and renders query branches through
the explicit `ItemQueryContent` component. Mode changes retain the current media
node and composer. The existing
`ItemNavigation` controller follows the originating timeline filters, burst order
and day boundaries, without wrapping or introducing a theater playlist.

The entry gesture requests native fullscreen on that host. Unsupported or refused
requests leave the same window theater usable. Browser fullscreen exit leaves
window theater open; the header can request fullscreen again. Back releases only
owned fullscreen and pauses through the shared transport. In window theater,
Escape dismisses nested interactions, then comments, then theater. Browser-owned
Escape can leave native fullscreen before application handlers receive it.

The underlying page is inert and its scroll is locked. Tab stays inside theater.
Back restores page scroll and focuses the current item's entry. If authorization
is still pending, entry focus waits for the replacement control; a subsequent
pointer/key action, re-entry or unmount retires that deferred restoration.

The header uses 48px Back/title/fullscreen controls and 12px title corners. It
shows one line with ellipsis and the complete label in its title attribute:
existing `itemHeading(detail)` · capture date · wall-clock time · position/total.
There is no separate item title field. Accessibility descriptions such as
`altTextOverride` are not repurposed as titles. The sample phrase in the retained
prototype is sample content only.

Position counts individual visible matching media, including every matching burst
frame, in the exact filtered neighbor order. The independent authorized
`POST /api/media/position` read supplies rank/total without opens, signing or seen
side effects. It runs only after current actual detail authorizes the item. A
pending, unavailable or failed counter disappears without delaying media.
See [items](items.md#authorized-theater-position) for its read contract and cost.

Desktop arrows reveal on hover across `clamp(80px, 8vw, 112px)` edge regions or
keyboard focus. Touch arrows remain visible, with 48px glyph targets and dark
backing, outline and shadow over image pixels. Keyboard focus outlines the arrow
affordance rather than its full-height hit region; unavailable arrows have no
rectangular disabled border. Left/Right uses the same navigation
listener; text cursor keys, composition, sliders, speed menus and nested dialogs
retain their own keys. The shared transport sits above edge hit regions so those
regions cannot intercept playback controls. There is no bottom hint bar.

## Shared conversation and drafts

`ItemComments`, `ItemComposer`, `ItemComment`, `ItemCommentActions`, `VideoReply`
and the existing reaction widgets and write hooks implement both presentations.
`TheaterCommentDock` owns only presentation, pointer/focus timing and the portal
target. It wraps the same mounted comment subtree; CSS orders scrolling threads
above the composer. Closed contents are inert and absent from the accessible UI.
Photos retain their existing comment model; one-level replies belong to videos.

Hover opens and autofocuses the composer while the approximately 390ms morph runs.
Leaving starts a 450ms delay; returning cancels it. Hover autofocus does not keep
the panel pinned open. Click/tap, Enter/Space or arrow-key activation opens the
same panel explicitly, following focus departure instead. Escape and close return
focus to the bubble. When navigation replaces a focused composer, pending bubble
focus survives the inert preview until current authorization arrives. Back,
unmount and intervening user movement retire that pending work.

Scoped Mantine portals keep comment pickers/delete dialogs inside the dock's
unclipped interaction region and media More reactions inside the host. Nested
interactions hold the panel open; Escape closes the innermost overlay first.
Modal fixed positioning is anchored to the viewport, including when its portal
origin is the corner dock. No second comment/reaction pipeline exists.

`ItemCommentDraftProvider` stores main-composer values per item for the item-route
visit. Collapse, presentation changes and mixed navigation preserve them.
`useItemCommentDraft` remains the capture/submission authority. A late success
reconciles only its matching submitted revision; it cannot clear newer text or a
different item's draft. Failed writes retain body/anchor, and pending writes
cannot be submitted twice. Denial discards that item's draft; member/route
retirement destroys the visit memory. Reply/edit forms survive collapse and
presentation changes; retention across item navigation is outside scope.

## Playback, geometry and privacy

The existing registered player, renewal gate, timeline, speed select, mute/play
controls and video reactions remain the only playback owners. Entry/new selected
video attempts autoplay through that gate. Rejection leaves Play usable. A
comment pause supersedes queued autoplay/renewal; collapse never resumes playback.
Draft capture occurs on first composer focus: positions displayed as `0:00`,
including subsecond positions, mean Whole video. The timestamp's × clears an
anchor. Subsequent focus/seeking cannot move an existing draft's anchor. Replies
inherit their parent's moment. Zero-second moment reactions remain valid.
Mute carries between videos; a new video starts at 1×. Presentation changes retain
the native node, position, volume and rate, and Back pauses the current video.

On phones the bubble and open panel stay at the bottom-right safe inset. Opening
raises transport and emoji controls above that panel, matching the approved
reference. An empty timeline omits its reserved marker row; real moments retain
that row. Short portrait viewports compact shared spacing and size the panel to
leave room for those controls. Short landscape puts comments alongside a narrower
transport. The composer, timestamp,
send action, speed, slider and reactions remain reachable at the tested sizes.
Reduced motion removes the morph and floating reaction movement.

Photo sizing, decoded handoff, media leases, readiness, retry and speculative
budgets are unchanged. Theater measures the full stage for source selection.
Previews have no conversation or mutation authority. Loading/denied/failed actual
detail never exposes the previous conversation; denied detail removes media.
Retry preserves existing actual-open policy. Route/member teardown retires media,
play tickets, fullscreen, scroll lock and focus ownership.

The standalone [prototype](theater-prototype.md) remains a design reference and
is not imported by production. [Production verification](theater-verification.md)
maps acceptance groups to browser/unit evidence and documents platform limits.

## Source organization

Theater dock, title, mode and playback modules live in their own named
directories under `ItemTheater/`; the shared navigation/playback integration
suites live in `ItemTheater/__tests__/`. Draft provider/hook companions live in
`ItemConversation/ItemCommentDraftProvider/` and
`ItemConversation/useItemCommentDraft/`. Route draft authorization belongs to
`ItemSurface/__tests__/`. Dock interaction and nested conversation suites share a
test-only harness in `TheaterCommentDock/__tests__/`. Viewer chrome/entry and
video-conversation wrapper styles are owned by their local component stylesheets;
theater shell and dock selectors carry their component prefixes.
