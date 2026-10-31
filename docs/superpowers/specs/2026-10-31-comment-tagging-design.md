# Comment tagging, account names, and avatars

**Status:** Draft scope for review. Product decisions explicitly confirmed below;
remaining behavior is recommended. No product implementation in this change.

**Date:** 2026-10-31. **Baseline:** `790de6af` on `main`.

The [UI/UX shape](2026-10-31-comment-tagging-ux-shape.md) expands this scope into
screen layouts, copy, keyboard/touch behavior, and recovery states for every
affected surface. Use it as the detailed interaction companion.

## 1. Outcome and confirmed decisions

A family member writes `@Jorge check this out!`, chooses Jorge from a typeahead,
and posts a distinctly rendered, clickable comment tag. Jorge receives an email.
Following his name opens the photos and videos he uploaded or was photo-tagged
in, limited to what the reader may see.

| Decision          | Confirmed requirement                                                                                                                                       |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Terminology       | Use **comment tagging / comment-tagged** and **photo tagging / photo-tagged**.                                                                              |
| Comment targets   | Only member accounts. No ad-hoc people, groups, or create-name action in the `@` picker.                                                                    |
| Email preference  | Separate setting for comment-tag emails, on by default.                                                                                                     |
| Account names     | Unique names that act as handles. Keep account emails private.                                                                                              |
| Name conflict     | Explain that the name is taken; suggest a last-name initial, such as `John M`, during registration.                                                         |
| Ad-hoc identities | Account-name uniqueness does not apply to ad-hoc photo-tag names. Always append `(not a member)` when rendering those identities, even without a collision. |
| Avatars           | Members can upload their own profile image. Show it in the typeahead and comments, with initials when absent.                                               |
| Avatar storage    | Store profile images in the existing Shoebox bucket under an `avatars/` directory.                                                                          |

The intended audience remains the existing small, private family circle, including
older relatives using phones. The primary failure to prevent is confidently
tagging the wrong identity or believing someone was notified when only plain
text was typed.

## 2. What exists and what must change

| Current behavior                                                          | Consequence for this feature                                                               |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Comments store and render a plain `body`; drafts and edits are textareas. | Add explicit member references without interpreting every typed name as a tag.             |
| Active accounts have linked `people` records; ad-hoc people are separate. | Join through `people.member_id`. Never match an account to a person by name.               |
| A People card links to the archive filtered by photo tagging only.        | Add a combined account filter; keep existing photo-tag filters precise.                    |
| Comment email goes to an uploader and prior commenters.                   | Add direct comment-tag recipients and avoid duplicate mail on the same post.               |
| Account names are nullable and fall back to the email local part.         | Introduce a required, unique claimed name and an authenticated profile-completion step.    |
| People cards deliberately hide member/non-member distinctions.            | Update this design rule and all photo-tag identity rendering to show the requested suffix. |
| Comments show initials.                                                   | Use a shared avatar presentation backed by member identity data.                           |
| Bucket keys are prefixed by the B2 client.                                | Store logical keys under `avatars/`; the client adds `test/` or `production/`.             |

The current app supports comments on individual items, video moments, one-level
video replies, and the shared theater conversation. This scope covers those
existing surfaces. It does not introduce post/album comments.

## 3. Impeccable interaction brief

**Mode: Operate.** Preserve the existing application and its refrigerator-door
design system. Reuse the typography, opaque print panels, square menus, ink
colors, focus treatment, and existing identity circles. The accent remains
reserved for unseen content. See [DESIGN.md](../../../DESIGN.md), especially
The Composer, The People Field, and Popovers. Current components determine the
actual layout where the older prose differs.

### Typing and selecting a comment tag

1. Typing `@` at the start of a comment or after whitespace/opening punctuation
   opens an anchored list. An `@` inside an email address does not.
2. The initial list shows eligible members alphabetically. Typing narrows by
   account name, using the existing name normalization. Multiword names remain
   searchable. Show about five rows before scrolling.
3. Each row displays the uploaded avatar or initials and the unique account
   name. Do not display email addresses. Only active, named members who can see
   this item are eligible, including the author.
4. Clicking, tapping, or pressing Enter on a highlighted result inserts the
   complete `@Name`, its member reference, and a trailing space. The caret stays
   in the comment. A selected result is the only way to create a new tag.
5. Escape closes the menu without deleting text. Tab moves focus normally
   without silently choosing a member. Arrow keys navigate an open list;
   ordinary textarea movement resumes when it closes.

Bare `@Name` text that was not selected stays plain text and sends no email.
Pasting plain text does not create references. Never offer “Create Jorge.”
Use the short helper “Type @ to tag a member.”

| State                      | Presentation and behavior                                                                                                              |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Loading                    | “Finding members…” in the anchored panel; retain all typed words.                                                                      |
| Empty search               | “No matching members.” No account-creation or ad-hoc option.                                                                           |
| Failed lookup              | “Couldn't load members.” with Retry; ordinary commenting remains available.                                                            |
| Selected tag               | Subtle ink wash and medium weight distinguish its range in the draft.                                                                  |
| Target becomes unavailable | Preserve the draft and name; require removal of the tag or conversion to plain text before posting. Do not silently drop its identity. |
| Post fails                 | Preserve text, tags, timestamp, reply parent, and caret.                                                                               |
| Draft changes during send  | Clear only the submitted draft revision; preserve newer edits.                                                                         |

On phones, anchor the menu to the field and flip above it when the keyboard
leaves little space below. Keep rows at the existing 48px target size. In
native fullscreen, mount the menu inside the fullscreen host. An open menu
consumes its own Enter/Escape before comment submission or theater shortcuts.
Ignore composing IME keystrokes. Cmd/Ctrl+Enter must not unexpectedly submit
while a selection is being made.

Use the existing Mantine primitives for the list, focus, positioning, and
announcements. Mantine's [Combobox documentation](https://mantine.dev/core/combobox/)
supports custom autocomplete rendering; caret-range management remains app
logic. Confirm the textarea integration with the installed version during
implementation. No rich-text editor dependency is selected by this scope.

### Posted comments and avatars

Render a comment tag as an inline **underlined, medium-weight link**, with the
same restrained ink wash. It must remain readable in a sentence, wrap on small
screens, have a visible focus indicator, and be recognizable without color.
The accessible link name can be “Jorge, view photos and videos.” Use a real link
so opening a new tab works. Do not turn the whole comment into a link.

Show the author's chosen avatar beside their name in comments and replies,
including theater. Use the same member-avatar component in the picker and
composer. An absent, expired, or failed image falls back to initials without
changing layout. Decorative images next to a visible name have empty alt text.
Comment tags remain text links; an avatar inside every tagged word would make
sentences harder to read.

Reuse the renderer in item comments, the shared Talk presentation, replies,
and video-moment previews. Plain labels and email excerpts use readable text,
never markup or internal IDs.

### Account setup and name conflicts

“Registration” means the existing invited first sign-in, not public signup.
After verifying the sign-in code, members without a claimed name see a compact
profile-completion form before entering the archive. Preserve the original
deep-link destination through this step.

The form asks for **Your name** and offers optional **Add a photo**. Name
conflict copy: **“That name is already taken. Try adding your last-name
initial, like John M.”** The example is guidance, not a promise that `John M`
is available. Never invent a surname. An invitation's supplied name can prefill
the field; the final save decides availability.

My account permits renaming and adding, replacing, or removing an avatar. Avatar
upload is optional and must not block completing a valid name. The UI/UX shape
proposes a circular crop preview with position and zoom controls, then Save photo
or Cancel. Start from a centered fit; provide visible keyboard-operable controls
alongside optional dragging. Retouching and filters remain outside scope.
Upload failure keeps the previous avatar.

### Photo-tag identities

Render an ad-hoc person as **`Jorge (not a member)`** in suggestion rows,
selected chips, existing photo tags, the People directory, and person filters.
The suffix is present even when no account named Jorge exists. It is quiet
secondary text, included in the accessible name, and never hidden behind hover.
It is derived presentation, not part of the stored name or rename input.

An account-linked person uses the unique account name. For a linked account
whose access was removed, show the same `(not a member)` suffix in photo-tag
contexts because that person is no longer an active member. Preserve its IDs
and historical associations. Neither kind of inactive identity appears in `@`.

Cover item editing, upload labeling, and timeline bulk labeling, including
newly created ad-hoc selections before the server responds. There is no automatic
merge when an ad-hoc name equals an account name.

## 4. Account identity and uniqueness

Names are human-readable handles; member IDs remain the stable identity.
Spaces and accents remain supported, including `John M` and `Sofía`. Keep the
existing name-length limit. Disallow `@`, line breaks, and invisible formatting
controls in account names so a handle cannot resemble several tags.

Use a single canonical key for comparison: NFC, trim, collapse whitespace, and
Unicode lowercase without environment-dependent locale selection. This follows
the existing `makeNormalisedNameFromName` normalization pattern. Thus
`John`, `john`, and `" John "` conflict. Accents stay meaningful, as they do in
the current archive; do not silently introduce accent folding.

Enforce uniqueness in SQLite, not just with a browser availability check.
Proposed model: a `member_name_claims` table with unique normalized name keys
and an owning member ID. Current and previous claims remain associated with
their owner. Renaming claims the new name and updates the member and linked
person in one immediate transaction. Members may return to their own previous
name. Other accounts cannot reuse it, including after account removal, so an
old comment tag cannot appear to identify a different person.

Name availability is checked after authentication. Return a field-level
`name_taken` conflict without exposing the owner or their email. All name-write
paths must use the same rule: first-admin setup, profile completion, account
rename, invitations/restoration where they assign a claimed identity, and local
member-seeding tools. A claimed name cannot be cleared back to an email fallback.

Invitations may carry a suggested name, but that is not a claimed handle. A new
account must claim its name after verifying its email. Uncompleted identities
are excluded from comment-tag candidates and cannot post/upload until complete;
their authenticated session still permits profile completion and signing out.

**Existing-data rollout is part of the scope.** Run a read-only collision report
using the new normalization, including fallback names and retained accounts.
Preserve unique existing names. For collisions or invalid/empty names, require
an explicit member-ID-to-name mapping before enabling the constraint and feature.
Report unresolved rows and stop the migration without partial renames. Never
pick a winner, auto-number relatives, or merge accounts. Registration and My
account then enforce the rule for all future writes. No production data was
read during this scoping work, so whether collisions exist is unknown.

## 5. Representation and write behavior

| Approach                               | Trade-off                                                                                       | Decision                                                                    |
| -------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Plain body plus explicit member ranges | Fits existing textareas and APIs; requires careful range updates during editing.                | Recommended.                                                                |
| Structured rich-text document          | Makes inline nodes explicit, but replaces the comment model and introduces an editor/migration. | Defer unless an input prototype demonstrates ranges cannot meet acceptance. |
| Infer tags from `@name` text           | Simple initially, but pasted words can notify people and old names are ambiguous.               | Reject.                                                                     |

Extend comment create/update requests and `CommentDto` with `commentTags`.
Each occurrence identifies `memberId`, `start`, and exclusive `end`; the range
includes `@`. Positions use JavaScript UTF-16 indices, explicitly documented and
tested with emoji. Persist occurrences in a `comment_tags` table referencing
the comment and member, plus a server-validated label snapshot. Cascade when
the comment is deleted. Repeated occurrences are valid; recipients deduplicate
by member ID.

The server validates ordering, non-overlap, bounds, label-to-member identity,
and target eligibility. Existing code trims the body independently: replace
that with shared normalization of text **and ranges together**, so leading
whitespace cannot move a tag onto another word. Do not accept arbitrary HTML
or render using `dangerouslySetInnerHTML`.

Selecting a name records its current label. If it changes before posting,
return a recoverable stale-tag error so the composer can refresh the selection.
Already-posted comments retain their validated wording and stable link after
a rename. Historical names remain reserved to the same account.

Edits outside a range shift its offsets. Editing inside one converts that
occurrence to plain text; typing a new `@` can select again. Undo/redo restores
text and references together. Moving, selecting, deleting across tags, multiline
paste, and emoji must be covered. Draft highlighting may use a synchronized,
noninteractive text mirror, with the textarea remaining the accessible input.
Prototype mobile wrapping, scroll, zoom, and IME before finalizing that technique.

Missing tags on a legacy **create** request mean `[]`. On **update**, omission
is accepted only when the stored comment has no tags. Otherwise return a
reload-required error, so an old client cannot silently discard existing tags.
An explicitly empty array removes them. Existing tag occurrences may be retained
when their member has since lost access; only new additions require current
eligibility. Comment-edit ownership and timestamp/reply rules stay the same.

## 6. Clicking a tag: the combined archive

Use the existing archive with a proposed `member=<memberId>` search parameter,
not a public profile. The visible heading reads **Jorge**, with **Photos and
videos uploaded by or photo-tagged with Jorge** underneath. Display the member
avatar and one removable account filter. No followers, biography, or new nav tab.

The predicate is:

```text
visible to the reader
AND (
  item.uploaded_by = selected member
  OR item has a photo tag whose person.member_id = selected member
)
AND any additional filters the reader subsequently selects
```

Use `EXISTS` rather than joins that multiply items. A photo matching both sides
appears and counts once. Comment tagging alone never adds an item to that
member's collection, and neither tagging mechanism grants access.

Opening the tag starts this collection with unrelated prior filters cleared.
Back returns to the originating conversation and restores its draft/scroll.
This requires new signed-in-tab journey state: the existing item-visit draft
provider does not survive route departure. The UI/UX shape specifies retention
of main, reply, and edit drafts for this round trip, with retirement on account
change or access loss and no recovery promise after reload/tab close.
The empty state says **“No photos or videos
to show.”** It does not reveal hidden totals. Retained removed-member identities
still provide a historical collection to authorized readers; unknown IDs show
an empty selection without disclosing account details.

Thread the new field through shared selection schemas, URL parsing, query keys,
cursor fingerprints, timeline rows, counts, date rail, facets, bursts, seen
operations, theater position/neighbors, and bulk selection. Use one shared
selection predicate everywhere. The existing `person` filter remains strictly
photo tagging. Keep videos in the combined collection because the current
archive and conversations treat both media types together.

## 7. Comment-tag emails

Add `onCommentTag` to account preferences and `notify_on_comment_tag` to members,
defaulting to on. Include it in the existing all-on/all-off controls and ensure
older preference payloads preserve it when omitted. Label: **“Somebody tags you
in a comment.”** Note: **“An email when someone uses @ to get your attention.”**

Use the existing transactional outbox and delivery/retry machinery, with a new
`comment_tag` email kind and template. On creation, choose at most one eligible
message per recipient: comment-tag first, then the existing uploader/commenter
policy. If comment-tag emails are off, ordinary comment notifications may still
apply under their own settings. Repeated `@Jorge` in one comment sends one email.
Self-tagging is allowed but never emails the author.

Recommended subject: **“Ana tagged you in a comment.”** Include the author's
name, readable comment text, optional video moment, and **View comment** linking
to `/items/<itemId>?comment=<commentId>`. That search parameter is new: validate
it, reveal the parent thread for replies, focus/scroll to the comment, and retain
it through sign-in/profile completion. For a deleted comment show a short
unavailable message if the item is still visible; otherwise use the normal
item refusal. Do not copy the legacy email builder's singular `/item/` path.

On editing, notify only newly added recipients who have never had a comment-tag
notification scheduled for this comment. Use a durable key such as
`comment-tag:<commentId>:<memberId>`. Removing and re-adding someone does not
generate another notification. A prior generic comment email does not suppress
their first direct comment-tag email on a later edit, because that is a new act.

Write the comment, ranges, and outbox rows in the same transaction. Removing a
tag or deleting its comment cancels queued tag mail. Removing a whole parent
thread must also cancel queued mail for any replies deleted by cascade. Ordinary
word edits keep the frozen email snapshot, following the existing mail policy.
Already-sent mail cannot be recalled.

Recheck active membership, current item access, the current tag, and the relevant
preference immediately before the provider call for this new kind, including
retries. Existing delivery checks suppression but do not provide this entire
gate. Cancel newly ineligible messages. A permission change after provider
handoff remains unavoidable; signed-in links still enforce current access.

No push notification, notification center, bulk audience send, avatar attachment,
or photo-tag email is introduced. Test with recorded/fake delivery and rendered
HTML/plain text only.

## 8. Avatars and storage lifecycle

All active members, including viewers, may change **their own** avatar. This is a
self-profile permission, separate from archive-upload permission. Profile images
are visible to signed-in members, never public. Do not infer a member's avatar
from a photo they are tagged in: the image must be chosen by its owner.

Use a dedicated, bounded avatar upload path rather than creating an archive
item. Proposed v1 input: JPEG, PNG, or WebP, at most 10 MiB and 50 megapixels,
one still image. Reject SVG, animation, corrupt data, and mismatched formats;
explain unsupported formats such as HEIC with guidance to choose a JPEG/PNG.
Decode the bytes, apply orientation and the member's validated crop selection,
and create a 256-by-256 WebP.
Do not retain the original or its metadata. Sharp is already installed; its
[resize](https://sharp.pixelplumbing.com/api-resize/) and
[output](https://sharp.pixelplumbing.com/api-output/) APIs support the intended
processing. Verify decoding/resource bounds in the actual deployment runtime.

The proposed small upload passes through Fastify for validation and processing,
with route-specific byte limits, rate limits, and bounded processing concurrency.
Document this explicit exception to the normal browser-to-B2 archive transfer
rule. Ordinary archive uploads and downloads retain their current path.

Store each image at the logical key `avatars/<memberId>/<avatarId>.webp`.

Physical bucket key: `<B2_KEY_PREFIX>/avatars/<memberId>/<avatarId>.webp`, for
example `production/avatars/...`. Object storage directories are prefixes; no
separate bucket or global bucket setting is required. Never bypass prefix
isolation, overwrite an existing avatar key, or use the name as a path segment.

Persist avatar metadata and a member's current-avatar pointer in SQLite. Reserve
each upload's key durably before writing it, so a crash cannot orphan an
untracked object. After storage succeeds, atomically replace the pointer and
queue the superseded key for deletion. On failure, retain the old pointer and
clean the abandoned reservation after its bounded lease expires. Concurrent
replacement uses an expected avatar version; stale saves fail without replacing
the newer image.

Removal clears the pointer and queues deletion. Reuse `pending_object_deletions`
and its retry drain, extending `isStorageKeyInUse` to protect current avatars and
live upload reservations. Never treat avatar keys as archive renditions or
allow cleanup to delete another environment's objects. On account access
removal, retain the chosen avatar with historical comments, as the name is
retained; the owner can remove it before leaving.

Return nullable avatar sources with expiry information in member references.
Use the existing authorized signing/cache boundary and renew expired sources;
do not store signed URLs in SQLite. Refresh member/comment caches after a change.
Previously fetched bytes cannot be recalled, so remove/replace promises apply
to subsequent app rendering. Do not make the bucket public for profile images.

Avatars never enter the timeline, bursts, photo tags, archive search, upload
counts, new-photo emails, or the combined member collection.

## 9. Contracts and delivery slices

These are proposed boundaries for a later implementation plan, not frozen API
specifications or permission to implement.

| Boundary        | Proposed change                                                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Shared contract | Comment-tag ranges; member avatar sources; account completion/name conflicts; photo-tag membership state; `onCommentTag`; member archive filter.       |
| SQLite          | Name claims; avatar reservations/current pointer; comment-tag occurrences; new preference; email-kind constraints and indexes.                         |
| Identity API    | Authenticated profile completion and rename via account routes, unique-name conflicts, own-avatar upload/removal. Preserve invite-only authentication. |
| Comment API     | Item-scoped eligible-member lookup; transactional tag-aware create/edit/delete; never reuse the admin-shaped members response for the picker.          |
| Archive API     | Combined member predicate carried through every read and selection consumer.                                                                           |
| Email           | New copy, outbox kind, recipient selection, edit deduplication, cancellation, and delivery eligibility gate.                                           |
| Web             | Shared tag input/renderer/avatar; profile setup and account editing; photo-tag suffixes; member archive heading/filter; comment deep links.            |

Recommended slices: (1) unique names and membership labels, (2) avatars,
(3) combined archive, (4) comment tags and mail, (5) integrated acceptance.
These form one release scope; each deserves its own focused implementation
plan. Names are the foundation for unambiguous selection, and archive/avatars
can then be built independently before the complete comment flow lands.

Existing integration points:

- `packages/shared/src/{comments,dtos,auth,personTagging}.ts` and timeline/email schemas.
- `apps/server/src/routes/{me,comments}.ts` and `routes/items/createItemCommentRoute.ts`.
- `apps/server/src/members/`, `administration/`, `auth/`, and setup/seed identity writes.
- `apps/server/src/archive/selectionFilterHelpers.ts` and archive/media selection consumers.
- `apps/server/src/items/{readCommentThread,enqueueCommentEmails}.ts` and `mail/`.
- `apps/server/src/b2/`, `jobs/runObjectDeletionDrain.ts`, and `upload/isStorageKeyInUse.ts`.
- `apps/web/src/surfaces/Item/ItemConversation/`, `VideoConversation/`, and `ItemTheater/`.
- `apps/web/src/system/Talk/`, `PeopleField/`, and upload/bulk/person identity views.
- `apps/web/src/surfaces/{Account,SignIn,People,Timeline}/` and route search schemas.
- `packages/emails/src/` for the new email template and rendered fixtures.

During implementation update `docs/auth.md`, `docs/administration.md`,
`docs/archive.md`, `docs/mail.md`, `docs/emails.md`, `docs/video-conversations.md`,
`docs/theater.md`, and the relevant shared/storage documentation. Add focused
profile/comment-tagging docs, and revise the old member/non-member design rule
in `DESIGN.md`. This draft does not rewrite shipped documentation to describe
unimplemented behavior.

## 10. Acceptance and remaining review

Use red/green TDD for behavior. Required acceptance scenarios:

| Area          | Evidence required before shipping                                                                                                                                                         |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Names         | Two concurrent claims cannot win; normalization collisions fail; taken-name guidance; registration redirect preserved; every write path covered; migration refuses unresolved duplicates. |
| Photo tagging | Every ad-hoc choice/chip/name shows `(not a member)`, including no collision; account names stay distinct; no automatic identity merge.                                                   |
| Avatars       | Viewer can change own image but not another's; initials fallback; validation and metadata removal; prefix isolation; replacement races, crashes, expiry renewal, and deletion retries.    |
| Input         | Keyboard/touch/IME, spaces and accents, emoji offsets, trim handling, paste, undo/redo, partial deletion, stale candidates, and failed-send draft preservation.                           |
| Rendering     | Correct link in comments, replies, previews, and theater; all historical text remains readable; no HTML interpretation.                                                                   |
| Archive       | Uploaded-only, photo-tagged-only, and overlap each correct; same-name ad-hoc person excluded; hidden items/counts absent; pagination, bursts, bulk actions, and theater agree.            |
| Email         | One recipient per create; preference combinations; no self-email; new edit target; no remove/re-add spam; cancellation, access loss, retry idempotency; local rendering only.             |
| Integrated UX | `@Jorge` selection through posting, email deep link, and combined collection; avatar visible; photo-tag wording correct.                                                                  |

Inspect desktop and phone layouts together in one visual pass across the
existing themes, plus native fullscreen, keyboard access, and reduced motion.
Fix the batch of findings and confirm once, following Impeccable's bounded QA.
The mirrored textarea technique is a specific feasibility risk: test it early
before committing all composers to it.

All user questions asked during scoping are settled. Remaining recommendations
to review in this draft are: historical-name reservation, explicit collision
mapping at rollout, supported avatar formats/adjustable crop, one comment-tag email
per recipient per comment lifetime, and including videos in the member archive.
These are proposed defaults, not additional user-confirmed requirements.
