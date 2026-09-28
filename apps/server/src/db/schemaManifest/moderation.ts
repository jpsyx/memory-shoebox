import type { SchemaManifestShape } from "./schemaManifest.ts";

/**
 * The moderation tables' half of `SCHEMA_MANIFEST`.
 *
 * The local `satisfies Pick<SchemaManifestShape, ...>` is what keeps a
 * column mistake an error at the column: without it the whole composition
 * fails as one `TS1360` at the entry point instead.
 */
export const MODERATION_MANIFEST = {
  comments: {
    id: { isNullable: false, type: "TEXT", defaultValue: null },
    item_id: { isNullable: false, type: "TEXT", defaultValue: null },
    author_member_id: { isNullable: false, type: "TEXT", defaultValue: null },
    body: { isNullable: false, type: "TEXT", defaultValue: null },
    at_seconds: { isNullable: true, type: "REAL", defaultValue: null },
    created_at: { isNullable: false, type: "TEXT", defaultValue: null },
    edited_at: { isNullable: true, type: "TEXT", defaultValue: null },
  },
  item_reactions: {
    id: { isNullable: false, type: "TEXT", defaultValue: null },
    item_id: { isNullable: false, type: "TEXT", defaultValue: null },
    member_id: { isNullable: false, type: "TEXT", defaultValue: null },
    kind: { isNullable: false, type: "TEXT", defaultValue: null },
    created_at: { isNullable: false, type: "TEXT", defaultValue: null },
  },
  comment_reactions: {
    id: { isNullable: false, type: "TEXT", defaultValue: null },
    comment_id: { isNullable: false, type: "TEXT", defaultValue: null },
    member_id: { isNullable: false, type: "TEXT", defaultValue: null },
    kind: { isNullable: false, type: "TEXT", defaultValue: null },
    created_at: { isNullable: false, type: "TEXT", defaultValue: null },
  },
  removal_requests: {
    id: { isNullable: false, type: "TEXT", defaultValue: null },
    item_id: { isNullable: true, type: "TEXT", defaultValue: null },
    requested_by_member_id: {
      isNullable: false,
      type: "TEXT",
      defaultValue: null,
    },
    reason: { isNullable: true, type: "TEXT", defaultValue: null },
    state: { isNullable: false, type: "TEXT", defaultValue: null },
    decline_reason: { isNullable: true, type: "TEXT", defaultValue: null },
    created_at: { isNullable: false, type: "TEXT", defaultValue: null },
    resolved_at: { isNullable: true, type: "TEXT", defaultValue: null },
    resolved_by_member_id: {
      isNullable: true,
      type: "TEXT",
      defaultValue: null,
    },
    item_uploader_member_id: {
      isNullable: false,
      type: "TEXT",
      defaultValue: null,
    },
    item_captured_at: { isNullable: true, type: "TEXT", defaultValue: null },
    item_storage_key: { isNullable: true, type: "TEXT", defaultValue: null },
  },
} as const satisfies Pick<
  SchemaManifestShape,
  "comments" | "item_reactions" | "comment_reactions" | "removal_requests"
>;
