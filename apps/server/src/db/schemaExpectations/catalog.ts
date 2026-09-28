import type {
  ForeignKeyInfo,
  IndexInfo,
} from "../schemaIntrospectionHelpers.ts";
import { indexColumns } from "./indexColumns.ts";

/** The tables migration 'catalog' creates, as `Database` names them. */
type CatalogTable =
  | "items"
  | "item_renditions"
  | "bursts"
  | "milestones"
  | "item_milestones"
  | "item_capture_date_changes"
  | "tags"
  | "item_tags"
  | "people"
  | "item_people";

/** Every foreign key on a catalog table. See `EXPECTED_FOREIGN_KEYS`. */
export const CATALOG_FOREIGN_KEYS: Record<CatalogTable, ForeignKeyInfo[]> = {
  items: [
    // `burst_id` SET NULL: dissolving a burst leaves forty-five prints
    // standing. `upload_session_id` SET NULL: purging old sessions must not
    // endanger photographs. `visibility_rule_id` RESTRICT: an item with no
    // rule has undefined visibility, which fails open.
    {
      column: "burst_id",
      referencesTable: "bursts",
      referencesColumn: "id",
      onDelete: "SET NULL",
    },
    {
      column: "upload_session_id",
      referencesTable: "upload_sessions",
      referencesColumn: "id",
      onDelete: "SET NULL",
    },
    {
      column: "uploaded_by",
      referencesTable: "members",
      referencesColumn: "id",
      onDelete: "RESTRICT",
    },
    {
      column: "visibility_rule_id",
      referencesTable: "visibility_rules",
      referencesColumn: "id",
      onDelete: "RESTRICT",
    },
  ],
  item_renditions: [
    // CASCADE, plus an object delete per row. The only cascade with a side
    // effect outside the database.
    {
      column: "item_id",
      referencesTable: "items",
      referencesColumn: "id",
      onDelete: "CASCADE",
    },
  ],
  bursts: [
    // `upload_session_id` is RESTRICT here and SET NULL on `items`, which
    // `data-models.md` flags as an unresolved contradiction that whoever
    // implements session purging has to settle. Asserted as built and as
    // specified, so the day it is settled this line has to change on purpose.
    {
      column: "cover_item_id",
      referencesTable: "items",
      referencesColumn: "id",
      onDelete: "SET NULL",
    },
    {
      column: "upload_session_id",
      referencesTable: "upload_sessions",
      referencesColumn: "id",
      onDelete: "RESTRICT",
    },
  ],
  milestones: [
    // SET NULL: a milestone is a family fact that outlives whoever typed it.
    {
      column: "created_by",
      referencesTable: "members",
      referencesColumn: "id",
      onDelete: "SET NULL",
    },
  ],
  item_milestones: [
    // CASCADE on `milestone_id` is the delete dialog's own promise: the
    // occasion goes, the 212 photographs stay. It removes join rows only, and
    // a cascade in the other direction would be the most damaging bug the
    // product could ship.
    {
      column: "attached_by",
      referencesTable: "members",
      referencesColumn: "id",
      onDelete: "SET NULL",
    },
    {
      column: "item_id",
      referencesTable: "items",
      referencesColumn: "id",
      onDelete: "CASCADE",
    },
    {
      column: "milestone_id",
      referencesTable: "milestones",
      referencesColumn: "id",
      onDelete: "CASCADE",
    },
  ],
  item_capture_date_changes: [
    {
      column: "changed_by",
      referencesTable: "members",
      referencesColumn: "id",
      onDelete: "RESTRICT",
    },
    {
      column: "item_id",
      referencesTable: "items",
      referencesColumn: "id",
      onDelete: "CASCADE",
    },
    {
      column: "milestone_id",
      referencesTable: "milestones",
      referencesColumn: "id",
      onDelete: "SET NULL",
    },
  ],
  tags: [
    // `tags` does have a foreign key, which is easy to miss because the table
    // is otherwise pure vocabulary.
    {
      column: "created_by",
      referencesTable: "members",
      referencesColumn: "id",
      onDelete: "SET NULL",
    },
  ],
  item_tags: [
    {
      column: "item_id",
      referencesTable: "items",
      referencesColumn: "id",
      onDelete: "CASCADE",
    },
    {
      column: "tag_id",
      referencesTable: "tags",
      referencesColumn: "id",
      onDelete: "CASCADE",
    },
    {
      column: "tagged_by",
      referencesTable: "members",
      referencesColumn: "id",
      onDelete: "SET NULL",
    },
  ],
  people: [
    // All three SET NULL. The member link goes on `people` rather than on
    // `members`, because the person record long predates the member record
    // and may never get one.
    {
      column: "created_by",
      referencesTable: "members",
      referencesColumn: "id",
      onDelete: "SET NULL",
    },
    {
      column: "member_id",
      referencesTable: "members",
      referencesColumn: "id",
      onDelete: "SET NULL",
    },
    {
      column: "preferred_face_item_id",
      referencesTable: "items",
      referencesColumn: "id",
      onDelete: "SET NULL",
    },
  ],
  item_people: [
    // RESTRICT on `person_id` differs from `item_tags` on purpose: deleting a
    // person would silently strip them from hundreds of photographs with no
    // undo, and the removal-request flow depends on knowing who is in one.
    {
      column: "item_id",
      referencesTable: "items",
      referencesColumn: "id",
      onDelete: "CASCADE",
    },
    {
      column: "person_id",
      referencesTable: "people",
      referencesColumn: "id",
      onDelete: "RESTRICT",
    },
    {
      column: "tagged_by",
      referencesTable: "members",
      referencesColumn: "id",
      onDelete: "SET NULL",
    },
  ],
};

/** Every declared index on a catalog table. See `EXPECTED_INDEXES`. */
export const CATALOG_INDEXES: Record<CatalogTable, IndexInfo[]> = {
  items: [
    // `items_captured_on_rule_id` is the timeline's covering index and its
    // column order is load-bearing: the group-by runs in index order, the
    // visibility filter is checked inside the index, and a `LIMIT 30` stops
    // early without touching the table. Rebuilt on any other columns it
    // would still exist, still be named the same, and stop covering.
    // `items_rule_captured_on` is its mirror, kept so the planner can choose.
    {
      name: "items_burst_index",
      columns: indexColumns("burst_id", "burst_index"),
      isUnique: false,
    },
    {
      name: "items_captured_on_rule_id",
      columns: indexColumns("captured_on desc", "visibility_rule_id", "id"),
      isUnique: false,
    },
    {
      name: "items_rule_captured_on",
      columns: indexColumns("visibility_rule_id", "captured_on"),
      isUnique: false,
    },
    // UNIQUE, because `seq` is the monotonic arrival order the unseen
    // comparisons read. Two items sharing a `seq` makes that comparison
    // ambiguous and nothing else notices.
    {
      name: "items_seq",
      columns: indexColumns("seq"),
      isUnique: true,
    },
    {
      name: "items_session_captured",
      columns: indexColumns("upload_session_id", "captured_on", "captured_at"),
      isUnique: false,
    },
    {
      name: "items_uploaded_by",
      columns: indexColumns("uploaded_by"),
      isUnique: false,
    },
  ],
  item_renditions: [
    // Both unique, so a double upload cannot point two rows at one object and
    // make deletion ambiguous.
    {
      name: "item_renditions_item_purpose",
      columns: indexColumns("item_id", "purpose"),
      isUnique: true,
    },
    {
      name: "item_renditions_storage_key",
      columns: indexColumns("storage_key"),
      isUnique: true,
    },
  ],
  bursts: [
    // Not in the document's index list. Migration 0003 added it so that
    // dissolving a burst, which fires `ON DELETE SET NULL` on every cover
    // reference, does not scan the whole table.
    {
      name: "bursts_cover_item",
      columns: indexColumns("cover_item_id"),
      isUnique: false,
    },
    // Not in the document's index list either. Migration 0008 added it for the
    // same reason one migration later than it should have been: the
    // `upload_session_id` RESTRICT still has to look before it refuses, so a
    // session purge without this scans every burst.
    {
      name: "bursts_upload_session",
      columns: indexColumns("upload_session_id"),
      isUnique: false,
    },
  ],
  milestones: [
    // For the overlap predicate. Not unique, and the document says why: two
    // "Mateo's birthday" milestones a year apart are both correct.
    {
      name: "milestones_span",
      columns: indexColumns("starts_on", "ends_on"),
      isUnique: false,
    },
  ],
  item_milestones: [
    {
      name: "item_milestones_item_milestone",
      columns: indexColumns("item_id", "milestone_id"),
      isUnique: true,
    },
    {
      name: "item_milestones_milestone_item",
      columns: indexColumns("milestone_id", "item_id"),
      isUnique: false,
    },
  ],
  item_capture_date_changes: [
    // Not in the document's index list. Migration 0003 added it for the audit
    // trail's own read, which is "this item's changes, newest first".
    {
      name: "item_capture_date_changes_item_changed",
      columns: indexColumns("item_id", "changed_at desc"),
      isUnique: false,
    },
    // Not in the document's index list. Migration 0008 added it because the
    // `milestone_id` SET NULL fires on a milestone delete the API promises
    // nothing blocks, against a table that grows with the archive, and the
    // index above leads with `item_id` and so cannot serve it. Partial: only a
    // `milestone_reconcile` row carries a milestone at all.
    {
      name: "item_capture_date_changes_milestone",
      columns: indexColumns("milestone_id"),
      isUnique: false,
    },
  ],
  tags: [],
  item_tags: [
    // Indexed both ways so a multi-filter query can drive from whichever
    // predicate is most selective. Only the forward direction is unique.
    {
      name: "item_tags_item_tag",
      columns: indexColumns("item_id", "tag_id"),
      isUnique: true,
    },
    {
      name: "item_tags_tag_item",
      columns: indexColumns("tag_id", "item_id"),
      isUnique: false,
    },
  ],
  people: [
    // The partial unique that stops two person records claiming one account,
    // without stopping many people from having no account at all.
    {
      name: "people_member",
      columns: indexColumns("member_id"),
      isUnique: true,
    },
  ],
  item_people: [
    {
      name: "item_people_item_person",
      columns: indexColumns("item_id", "person_id"),
      isUnique: true,
    },
    {
      name: "item_people_person_item",
      columns: indexColumns("person_id", "item_id"),
      isUnique: false,
    },
  ],
};

/**
 * Every table-level `UNIQUE` on a catalog table. See
 * `EXPECTED_UNIQUE_CONSTRAINTS`.
 */
export const CATALOG_UNIQUE_CONSTRAINTS: Record<CatalogTable, string[][]> = {
  items: [],
  item_renditions: [],
  bursts: [],
  milestones: [],
  item_milestones: [],
  item_capture_date_changes: [],
  // Free text, normalised on write, so "Hospital" and "hospital" must not
  // become two tags.
  tags: [["name_normalized"]],
  item_tags: [],
  people: [],
  item_people: [],
};
