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

## Implementation boundary

The contracts and migration are present. Existing comment DTO producers currently
return empty occurrence arrays. Persisted reads/writes, candidate eligibility,
notification scheduling/delivery, and the composer and preference UI are connected
in the subsequent implementation tasks. The current email repair helper excludes
the new kind until its payload and template are introduced.
