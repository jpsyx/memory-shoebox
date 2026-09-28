import type {
  ForeignKeyInfo,
  IndexInfo,
} from "../schemaIntrospectionHelpers.ts";
import { indexColumns } from "./indexColumns.ts";

/** The tables migration 'moderation' creates, as `Database` names them. */
type ModerationTable =
  | "comments"
  | "item_reactions"
  | "comment_reactions"
  | "removal_requests";

/** Every foreign key on a moderation table. See `EXPECTED_FOREIGN_KEYS`. */
export const MODERATION_FOREIGN_KEYS: Record<
  ModerationTable,
  ForeignKeyInfo[]
> = {
  comments: [
    // RESTRICT on the author is the opposite choice for the opposite reason:
    // cascading would let removing one relative silently erase a decade of
    // the family's conversation on photographs that stay up.
    {
      column: "author_member_id",
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
  ],
  item_reactions: [
    {
      column: "item_id",
      referencesTable: "items",
      referencesColumn: "id",
      onDelete: "CASCADE",
    },
    {
      column: "member_id",
      referencesTable: "members",
      referencesColumn: "id",
      onDelete: "CASCADE",
    },
  ],
  comment_reactions: [
    // The transitive cascade a polymorphic reactions table could not have
    // given: deleting an item takes its comments and their reactions.
    {
      column: "comment_id",
      referencesTable: "comments",
      referencesColumn: "id",
      onDelete: "CASCADE",
    },
    {
      column: "member_id",
      referencesTable: "members",
      referencesColumn: "id",
      onDelete: "CASCADE",
    },
  ],
  removal_requests: [
    // SET NULL on `item_id` is the one exception in the cascade matrix, so
    // takedown history survives the takedown. The three member keys are
    // RESTRICT; the document states it for the asker and leaves the other two
    // unstated, and migration 0005 matched the asker.
    {
      column: "item_id",
      referencesTable: "items",
      referencesColumn: "id",
      onDelete: "SET NULL",
    },
    {
      column: "item_uploader_member_id",
      referencesTable: "members",
      referencesColumn: "id",
      onDelete: "RESTRICT",
    },
    {
      column: "requested_by_member_id",
      referencesTable: "members",
      referencesColumn: "id",
      onDelete: "RESTRICT",
    },
    {
      column: "resolved_by_member_id",
      referencesTable: "members",
      referencesColumn: "id",
      onDelete: "RESTRICT",
    },
  ],
};

/** Every declared index on a moderation table. See `EXPECTED_INDEXES`. */
export const MODERATION_INDEXES: Record<ModerationTable, IndexInfo[]> = {
  comments: [
    // Covers both the read and the ordering.
    {
      name: "comments_item_created_at",
      columns: indexColumns("item_id", "created_at"),
      isUnique: false,
    },
  ],
  item_reactions: [
    // One member's single reaction to one item, which is what the unique
    // says. Without it the toggle becomes an append.
    {
      name: "item_reactions_item_member",
      columns: indexColumns("item_id", "member_id"),
      isUnique: true,
    },
  ],
  comment_reactions: [
    {
      name: "comment_reactions_comment_member",
      columns: indexColumns("comment_id", "member_id"),
      isUnique: true,
    },
  ],
  removal_requests: [
    // `__one_open_per_asker` is the partial unique: one person cannot have
    // two open requests on one photograph, but a declined request still
    // offers "Ask again".
    {
      name: "removal_requests__by_item",
      columns: indexColumns("item_id"),
      isUnique: false,
    },
    {
      name: "removal_requests__by_state",
      columns: indexColumns("state", "created_at"),
      isUnique: false,
    },
    {
      name: "removal_requests__one_open_per_asker",
      columns: indexColumns("item_id", "requested_by_member_id"),
      isUnique: true,
    },
    {
      name: "removal_requests__open_by_uploader",
      columns: indexColumns("item_uploader_member_id", "state", "created_at"),
      isUnique: false,
    },
  ],
};

/**
 * Every table-level `UNIQUE` on a moderation table. See
 * `EXPECTED_UNIQUE_CONSTRAINTS`.
 */
export const MODERATION_UNIQUE_CONSTRAINTS: Record<
  ModerationTable,
  string[][]
> = {
  comments: [],
  item_reactions: [],
  comment_reactions: [],
  removal_requests: [],
};
