/**
 * One comment on one item, optionally pinned to a moment in a video.
 *
 * **No visibility column.** A comment inherits its item's rule exactly, and
 * copying it here would be a second source of truth that can drift.
 *
 * **No `parent_comment_id`.** The thread is flat in both surfaces. The
 * notification line "a reply on something you posted or commented on" means
 * another top-level comment on the same item, not threading.
 *
 * `edited_at` is not optional decoration: it is what the **edited** marker
 * reads off, and a comment that changes under a reader with no sign of it is
 * worse than one that cannot change at all (Decision 8).
 *
 * `at_seconds` is a float rather than an integer because the scrubber produces
 * `fraction * duration`. It is null except on a comment pinned to a moment.
 */
export type CommentsTable = {
  id: string;
  item_id: string;
  author_member_id: string;
  body: string;
  at_seconds: number | null;
  created_at: string;
  edited_at: string | null;
};

/**
 * One member's single reaction to one item.
 *
 * `UNIQUE (item_id, member_id)` is the whole of "one per member per thing":
 * changing a reaction is `INSERT ... ON CONFLICT DO UPDATE SET kind =
 * excluded.kind` and pressing your own again is a `DELETE`.
 *
 * **No stored count anywhere.** A reaction total is a per-viewer aggregate
 * like every other count in the product, and the rows are returned rather than
 * summed: the popover needs the names anyway.
 */
export type ItemReactionsTable = {
  id: string;
  item_id: string;
  member_id: string;
  kind: string;
  created_at: string;
};

/**
 * One member's single reaction to one comment.
 *
 * Identical to `item_reactions` but for its parent, and **deliberately not
 * merged with it** into one polymorphic table. SQLite cannot declare a foreign
 * key against two tables, so a polymorphic reactions table would have no
 * cascade at all: an orphaned reaction renders nothing and alerts nobody. Two
 * tables buy engine-enforced cleanup for the price of one duplicated
 * four-column table.
 */
export type CommentReactionsTable = {
  id: string;
  comment_id: string;
  member_id: string;
  kind: string;
  created_at: string;
};

/**
 * One request that a photograph come down, and the record of how it was
 * settled.
 *
 * `item_id` is `SET NULL`, the one exception to cascade in the whole schema:
 * the commonest way a request ends is that somebody deletes the item, and a
 * `CASCADE` would destroy the request in exactly the case where the record
 * matters most. The three `item_*` columns are a snapshot taken at request
 * time so a settled request still renders with nothing left to join to, and
 * `item_uploader_member_id` in particular is what the uploader's queue scopes
 * by, never a join to `items`, or a deleted item would drop it from their own
 * resolved history.
 *
 * `(state = 'open') = (resolved_at IS NULL)` is an equivalence, not an
 * implication: it is what makes a request resolve exactly once, enforced by
 * the database rather than by a handler. A decline additionally always
 * carries a `decline_reason`, unlike the free-form `reason` on the request
 * itself.
 */
export type RemovalRequestsTable = {
  id: string;
  item_id: string | null;
  requested_by_member_id: string;
  reason: string | null;
  state: string;
  decline_reason: string | null;
  created_at: string;
  resolved_at: string | null;
  resolved_by_member_id: string | null;
  item_uploader_member_id: string;
  item_captured_at: string | null;
  item_storage_key: string | null;
};
