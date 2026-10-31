# Comment tagging

Comment references identify accounts independently of their displayed names.
A new reference comes from selecting a member. Typing or pasting `@name` alone
remains ordinary text. The comment body remains plain text.

## Range contract

Each input occurrence contains `memberId`, `start`, and `end`, with an optional
`tagId` to retain an existing occurrence during edits. Offsets count JavaScript
UTF-16 code units, include the leading `@`, and use an exclusive end. Returned
occurrences include their stable ID and a validated label snapshot without `@`.
Repeated occurrences of one member are separate ranges.

The shared normalization helper validates raw integer bounds, ascending order,
non-overlap, and unique retained occurrence IDs. Ranges cannot split surrogate
pairs or touch whitespace removed by trimming. It trims the body and subtracts
the removed leading UTF-16 length from both offsets in one operation. The
normalized body must contain 1 to 4,000 UTF-16 code units.

Create requests default missing `commentTags` to an empty array. Update requests
preserve an omitted array, enabling the stored-comment check to distinguish old
clients from explicit tag removal. Responses always include an array.

## Persistence and preferences

Migration `0021_comment_tags` adds `comment_tags`, keyed by occurrence ID, with
comment/member foreign keys, checked integer offsets, a label snapshot, and a
unique start position per comment. Comment deletion cascades to occurrences.
The application validates body bounds, cross-row overlap, account identity and
eligibility before persisting references.

`comment_tag_notifications` is a permanent `(comment_id, member_id)` scheduling
ledger. Removing an occurrence or scrubbing an outbound email cannot erase the
scheduling fact. Deleting the comment cascades to its ledger entries.

The migration adds the default-on `members.notify_on_comment_tag` preference and
permits the `comment_tag` outbound email kind. It rebuilds the outbound table
with its existing shape and indexes, preserving historical IDs, rows, sender
snapshots, and delivery-event references. The migration runner verifies database
and foreign key integrity before committing.

Account reads return `onCommentTag` from the stored preference. PATCH accepts the
original four booleans without the new field and preserves its current value;
an explicit fifth boolean updates it. Responses require all five fields.

## Candidate lookup

`GET /api/items/:itemId/comment-tag-candidates?q=<name>` returns
`{ members: MemberRef[] }`. The caller must first have item access. Hidden and
missing items return the same 404, and lookup never records an item open.
The query defaults to empty and accepts at most 80 UTF-16 units.

Only active members with a completed, nonempty account name and current item
access appear. The ordinary visibility predicate includes uploader and admin
access and current group membership. Photo tags and email preferences grant
no eligibility. Self-selection is allowed. Responses expose only member ID,
display name, and avatar, with no email, status, preferences or exclusion reason.

Search uses the N1 NFC/whitespace/lowercase comparison key, keeping accents
meaningful. Results rank exact, prefix, then substring matches; normalized name
and member ID break ties using deterministic code-unit comparison. An empty
query returns the full eligible directory alphabetically, without pagination.

## Transactional writes and historical identity

Create and edit routes validate references inside their immediate write
transaction. Current account names, item visibility and rule membership are
read under that lock. A new occurrence must match the exact current account
name prefixed by `@` and pass eligibility. Names never resolve identity.

A retained occurrence ID must belong to the edited comment, appear once, keep
its member ID, and match its stored label snapshot. Its offsets may move.
Renamed or now-ineligible members remain valid historical references; a copied
occurrence without its retained ID must pass current eligibility again.

Stale names or forged retained identities return `409 comment_tag_stale`.
Unavailable targets return `409 comment_tag_unavailable` with the same generic
response whether missing, removed, incomplete or unable to view the item.
Both identify the input position through `details.fieldErrors.commentTags.N`.
Omitted tags on an already-tagged comment return
`409 comment_tags_reload_required` on `details.fieldErrors.commentTags`.
Explicit `[]` removes all references.

The body, ranges, tag scheduling ledger, and queued mail commit or roll back
together. Author-only edits, fixed moments and one-level reply rules remain
unchanged. Thread reads batch occurrences in one query alongside the existing
comment and reaction queries; historical labels do not change on account rename.

## Implementation boundary

Contracts, migration, candidate lookup, persisted reads, transactional writes,
notification scheduling/delivery and the account preference are connected.
The shared range-aware composer and posted-tag renderer are connected across
main comments, replies, edits, Talk rows and video moment previews. Comment
arrival and collection-return journeys are connected through the signed-in session owner.

## Email preference and delivery

The fifth account switch, immediately after comments on uploads, reads
“Somebody tags you in a comment” and “An email when someone uses @ to get your
attention.” It defaults on, saves independently and participates in all-off and
all-on. A failed save restores the cached saved value and presents a nearby
retry message. When off it explains that other enabled upload/conversation
settings can still send ordinary mail. `/account?email=comment-tag` focuses
this switch after sign-in or required profile completion; arbitrary search
values cannot select other targets or trigger preference writes.

At comment creation, enabled tag mail wins over the existing generic policy
for that recipient. On edits only newly tagged recipients without a lifetime
scheduling record can receive a tag message. Duplicate mentions and self-tags
never multiply messages. The ledger survives removal/re-addition and outbox
scrubbing, including failed-configuration scheduling. Queued tag messages are
cancelled when their recipient is removed, and deleting a parent cancels mail
for its replies too. A final gate after rendering and sender freezing checks
current eligibility, preference, comment, tag and item access on every attempt.
See [mail.md](mail.md) for delivery/recovery and [emails.md](emails.md) for copy.

## Writing and correcting tags

`CommentTagInputField` owns the native textarea, its noninteractive mirror, the
Mantine Combobox and local undo history. Every composer passes a controlled
`CommentDraft` containing `body` and `commentTags`; existing conversation hooks
retain write, authorization and video-moment ownership. Plain typing, copying or
pasting never creates a member reference. Selecting a result inserts `@Name `.
The picker uses item/query-specific cache entries and never displays a preceding
query's results while the current lookup is pending.

At the start, after whitespace, or after opening punctuation, `@` opens the
eligible directory. Multiword names remain searchable. The initially highlighted
result requires an explicit click, tap or Enter. Arrows navigate. Tab dismisses
without choosing; Escape dismisses only the picker. Cmd/Ctrl+Enter chooses an
open result before a later shortcut can submit. Composition cannot select or
submit. Failed lookup offers Retry and ordinary text remains usable.

The mirror copies the textarea's computed typography, padding, dimensions and
scroll offsets. An ink wash and metric-preserving text stroke distinguish
selected ranges without introducing clickable content into editing. Native
selection, caret and accessibility remain on the textarea. Edits shift unaffected
ranges and remove references whose interiors are changed. Undo/redo snapshots
words, references and both selection endpoints together; native history events
and keyboard shortcuts share that history.

Near 4,000 UTF-16 units the field shows a counter. Over-limit input is retained,
including a long member selection, with the number of characters to remove;
posting/saving is blocked until it fits. Pending writes leave editing available.
Main, reply and edit success callbacks only clear/close the matching submitted
revision, preserving any newer words and selected members. A successful edit
also carries its saved occurrences back to the still-open draft. Surviving
occurrences acquire their server `tagId` even after prefix edits move their
ranges; newly selected replacements never inherit another occurrence's ID.
Immutable internal provenance on derived ranges establishes that continuity.
A session-owned per-editor acknowledgement map also restores those known IDs when
undo/redo revisits an earlier snapshot. Neither internal provenance nor the map
is serialized or shared across cancelled drafts or account/session lifetimes.
A remounted field starts fresh local undo history from the restored current draft.

Structured tag failures identify submitted occurrences. A still-current refused
tag offers Keep as plain text or Choose another member. A refreshed account name
offers Use updated name without rewriting surrounding words. A failure cannot
attach to a replacement selection at the same index, even for the same member.
Shifted/replaced occurrences conservatively discard obsolete correction actions;
the ordinary retry validates the current payload. Historical edit occurrences
retain their server `tagId` until edited inside or explicitly replaced.

`CommentTagText` slices stored ranges into React text and native collection links
using the saved label snapshot and `/?member=<memberId>`. Typed lookalikes remain
plain text. This same renderer serves comments, Talk rows and moment previews.
Posting success makes no claim about email delivery.

The early isolated Chromium prototype verified matching mirror/input wrapping,
scroll metrics and unchanged glyph rectangles at desktop, phone width and 200%
CSS scale, plus reference-aware undo and CDP engine composition. Physical mobile
keyboards, OS IMEs and integrated cross-browser/fullscreen acceptance remain
separate verification work; DOM tests do not claim those results.

## Comment arrival and collection return

The item route accepts only an optional UUID `comment` search field. Sign-in and
required profile completion retain the intended deep link. After a fresh item
read authorizes the current entry, arrival reveals the parent/reply thread and
focuses the readable comment container, never Edit or Delete. Visible items with
an unknown/deleted comment show **That comment is no longer available.** Missing
or invisible items keep their ordinary refusal without cached conversation text.
Arrival does not seek or play video.

Normal same-tab posted-tag links navigate to the clean member collection and
record one return entry in `ConversationJourneyProvider`. Modified clicks and
new-tab actions retain native anchor semantics and create no new return promise.
Only the matching session journey adds **Back to comment** to the collection.
Talk and moment-preview links carry existing item/comment IDs as return anchors;
no server comment body or media URL enters the journey.

The same owner retains main/reply/edit draft values, ranges, revision, selection,
captured moment and started state across route departure. Back and **Back to
comment** restore draft, scroll and focus after a new current-entry authorization
response; old cached detail and abandoned responses cannot unlock restoration.
Window/native fullscreen intent uses the existing host, with window fallback and
unchanged innermost-overlay Escape handling. Returning never auto-resumes video.
Late sends/saves clear only their submitted revision, and successful edits hydrate
surviving occurrence provenance even when their editor has unmounted. Mutation
cache reconciliation and acknowledgements are fenced by submitted item-query and
private authority lifetimes. Pending writes stay exclusive after remount.

Sign-out, account/role changes, observed actual session replacement and explicit
private-cache retirement destroy the owner, including captured action closures.
Item refusal retires that item's main/reply/edit and return metadata. The self
response's `sessionId` identifies the authenticated device; member-global
`lastSignedInAt` is deliberately not a lifetime marker. Another device's sign-in
does not erase this tab. State exists only in memory for the signed-in tab: no
URL/localStorage text, cross-account singleton or reload/tab-close promise.
