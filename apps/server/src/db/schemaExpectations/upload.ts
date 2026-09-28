import type {
  ForeignKeyInfo,
  IndexInfo,
} from "../schemaIntrospectionHelpers.ts";
import { indexColumns } from "./indexColumns.ts";

/** The tables migration 'upload' creates, as `Database` names them. */
type UploadTable =
  | "upload_sessions"
  | "upload_files"
  | "upload_batch_edits"
  | "upload_batch_edit_targets"
  | "pending_object_deletions";

/** Every foreign key on a upload table. See `EXPECTED_FOREIGN_KEYS`. */
export const UPLOAD_FOREIGN_KEYS: Record<UploadTable, ForeignKeyInfo[]> = {
  upload_sessions: [
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
  upload_files: [
    // SET NULL on `item_id`: deleting a photograph later must not erase the
    // record that a file arrived, since the upload history is the only place
    // the original filename and the transfer outcome live.
    {
      column: "item_id",
      referencesTable: "items",
      referencesColumn: "id",
      onDelete: "SET NULL",
    },
    {
      column: "upload_session_id",
      referencesTable: "upload_sessions",
      referencesColumn: "id",
      onDelete: "CASCADE",
    },
  ],
  upload_batch_edits: [
    // The three subject columns take different rules and the difference is
    // deliberate: `milestone_id` CASCADE because deleting a milestone is
    // promised to block on nothing, `tag_id` and `person_id` RESTRICT because
    // neither carries a snapshot to fall back on once nulled.
    {
      column: "created_by",
      referencesTable: "members",
      referencesColumn: "id",
      onDelete: "RESTRICT",
    },
    {
      column: "milestone_id",
      referencesTable: "milestones",
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
      column: "tag_id",
      referencesTable: "tags",
      referencesColumn: "id",
      onDelete: "RESTRICT",
    },
    {
      column: "upload_session_id",
      referencesTable: "upload_sessions",
      referencesColumn: "id",
      onDelete: "CASCADE",
    },
  ],
  upload_batch_edit_targets: [
    {
      column: "upload_batch_edit_id",
      referencesTable: "upload_batch_edits",
      referencesColumn: "id",
      onDelete: "CASCADE",
    },
    {
      column: "upload_file_id",
      referencesTable: "upload_files",
      referencesColumn: "id",
      onDelete: "CASCADE",
    },
  ],
  // A storage key whose row is already gone, so there is nothing left to
  // reference.
  pending_object_deletions: [],
};

/** Every declared index on a upload table. See `EXPECTED_INDEXES`. */
export const UPLOAD_INDEXES: Record<UploadTable, IndexInfo[]> = {
  upload_sessions: [
    // "This member's non-terminal session", which is the leading-column
    // shape both the current-session read and the conflict check want.
    {
      name: "upload_sessions__by_uploader_state",
      columns: indexColumns("uploaded_by", "state"),
      isUnique: false,
    },
  ],
  upload_files: [
    // `__session_content_hash` is unique so a retry is idempotent: lose the
    // `UNIQUE` and a re-sent file becomes a second row and a second item.
    // `__storage_key` is unique so one object belongs to one file across the
    // whole deployment.
    //
    // `__by_item` is not in the document's index list. Migration 0006 added
    // it for the same reason as `bursts_cover_item`: deleting an item fires
    // `ON DELETE SET NULL` here and would otherwise scan every file row.
    {
      name: "upload_files__by_item",
      columns: indexColumns("item_id"),
      isUnique: false,
    },
    {
      name: "upload_files__session_content_hash",
      columns: indexColumns("upload_session_id", "content_hash"),
      isUnique: true,
    },
    {
      name: "upload_files__session_position",
      columns: indexColumns("upload_session_id", "position"),
      isUnique: true,
    },
    {
      name: "upload_files__session_state",
      columns: indexColumns("upload_session_id", "state"),
      isUnique: false,
    },
    {
      name: "upload_files__storage_key",
      columns: indexColumns("storage_key"),
      isUnique: true,
    },
  ],
  upload_batch_edits: [
    // Not in the document's index list. Migration 0006 added it for the
    // "What you have added" list, which reads one session's edits in the
    // order they were made.
    {
      name: "upload_batch_edits__by_session",
      columns: indexColumns("upload_session_id", "created_at"),
      isUnique: false,
    },
  ],
  upload_batch_edit_targets: [
    // Unique on the pair, plus an index on the file alone, because ingest
    // runs the other way round: it asks what applies to this file.
    {
      name: "upload_batch_edit_targets__by_file",
      columns: indexColumns("upload_file_id"),
      isUnique: false,
    },
    {
      name: "upload_batch_edit_targets__edit_file",
      columns: indexColumns("upload_batch_edit_id", "upload_file_id"),
      isUnique: true,
    },
  ],
  pending_object_deletions: [
    // UNIQUE: enqueuing one key twice would have the drain delete an object
    // that a later item legitimately reused.
    {
      name: "pending_object_deletions__storage_key",
      columns: indexColumns("storage_key"),
      isUnique: true,
    },
  ],
};

/**
 * Every table-level `UNIQUE` on a upload table. See
 * `EXPECTED_UNIQUE_CONSTRAINTS`.
 */
export const UPLOAD_UNIQUE_CONSTRAINTS: Record<UploadTable, string[][]> = {
  upload_sessions: [],
  upload_files: [],
  upload_batch_edits: [],
  upload_batch_edit_targets: [],
  pending_object_deletions: [],
};
