import { sql, type Kysely } from "kysely";

/**
 * Identity and access: who may sign in, from which device, and which groups
 * they belong to.
 *
 * `members` is never hard-deleted. Removal is a `status` change, which is why
 * every authorship key elsewhere in the schema can point at it with `RESTRICT`
 * and never actually fire. The `CASCADE` keys here are the exception and they
 * are deliberate: a live sign-in code or session outliving its member would be
 * an authentication bypass, so those rows go when the row they authenticate
 * does, even though nothing in the product deletes one.
 */
export const up = async (database: Kysely<unknown>): Promise<void> => {
  await database.schema
    .createTable("members")
    .addColumn("id", "text", (column) => {
      return column.primaryKey().notNull();
    })
    .addColumn("email", "text", (column) => {
      return column.notNull().unique();
    })
    .addColumn("display_name", "text")
    .addColumn("role", "text", (column) => {
      return column
        .notNull()
        .defaultTo("viewer")
        .check(sql`role IN ('viewer', 'uploader', 'admin')`);
    })
    .addColumn("status", "text", (column) => {
      return column
        .notNull()
        .defaultTo("invited")
        .check(sql`status IN ('invited', 'active', 'removed')`);
    })
    .addColumn("notify_on_upload", "integer", (column) => {
      return column
        .notNull()
        .defaultTo(1)
        .check(sql`notify_on_upload IN (0, 1)`);
    })
    .addColumn("notify_on_comment", "integer", (column) => {
      return column
        .notNull()
        .defaultTo(1)
        .check(sql`notify_on_comment IN (0, 1)`);
    })
    .addColumn("notify_on_reply", "integer", (column) => {
      return column
        .notNull()
        .defaultTo(1)
        .check(sql`notify_on_reply IN (0, 1)`);
    })
    .addColumn("notify_on_removal", "integer", (column) => {
      return column
        .notNull()
        .defaultTo(1)
        .check(sql`notify_on_removal IN (0, 1)`);
    })
    .addColumn("joined_at", "text")
    .addColumn("last_signed_in_at", "text")
    .addColumn("last_seen_at", "text")
    .addColumn("removed_at", "text")
    .addColumn("created_at", "text", (column) => {
      return column.notNull();
    })
    .execute();

  // `email` is not a foreign key: a row is written for an unknown address too,
  // so that it is indistinguishable from a known one. A null `member_id` means
  // nothing was mailed.
  await database.schema
    .createTable("sign_in_codes")
    .addColumn("id", "text", (column) => {
      return column.primaryKey().notNull();
    })
    .addColumn("email", "text", (column) => {
      return column.notNull();
    })
    .addColumn("member_id", "text", (column) => {
      return column.references("members.id").onDelete("cascade");
    })
    .addColumn("code_hash", "text", (column) => {
      return column.notNull();
    })
    .addColumn("attempts", "integer", (column) => {
      return column.notNull().defaultTo(0);
    })
    .addColumn("max_attempts", "integer", (column) => {
      return column.notNull().defaultTo(3);
    })
    .addColumn("expires_at", "text", (column) => {
      return column.notNull();
    })
    .addColumn("consumed_at", "text")
    .addColumn("invalidated_at", "text")
    .addColumn("created_at", "text", (column) => {
      return column.notNull();
    })
    .execute();

  // Serves the redemption lookup and the rate-limit clock alike.
  await database.schema
    .createIndex("sign_in_codes_email_created")
    .on("sign_in_codes")
    .columns(["email", "created_at desc"])
    .execute();

  await database.schema
    .createTable("sessions")
    .addColumn("id", "text", (column) => {
      return column.primaryKey().notNull();
    })
    .addColumn("member_id", "text", (column) => {
      return column.notNull().references("members.id").onDelete("cascade");
    })
    .addColumn("token_hash", "text", (column) => {
      return column.notNull();
    })
    .addColumn("device_label", "text", (column) => {
      return column.notNull();
    })
    .addColumn("user_agent", "text")
    .addColumn("created_at", "text", (column) => {
      return column.notNull();
    })
    .addColumn("last_used_at", "text", (column) => {
      return column.notNull();
    })
    .addColumn("expires_at", "text", (column) => {
      return column.notNull();
    })
    .execute();

  // The hot path: hit on every authenticated request, thumbnails included.
  await database.schema
    .createIndex("sessions_token_hash")
    .on("sessions")
    .column("token_hash")
    .unique()
    .execute();

  // The device list on My account.
  await database.schema
    .createIndex("sessions_member_last_used")
    .on("sessions")
    .columns(["member_id", "last_used_at desc"])
    .execute();

  // The idle sweep.
  await database.schema
    .createIndex("sessions_expires")
    .on("sessions")
    .column("expires_at")
    .execute();

  // `invited_by_member_id` is RESTRICT because the attribution appears in an
  // email that survives forever. There is no token column: the invitation
  // carries no credential.
  await database.schema
    .createTable("invitations")
    .addColumn("id", "text", (column) => {
      return column.primaryKey().notNull();
    })
    .addColumn("member_id", "text", (column) => {
      return column.notNull().references("members.id").onDelete("cascade");
    })
    .addColumn("invited_by_member_id", "text", (column) => {
      return column.notNull().references("members.id").onDelete("restrict");
    })
    .addColumn("created_at", "text", (column) => {
      return column.notNull();
    })
    .addColumn("expires_at", "text", (column) => {
      return column.notNull();
    })
    .addColumn("send_count", "integer", (column) => {
      return column.notNull().defaultTo(1);
    })
    .addColumn("last_sent_at", "text", (column) => {
      return column.notNull();
    })
    .addColumn("revoked_at", "text")
    .addColumn("accepted_at", "text")
    .execute();

  // `name_normalized` is trimmed, lowercased, whitespace-collapsed and NFC,
  // the same normalisation `tags` uses. Two groups called "Cousins" would make
  // the visibility picker unusable, and a chip cannot tell them apart.
  await database.schema
    .createTable("groups")
    .addColumn("id", "text", (column) => {
      return column.primaryKey().notNull();
    })
    .addColumn("name", "text", (column) => {
      return column.notNull();
    })
    .addColumn("name_normalized", "text", (column) => {
      return column.notNull().unique();
    })
    .addColumn("created_at", "text", (column) => {
      return column.notNull();
    })
    .execute();

  await database.schema
    .createTable("group_members")
    .addColumn("id", "text", (column) => {
      return column.primaryKey().notNull();
    })
    .addColumn("group_id", "text", (column) => {
      return column.notNull().references("groups.id").onDelete("cascade");
    })
    .addColumn("member_id", "text", (column) => {
      return column.notNull().references("members.id").onDelete("cascade");
    })
    .addColumn("created_at", "text", (column) => {
      return column.notNull();
    })
    .addUniqueConstraint("group_members_group_member_unique", [
      "group_id",
      "member_id",
    ])
    .execute();

  // Visibility expansion reads this on every timeline query and every count.
  // The unique constraint above cannot serve it: `member_id` is not its
  // leading column.
  await database.schema
    .createIndex("group_members_member_group")
    .on("group_members")
    .columns(["member_id", "group_id"])
    .execute();
};

/** Drops the six tables, children first so the foreign keys stay satisfied. */
export const down = async (database: Kysely<unknown>): Promise<void> => {
  await database.schema.dropTable("group_members").execute();
  await database.schema.dropTable("groups").execute();
  await database.schema.dropTable("invitations").execute();
  await database.schema.dropTable("sessions").execute();
  await database.schema.dropTable("sign_in_codes").execute();
  await database.schema.dropTable("members").execute();
};
