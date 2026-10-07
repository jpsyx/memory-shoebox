import { sql, type Kysely } from "kysely";

async function _addVideoReactions(database: Kysely<unknown>): Promise<void> {
  await database.schema
    .createTable("video_reactions")
    .addColumn("id", "text", (column) => {
      return column.primaryKey().notNull();
    })
    .addColumn("item_id", "text", (column) => {
      return column.notNull().references("items.id").onDelete("cascade");
    })
    .addColumn("member_id", "text", (column) => {
      return column.notNull().references("members.id").onDelete("cascade");
    })
    .addColumn("emoji", "text", (column) => {
      return column
        .notNull()
        .check(
          sql`emoji IN ('😂','😍','😮','🙌','👍','👏','❤️','🥹','🎉','💯')`,
        );
    })
    .addColumn("at_seconds", "real", (column) => {
      return column.notNull().check(sql`at_seconds >= 0`);
    })
    .addColumn("created_at", "text", (column) => {
      return column.notNull();
    })
    .execute();
  await database.schema
    .createIndex("video_reactions_item_created_at")
    .on("video_reactions")
    .columns(["item_id", "created_at desc", "id desc"])
    .execute();
  await database.schema
    .createIndex("video_reactions_member")
    .on("video_reactions")
    .column("member_id")
    .execute();
}

/** Adds timed gestures and one-level replies without rewriting existing rows. */
export async function up(database: Kysely<unknown>): Promise<void> {
  await database.schema
    .alterTable("comments")
    .addColumn("parent_comment_id", "text", (column) => {
      return column.references("comments.id").onDelete("set null");
    })
    .execute();
  await database.schema
    .createIndex("comments_parent_comment")
    .on("comments")
    .column("parent_comment_id")
    .execute();
  await _addVideoReactions(database);
}

/** Removes the new relations, retaining every comment's text and moment. */
export async function down(database: Kysely<unknown>): Promise<void> {
  await database.schema.dropTable("video_reactions").execute();
  await database.schema.dropIndex("comments_parent_comment").execute();
  await database.schema
    .alterTable("comments")
    .dropColumn("parent_comment_id")
    .execute();
}
