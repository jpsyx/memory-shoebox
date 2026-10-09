# Video conversations

Videos keep the approved player-and-sidebar composition, using Shoebox's
rendition-aware ink and print palette. The surface, player and composer have
square edges. The rounded **reaction bar** (also called the **emoji bar** or
**react bar**) is the primary way to react to a video moment. On phones, the
conversation stacks beneath the player. Photos reuse the same white surface,
More drawer, composer, comment rows and media reaction bar. Their whole-item
reaction choices and untimed comments retain their existing contracts.
The [prototype research](video-conversation-prototypes.md) records the library
comparison, Loom references and visual decision.

## Playback and conversation

`apps/web/src/surfaces/Item/VideoConversation/` integrates Video.js React 10.0.1
with the existing media URLs. The current uploader stores the original video,
poster and thumbnail, without transcoding. When MP4/WebM renditions are absent,
the player uses `media.display`, whose video fallback is the signed original.
It leaves the source MIME hint unset so an original MOV is not mislabeled as MP4.
Absent transcodes alone do not show a playback error; an actual media failure does.
Video.js supplies playback, mute and
fullscreen controls; the application owns comments, timeline marks and saved
reactions. There is no new video hosting, analytics or public sharing service.
The shared `ItemConversation/ItemDetails` component opens a right-side
**Video details** drawer from the header's **More** action, with
people, tags, visibility, capture-date correction, description and original
download/actions, subject to the same existing permissions. It uses the full
width on phones. Escape closes the drawer and focus returns to More; nested
dialogs and calendars handle Escape first, preserving a pending delete's busy
guard. Opening the drawer does not replace or reset the video. The duplicate
whole-item React button is
removed from the video surface. Existing whole-item reaction data is unchanged.

Focusing a new comment pauses playback and captures its timestamp. Seeking while
writing does not move that draft. The timestamp control switches to a whole-video
comment. Failed submissions retain the text and anchor. Comment timestamps and
timeline markers seek the actual media. Crowded moments group into an accessible
list. Every marker, including a single comment, opens a Mantine popover with
separate author, timestamp, and full comment text. Comment line breaks are
preserved; long content scrolls. Emoji markers have transparent backgrounds,
while comment initials retain their circular badge (the member contract does
not currently provide avatar URLs). Targets are 48px, popovers fit the viewport
and stay inside fullscreen, and Escape returns focus to the marker. A single
marker still seeks on opening; the timestamp seeks from any grouped preview.
Permitted reaction removal stays available beside the timestamp. Popover
appearance is owned centrally by the Mantine theme, using existing print/ink,
spacing, and contact-shadow tokens. Reduced motion suppresses floating emoji motion. Cmd+Enter or
Ctrl+Enter submits a comment or reply through the same form as Send. Plain Enter
still inserts a newline; composing input and repeated keydown events do not send.

Replies are one level deep and inherit the parent comment's timestamp. Existing
edit, delete and comment-reaction permissions still apply. Removing a parent
promotes its replies to top-level comments, preserving their text and reactions.
The item cache mirrors this database behavior immediately.

Comment reactions use a small inline heart action. Clicking it adds Love by
default, or removes the viewer's existing reaction. Hovering for 250 ms reveals
a rounded emoji bar with Love, Like, Care, Haha, Wow and Sad. A short dismissal
delay lets the pointer cross into the bar. Its adjacent chevron and the up/down
arrow keys open the same choices without hover, including on touch screens.
Explicit opening focuses the choices and restores focus on dismissal; hover
does not steal focus. Escape dismisses either mode. The entrance and emoji
motion respect reduced-motion preferences. Counts, member lists, optimistic
updates and rollback retain the existing reaction contract.

## Saved reaction events

Timed emoji reactions are separate from the existing one-reaction-per-member
whole-item and comment summaries. A member can react at several moments. The
player reads the newest 50 events; comment threads are complete.

| Endpoint                                                | Result                                                                 |
| ------------------------------------------------------- | ---------------------------------------------------------------------- |
| `GET /api/items/:itemId/video-reactions`                | Newest 50 `VideoReaction` rows, descending creation time and ID.       |
| `PUT /api/items/:itemId/video-reactions/:reactionId`    | Save `{ emoji, atSeconds }`, returning the event with status 200.      |
| `DELETE /api/items/:itemId/video-reactions/:reactionId` | Remove an own/admin event, returning 204; a missing event is also 204. |

`VideoReaction` contains `reactionId`, `author: MemberRef`, `emoji`, `atSeconds`,
`createdAt` and `canDelete`. Allowed emojis are 😂 😍 😮 🙌 👍 👏 ❤️ 🥹 🎉 💯.
The shared package exports request and response schemas from `videoReactions.ts`.

The browser creates a UUID before sending a reaction. A retry keeps the same ID,
emoji and captured moment. The server compares member, item, emoji and normalized
(clamped) timestamp for idempotency. Conflicting reuse returns
`409 video_reaction_conflict` and never overwrites an existing event. A saved
marker appears only after success. Playback can replay crossed moments; seeking
does not animate all the reactions skipped over.

Every route first checks the parent item's visibility. Missing and hidden items
return the same 404. Writes reject photos, unknown durations and negative or
nonfinite timestamps; positions beyond a known duration clamp to its endpoint.
Only the author or an admin can remove an existing event, otherwise the route
returns `403 video_reaction_delete_forbidden`. Writes use the existing per-member
conversation rate limit. Reactions never send email.

## Storage and migration

Migration `0010_video_conversations` adds `video_reactions`, indexed by item and
creation time, with item/member foreign keys that cascade. It also adds nullable
`comments.parent_comment_id`, a self-reference with `ON DELETE SET NULL`. Existing
comment data is preserved. `CreateCommentRequest` accepts an optional nullable
`parentCommentId`; `CommentDto` returns it. The server accepts only a top-level
parent on the same visible video and inherits its timestamp. Comment emails keep
the existing item-level notification behavior.

The migration runs through the normal application migration workflow. No manual
production database operation is part of this change.

## Shared UI ownership

`ItemConversation/` owns the media-neutral layout, details drawer, comments and
composer. `system/MediaReactionBar/` owns media reaction buttons and their Comment
action; `system/Reactions/` owns the inline comment React action. Video-only
playback, timestamp controls, replies and reaction persistence remain here. A
shared button or style change applies to both photo and video views.

## Verification

Shared contract tests cover emoji and timestamp validation. Server route tests
cover persistence, retry conflicts, visibility, permissions, reply isolation,
parent deletion and schema upgrades. Web component tests cover captured drafts,
retries, replies, marker grouping and existing item-cache behavior. Browser tests
in `e2e/admin/video-conversations.spec.ts` use a migrated SQLite catalog and real
production SPA, including reload persistence and phone layout. The existing
`video-keyboard.spec.ts` covers decoded-media seeking and accessible clock values.

Run `pnpm test:e2e:video` for the fifteen production-browser scenarios in both
Chromium and WebKit, using independent catalogs. The suite covers desktop and
phone conversation flows, expired URL recovery, fullscreen groups, metadata-edit
playback continuity, original-only uploads, keyboard seeking, shortcut/comment
reactions, the phone details drawer, nested calendar/dialog dismissal and slow
deletion. Playback checks start the player before
expecting decoded frames, respecting WebKit's metadata-only preload.

`e2e/admin/item-conversation.spec.ts` covers photo comments, item and comment
reactions, reload persistence, More drawer focus and phone layout using the same
production app and an isolated catalog.

`e2e/admin/video-moments.spec.ts` covers single-comment previews, keyboard
reopening, outside dismissal, transparent reaction markers, viewport bounds,
and permitted removal on desktop and phone in both browser engines. A grouped
long-comment case verifies scrolling, viewport bounds, and timestamp typography
across all four renditions.
