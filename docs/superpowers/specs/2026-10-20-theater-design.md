# Shared photo and video theater

October 20, 2026. Architectural specification for the approved
[theater prototype](../../theater-prototype.md). Audience: implementers and reviewers.
The prototype and its title, return-navigation, and hint-removal refinements are
approved. This document translates that design into production requirements;
production implementation has not begun.

## Intent and scope

Family members can fill the screen with a photo or video, move through the same
ordered timeline, and join its conversation without leaving theater. Media leads:
black unused space, unobtrusive navigation, and a bottom-right comment bubble.

The user's implementation constraint is binding: reuse existing React comment
components and control presentation with props. Theater changes their appearance
and placement, not their data, permissions, mutations, or conversation model.
The standalone prototype's comment store, composer, player, and reaction mocks
must not become a second production system.

This work includes the shared theater shell, photo entry, replacement of the
video fullscreen action, mixed-media navigation, autoplay, title, and comment dock.
It does not include a new media library, new comment API, schema migration,
persistent draft storage, public sharing, slideshow, or automatic next-item playback.
No dependencies, production operations, deployment, push, or merge are required.

## Approved experience

| Area                    | Requirement                                                                                                                                                                                                          |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entry                   | Both media kinds expose Enter theater. Video's fullscreen action enters the application-owned theater rather than fullscreening only the video.                                                                      |
| Stage                   | Black background. Fit the complete image or video without cropping. Matching aspect ratios fill both axes; otherwise unused space remains black.                                                                     |
| Fullscreen              | Request browser fullscreen on a stable application container. If unsupported or denied, show the same theater filling the browser viewport.                                                                          |
| Navigation              | Previous/next follows existing filtered timeline and burst traversal, including photos and videos. No wrap at either endpoint. No alternate local playlist.                                                          |
| Desktop arrows          | Reveal within edge zones sized `clamp(80px, 8vw, 112px)`, not only at the exact edge. Use dark backing, light outline and shadow. Keyboard focus also reveals arrows.                                                |
| Touch                   | Keep arrows visible on devices without hover. Buttons are at least 48px.                                                                                                                                             |
| Keyboard                | Left/Right navigates, including browser fullscreen. Text fields retain cursor movement. Sliders, selects, menus, nested dialogs and composition retain their own keys.                                               |
| Video                   | Attempt autoplay on entry and on each new video. Playback rejection leaves a usable Play button; it is not a media-load error. The emoji bar remains visible while playing, idle, or commenting.                     |
| Title                   | One line: `Taking the long way home · September 15 · 4:28 pm · 4/4`. Height 48px, matching Back. Radius 12px, matching the playback bar. Long content truncates without wrapping; the full label remains accessible. |
| Back                    | Exit theater to the normal single-media view of the current route item. Re-entry starts on that same item. Do not navigate to the original entry item or timeline.                                                   |
| Bottom edge             | No “Take your time” hint bar. Retain only functional controls.                                                                                                                                                       |
| Comments                | Bottom-right bubble opens on hover, without a click, morphing into the shared conversation panel over about 390ms. Opening focuses Write a comment.                                                                  |
| Dismissal               | Crossing between bubble and panel keeps it open. Pointer departure starts a 450ms delay; returning cancels it. Collapsing preserves the draft.                                                                       |
| Keyboard/touch comments | Bubble is a real button with expanded state. Click, tap, Enter or Space opens the same panel. Explicit opening stays usable without hover; Escape or leaving the focus region dismisses it.                          |
| Motion                  | Reduced-motion preference removes the morph and floating reaction motion.                                                                                                                                            |

### Counter and metadata

Planning assumption pending the user's counter preference: `4/4` means current
position / total individual media in the current filtered timeline. It counts
visible burst frames individually, in exactly the same order as navigation.
It is not the count of loaded previews, a burst-only count, or a session visit count.

Use existing item heading and capture-wall-clock rules, including stored capture
offset and Shoebox timezone fallback. Separate title, date, time, and counter with
middle dots. Do not invent a caption for an untitled item. Omit the counter while
its authorized value is loading or unavailable, without blocking media or navigation.

Existing neighbor responses contain only bounded previews and cannot establish a
global rank. Add an independent read-only position query, enabled only in theater,
so accurate counting does not change the fast neighbor path or fetch every item.
If the user chooses burst-only counting before implementation, replace this one
contract and its plan task with existing `burstPosition` / `visibleFrameCount`.

### Comment behavior

Reuse `ItemComments`, `ItemComposer`, `ItemComment`, `ItemCommentActions`,
`VideoReply`, shared reaction widgets and all existing item-write hooks. The same
components must provide posting, replies, editing, deletion, reactions, errors,
retry behavior, permission checks, and Cmd/Ctrl+Enter submission in both views.
The theater variant places the scrolling thread list above the composer and
uses the approved light conversation surface, rounded panel and corner bubble.

A new video draft pauses playback and captures the current annotation position
when autofocus reaches the composer. Positions displayed as 0:00 are Whole video;
the timestamp's × also selects Whole video. Subsequent focus, reopening, or seeking
does not change an already captured draft. Closing comments never silently resumes
playback. Failed posts retain text and anchor. Replies keep the existing inherited
parent-moment contract. Moment reactions may still be recorded at zero.

Keep the same comment subtree mounted while switching presentation and collapsing
the dock. Closed contents are inert and unavailable to assistive technology.
Retain main-composer drafts by item ID for the lifetime of the item-viewer visit,
including mixed-media navigation and leaving/re-entering theater. Use one shared
draft owner behind the existing draft hook, not a theater-only draft implementation.
Reply/edit state survives collapse and presentation changes; retention of those
secondary forms across item navigation is outside scope.

A hover-opened panel follows pointer departure even when autofocus is inside; focus
alone must not defeat the requested close delay. Explicit keyboard opening uses
focus departure instead. When a panel closes with focus inside, move focus to its
bubble. Nested comment menus, popovers and dialogs are part of the interaction
region and must not disappear while the member uses them.

## Architecture and reuse

| Approach                                                                    | Assessment                                                                    |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Presentation props on current viewer components, with a stable theater host | Selected. One media and comment tree, shared ownership, minimal divergence.   |
| Separate theater page importing copied prototype components                 | Rejected. Duplicates draft, posting, permission and playback behavior.        |
| Separate viewer mounting existing components a second time                  | Rejected. Shares code but duplicates live media, queries and component state. |

### Ownership

`ItemSurface` remains the actual-detail query owner. Introduce an always-mounted
`ItemTheaterHost` around its loading, authorized, error and denied states. A
`useTheaterMode` controller owns presentation, the native fullscreen element,
scroll/focus restoration, mute preference and entry/exit. Lift the existing shared
video transport to this surface so every exit can cancel queued play and pause
through the same transport. Neither host nor controller is keyed by
item ID. The host persists across successful and failed route transitions.

`ItemViewer` receives that controller and passes an explicit
`presentation: "page" | "theater"` through `ItemViewerConversation`,
`VideoConversation`, `ItemConversation`, the media frames and comments.
`ItemConversation` changes layout through styles on a stable tree. Keep exactly
one current-media node, one composer and one active navigation-key listener.
`TheaterCommentDock` wraps the existing conversation node in both presentations;
its page variant is a passive wrapper, and its theater variant supplies the bubble,
animation and interaction timing. It owns no comments or HTTP writes.

A shared `ItemCommentDraftProvider` lives for the same item-route visit, with
in-memory records keyed by item ID. `useItemCommentDraft` remains the only owner
of capture and submission semantics; the provider stores draft values, not a
second mutation pipeline. Success callbacks reconcile only the submitted item's
matching draft revision, including responses that arrive after navigation.
Denied/deleted items lose their retained draft; leaving the item route or changing
member destroys all drafts.

Reuse `PhotoFrame` with a separate presentation prop for its frame styling;
its existing `presentation: "preview" | "selected"` loading meaning must remain
intact. Reuse `ConversationPlayer`, `RegisteredVideo`, `VideoPlaybackOverlay`,
`ConversationControls`, `VideoControls`, `VideoTimeline`, `VideoSpeedSelect`,
`VideoReactionBar`, `useVideoPlayback` and `useVideoReactions`. Adapt the shared
paper container with a theater appearance instead of duplicating photo loading.

The normal video controls replace their current `FullscreenButton` with the
theater-entry action. Theater controls hide that duplicate action because the
stage header owns fullscreen. Presentation changes retain the native video node,
position, rate and volume. A new video resets speed to 1×; theater carries mute
between videos. Back pauses playback and retains the current item/position.

### Navigation and fullscreen

Reuse `useItemNavigation` and its authorized neighbor reads, selected-source
handoff, readiness serialization and route replacement. The route continues to
change to `/items/$itemId` for each visited item. The existing originating filters
remain in history state. No route loader may fetch actual detail or count opens.

Extend `ItemNavigation` with a presentation prop. Allow navigation keys inside
this owned fullscreen host while retaining exclusions for unrelated fullscreen
and nested controls. The existing broad video-player keyboard exclusion must be
narrowed for theater so focusing the picture does not disable media navigation;
focused scrubbers and speed menus still handle arrows themselves.

Request fullscreen synchronously from an entry gesture. Only exit fullscreen when
this host owns it. Fullscreen rejection or external browser exit leaves window
theater usable. Back exits both modes without changing the current route.
Escape dismisses the innermost application overlay first; when the browser consumes
Escape to leave native fullscreen, keep window theater open. In window theater,
Escape closes the comment panel before exiting theater. Browser Back retains its
normal routing semantics. Route unmount releases fullscreen, scroll lock and focus
ownership. Restore focus to the current item's entry control, not a removed node.

Use scoped Mantine portal defaults to keep comment menus and dialogs inside an
unclipped portal target within the dock, itself inside the fullscreen host.
Moment popovers and speed menus already render without a body portal and keep
that behavior. The underlying page cannot receive focus or interaction in theater;
announce the selected media when navigation settles. No duplicate modal semantics
on the comment panel; the theater is the modal surface in window mode.

### Playback and authorization

Autoplay uses the existing video renewal and playback-intent gate, not raw play
calls that can race source renewal. An explicit comment pause supersedes queued
autoplay. Retiring an item, media node, rendition or route cancels stale play work.
Attempt once per theater entry/new selected video; metadata edits and ordinary
source renewal do not restart a deliberately paused video.

Keep selected-photo sizing, decoded handoff, leases, retry, readiness and prefetch
budgets. Theater measures the full viewport so source selection can choose an
appropriate rendition. Never replace selected media with an unowned raw URL.
Loading previews carry no comment or mutation authority. Placeholder content is
inert. An actual-detail denial removes media and conversation, clears its draft,
and retains a usable Back control in the stable theater host. Retry does not
multiply actual-detail opens beyond current policy.

### Position read contract

`POST /api/media/position` accepts `{ itemId, selection }`, using the existing ID
and timeline-selection schemas. It returns `{ position, total }` with positive
integers and `position <= total`, or `null` when the item is missing, hidden, or
outside the selection. It records no opens/seen events, signs no media, and exposes
no hidden count. No migration is required.

Calculate rank and total from one consistent authorized selection. Match the
neighbor ordering: days and group anchors descending, each collapsed burst at
its earliest matching capture, then its visible matching frames in existing burst
order. Reuse selection predicates and ordering helpers; do not rank raw capture
timestamps alone. Keep this query independent of speculative neighbor budgets.
Cache by member, item, and complete selection under the existing timeline
invalidation prefix. Discard obsolete responses; never show the prior item's
counter during a transition. Failure omits only the counter.

## Verification and acceptance

The feature is accepted when production-browser checks prove the approved photo
and video design, and tests demonstrate shared behavior rather than two systems.

1. Enter on a photo, move through photo/video/burst/day boundaries, leave native
   fullscreen and re-enter it, then Back to the current item. The fullscreen host
   stays identical through navigation; the media/composer stay identical through
   presentation changes. No duplicate actual-detail opens on mode changes.
2. Desktop hover edges, touch arrows, title geometry (48px / 12px), ellipsis,
   letterboxing and no hint bar match the approved design. Test 390px phone width,
   desktop, wide/tall media, full-width media and reduced motion.
3. Hover comments autofocus, delay 450ms on departure, remain usable over nested
   overlays and preserve draft body/anchor across collapse, mode changes and
   navigation. Zero/subsecond drafts remain Whole video. Keyboard cursor movement
   never changes media. Dialogs, sliders and menus retain their keys.
4. Photos and videos use real local APIs for post, reply, edit, delete and reaction
   persistence. A failed post or late success cannot erase newer text or another
   item's draft. Author/admin/viewer permissions remain identical to page mode.
5. New videos autoplay; rejection retains Play; comment pause defeats pending
   autoplay/renewal; retired nodes cannot restart. Video emoji controls remain
   visible beside the open composer. Seeking still preserves playing/paused state.
6. Counter tests compare rank against a full neighbor walk with filters, hidden
   frames, mixed media, burst ties and date boundaries. An inaccessible item returns
   no count. Record query cost on the existing representative sparse/dense fixtures;
   this ancillary request never gates selected-media loading.
7. Loading, denied detail, expired URLs, media errors, retries, deep links and
   route/session teardown preserve existing privacy and resource ownership.

Use Vitest/Testing Library and production Playwright Chromium/WebKit with isolated
catalogs and fake local email/bucket services. Never verify against production.
Run `pnpm check`, targeted theater browsers and the existing video/photo conversation
regressions before declaring implementation complete. Record physical-device
fullscreen limitations honestly; browser emulation is not a device test.
