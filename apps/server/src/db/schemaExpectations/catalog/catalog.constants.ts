import type { ForeignKeyInfo } from "../../schemaIntrospectionHelpers.ts";
import type { CatalogTable } from "./catalog.types.ts";

/** Every foreign key on a catalog table. See `EXPECTED_FOREIGN_KEYS`. */
export const CATALOG_FOREIGN_KEYS: Record<CatalogTable, ForeignKeyInfo[]> = {
  item_burst_history: [
    {
      column: "cover_item_id",
      referencesTable: "items",
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
      column: "upload_session_id",
      referencesTable: "upload_sessions",
      referencesColumn: "id",
      onDelete: "RESTRICT",
    },
  ],
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
  // Migration 0017 preserves these relationships and indexes during rebuild.
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

/**
 * Every table-level `UNIQUE` on a catalog table. See
 * `EXPECTED_UNIQUE_CONSTRAINTS`.
 */
export const CATALOG_UNIQUE_CONSTRAINTS: Record<CatalogTable, string[][]> = {
  item_burst_history: [],
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
