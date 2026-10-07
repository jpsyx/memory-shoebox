# Video conversations

Videos use the approved Loom-style composition: a pale player area, white
comments sidebar, purple timestamps and a compact emoji row. On phones, the
conversation stacks beneath the player. Photos retain the existing item viewer.
The [prototype research](video-conversation-prototypes.md) records the library
comparison, Loom references and visual decision.

## Playback and conversation

`apps/web/src/surfaces/Item/VideoConversation/` integrates Video.js React 10.0.1
with the existing MP4/WebM rendition URLs. Video.js supplies playback, mute and
fullscreen controls; the application owns comments, timeline marks and saved
reactions. There is no new video hosting, analytics or public sharing service.
The existing item metadata, whole-item reactions and editing sheets remain
available below the conversation.

Focusing a new comment pauses playback and captures its timestamp. Seeking while
writing does not move that draft. The timestamp control switches to a whole-video
comment. Failed submissions retain the text and anchor. Comment timestamps and
timeline markers seek the actual media. Crowded moments group into an accessible
list, and reduced motion suppresses floating emoji motion.

Replies are one level deep and inherit the parent comment's timestamp. Existing
edit, delete and comment-reaction permissions still apply. Removing a parent
promotes its replies to top-level comments, preserving their text and reactions.
The item cache mirrors this database behavior immediately.

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

## Verification

Shared contract tests cover emoji and timestamp validation. Server route tests
cover persistence, retry conflicts, visibility, permissions, reply isolation,
parent deletion and schema upgrades. Web component tests cover captured drafts,
retries, replies, marker grouping and existing item-cache behavior. Browser tests
in `e2e/admin/video-conversations.spec.ts` use a migrated SQLite catalog and real
production SPA, including reload persistence and phone layout. The existing
`video-keyboard.spec.ts` covers decoded-media seeking and accessible clock values.

Run `pnpm test:e2e:video` for the six production-browser scenarios in both
Chromium and WebKit, using independent catalogs. The suite covers desktop and
phone conversation flows, expired URL recovery, fullscreen groups, metadata-edit
playback continuity and keyboard seeking. Playback checks start the player before
expecting decoded frames, respecting WebKit's metadata-only preload.
