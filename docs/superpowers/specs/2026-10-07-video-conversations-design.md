# Video conversations

Approved direction: the Loom-style sidebar prototype and Video.js React 10.0.1.
Juan Pablo explicitly requested production integration after reviewing it.

## Behavior

Videos use a pale player surface, a white comments sidebar and purple timestamp
links, matching the selected prototype. Phones stack comments beneath playback.
Photos keep their current viewer. Video.js owns playback, mute and fullscreen;
our application owns comments, moment markers and reactions. Media still loads
from existing signed B2 sources, never a new hosting provider.

Focusing an empty new-comment composer pauses playback and captures its time.
Seeking afterward cannot move that draft's anchor. The timestamp chip allows a
whole-video comment. A failed submission preserves both text and time. Existing
edit, delete and comment reaction permissions remain. Replies form one level below
a top-level comment; replies inherit the parent's moment and do not create marks.
Deleting a parent promotes surviving replies to top-level comments rather than
deleting other people's words. Replies are enabled only in the video UI.

Tapping an emoji creates a moment-specific event. Multiple reactions by one member
are allowed, independently of their existing whole-item reaction. A successful
write adds a marker and brief animation; failures provide a retry with the same
client-generated event ID. Marker clicks seek. Own reaction markers offer removal;
admins may remove any. Replay animation uses crossed moments, and seeking does
not emit every intervening reaction. Reduced motion uses a static acknowledgement.
Crowded timeline positions group nearby markers into an accessible list/popover.
The player displays the newest 50 reactions; comments remain complete.

## Contract

`PUT /api/items/:itemId/video-reactions/:reactionId` accepts `{ emoji, atSeconds }`.
The reactionId is a client-generated UUID. The same ID/member/item/emoji and
normalized (clamped) timestamp is idempotent; conflicting reuse returns 409 and never modifies somebody else's row.
`GET /api/items/:itemId/video-reactions` returns `VideoReaction[]`, newest 50
(ordered by createdAt descending then ID). `DELETE` on the same event path removes
an own/admin event and is idempotent for a missing event. Every operation first
checks item visibility, with hidden and missing items indistinguishable. Writes
reject photos, unknown video durations, nonfinite/negative timestamps; finite
positions above duration clamp to duration, matching existing comments.

`VideoReaction` is `{ reactionId, author: MemberRef, emoji, atSeconds, createdAt,
canDelete }`. Emoji is one of 😂 😍 😮 🙌 👍 👏 ❤️ 🥹 🎉 💯. Video reaction writes use
existing conversation rate limits. No emails are generated for rapid reactions.

`CreateCommentRequest` adds optional nullable `parentCommentId`; `CommentDto` adds
nullable `parentCommentId`. Parents must be top-level comments on the same visible
video. Replies inherit the parent's atSeconds and existing comment mail behavior.
The database gains `video_reactions` and nullable `comments.parent_comment_id`
with SET NULL on parent deletion. Existing data is preserved by a new migration.

## Scope and validation

Preserve item metadata, tagging, visibility, download/delete actions and original
item reactions, placing ancillary sheets below the video conversation surface.
The sidebar uses real members and item metadata, with no prototype/sample copy.
Use repository naming, CSS Modules, accessibility and schema manifest conventions.

Red/green tests cover persistence, retries, visibility, permissions, validation,
reply isolation and deletion, stable drafts, failure recovery, marker seeking,
item navigation, source fallbacks and real library controls. Inspect production
fixtures on desktop and phone. Run workspace checks and an independent code review.
No merge, push, deployment or production database access is authorized.
