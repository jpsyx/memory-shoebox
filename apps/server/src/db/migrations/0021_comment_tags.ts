import { sql, type Kysely } from "kysely";

async function _extendOutboundEmailKinds(
  database: Kysely<unknown>,
): Promise<void> {
  const definition = await sql<{ sql: string }>`select sql from sqlite_master
    where type = 'table' and name = 'outbound_emails'`.execute(database);
  const originalSql = definition.rows[0]!.sql;
  // Reuse the complete historical shape, including sender snapshots and checks.
  const expandedSql = originalSql.replace(
    /\bkind IN\s*\(([^)]*)\)/i,
    "kind IN ($1, 'comment_tag')",
  );
  if (expandedSql === originalSql) {
    throw new Error("Cannot find outbound email kind constraint");
  }
  const indexes = await sql<{ sql: string }>`select sql from sqlite_master
    where type = 'index' and tbl_name = 'outbound_emails' and sql is not null`.execute(
    database,
  );
  await sql
    .raw(
      expandedSql.replace(
        /CREATE TABLE ["`[]?outbound_emails["`\]]?/i,
        "CREATE TABLE new_outbound_emails",
      ),
    )
    .execute(database);
  await sql`insert into new_outbound_emails select * from outbound_emails`.execute(
    database,
  );
  // The migration runner disables FK actions and verifies integrity on commit.
  await sql`drop table outbound_emails`.execute(database);
  await sql`alter table new_outbound_emails rename to outbound_emails`.execute(
    database,
  );
  await indexes.rows.reduce(async (previous, index) => {
    await previous;
    await sql.raw(index.sql).execute(database);
  }, Promise.resolve());
}

/** Adds explicit member occurrences and a permanent notification ledger. */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`create table comment_tags (
    id text primary key not null,
    comment_id text not null references comments(id) on delete cascade,
    member_id text not null references members(id) on delete restrict,
    start_offset integer not null check(typeof(start_offset) = 'integer' and start_offset >= 0),
    end_offset integer not null check(typeof(end_offset) = 'integer' and end_offset > start_offset),
    label_snapshot text not null,
    unique (comment_id, start_offset)
  )`.execute(database);
  await sql`create index comment_tags_comment on comment_tags(comment_id)`.execute(
    database,
  );
  await sql`create index comment_tags_member on comment_tags(member_id)`.execute(
    database,
  );
  await sql`create table comment_tag_notifications (
    comment_id text not null references comments(id) on delete cascade,
    member_id text not null references members(id) on delete restrict,
    scheduled_at text not null,
    primary key(comment_id, member_id)
  )`.execute(database);
  await sql`create index comment_tag_notifications_member on comment_tag_notifications(member_id)`.execute(
    database,
  );
  await sql`alter table members add column notify_on_comment_tag integer not null default 1
    check(notify_on_comment_tag in (0,1))`.execute(database);
  await _extendOutboundEmailKinds(database);
}
