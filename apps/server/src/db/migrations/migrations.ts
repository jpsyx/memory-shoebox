import type { Migration } from "kysely";
import * as migration0001IdentityAndAccess from "./0001_identity_and_access.ts";
import * as migration0002Visibility from "./0002_visibility.ts";
import * as migration0003Archive from "./0003_archive.ts";
import * as migration0004CommentsAndReactions from "./0004_comments_and_reactions.ts";
import * as migration0005Moderation from "./0005_moderation.ts";
import * as migration0006Upload from "./0006_upload.ts";
import * as migration0007OperationsAndAudit from "./0007_operations_and_audit.ts";
import * as migration0008MissingChildIndexes from "./0008_missing_child_indexes.ts";

/**
 * Every migration, keyed by the name recorded in the migration table.
 *
 * Migrations are registered explicitly rather than discovered from disk: the
 * server runs TypeScript directly, so a filesystem-scanning provider would
 * behave differently in development and in the production container.
 *
 * To add one, create `NNNN_description.ts` beside this file exporting a
 * `Migration`, then add it here. Keys are ordered lexicographically, so keep
 * the zero-padded numeric prefix. Never edit or reorder a migration that has
 * already shipped: deployed databases have recorded it as applied.
 */
export const migrations: Record<string, Migration> = {
  "0001_identity_and_access": migration0001IdentityAndAccess,
  "0002_visibility": migration0002Visibility,
  "0003_archive": migration0003Archive,
  "0004_comments_and_reactions": migration0004CommentsAndReactions,
  "0005_moderation": migration0005Moderation,
  "0006_upload": migration0006Upload,
  "0007_operations_and_audit": migration0007OperationsAndAudit,
  "0008_missing_child_indexes": migration0008MissingChildIndexes,
};
