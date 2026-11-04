import { sql, type Kysely } from "kysely";

async function _extendOutboundEmailKinds(
  database: Kysely<unknown>,
): Promise<void> {
  const definition = await sql<{ sql: string }>`select sql from sqlite_master
    where type = 'table' and name = 'outbound_emails'`.execute(database);
  const originalSql = definition.rows[0]!.sql;
  // Reuse the complete historical shape, including sender snapshots and checks.
  const expandedSql = originalSql
    .replace(/\bkind IN\s*\(([^)]*)\)/i, "kind IN ($1, 'daily_digest')")
    .replace(
      /\btrigger_kind IN\s*\(([^)]*)\)/i,
      "trigger_kind IN ($1, 'daily_digest')",
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

async function _addDigestTables(database: Kysely<unknown>): Promise<void> {
  await sql`create table notification_digest_batches (
    id text primary key not null,
    member_id text not null references members(id) on delete restrict,
    send_date text not null, timezone text not null, cutoff_local_date text not null,
    prepared_at text not null,
    outbound_email_id text references outbound_emails(id) on delete set null,
    eligibility_snapshot_json text, delivery_snapshot_json text, provider_attempted_at text,
    unique(member_id, send_date)
  )`.execute(database);
  await sql`create table notification_digest_events (
    id text primary key not null,
    member_id text not null references members(id) on delete restrict,
    category text not null check(category in ('upload','comment','comment_tag')),
    source_kind text not null check(source_kind in ('upload_session','comment')),
    source_id text not null, occurred_at text not null,
    deduplication_key text not null unique,
    state text not null check(state in ('pending','included','cancelled')),
    batch_id text references notification_digest_batches(id) on delete restrict,
    check((state = 'included') = (batch_id is not null)),
    check((category = 'upload') = (source_kind = 'upload_session'))
  )`.execute(database);
  await sql`create index digest_events_pending on notification_digest_events(member_id,state,occurred_at)`.execute(
    database,
  );
  await sql`create index digest_events_source on notification_digest_events(source_kind,source_id,category)`.execute(
    database,
  );
  await sql`create index digest_events_batch on notification_digest_events(batch_id)`.execute(
    database,
  );
  await sql`create index digest_batches_email on notification_digest_batches(outbound_email_id)`.execute(
    database,
  );
}

async function _convertUnattemptedMail(
  database: Kysely<unknown>,
): Promise<void> {
  await sql`insert into notification_digest_events
    (id,member_id,category,source_kind,source_id,occurred_at,deduplication_key,state)
    select 'migrated:' || id, to_member_id,
      case kind when 'upload_session' then 'upload' else 'comment' end,
      trigger_kind, trigger_id, created_at, idempotency_key, 'pending'
    from outbound_emails where state='queued' and kind in ('upload_session','comment')
      and attempts=0 and sender_snapshot_json is null and provider_message_id is null
      and provider_request_id is null
      and (last_error_code is null or last_error_code in ('provider_unconfigured','from_address_unset'))
      and to_member_id is not null and length(trigger_id)>0
      and ((kind='upload_session' and trigger_kind='upload_session') or (kind='comment' and trigger_kind='comment'))
  `.execute(database);
  await sql`update outbound_emails set state='cancelled'
    where state='queued' and kind in ('upload_session','comment')
      and attempts=0 and sender_snapshot_json is null and provider_message_id is null
      and provider_request_id is null
      and (last_error_code is null or last_error_code in ('provider_unconfigured','from_address_unset'))
  `.execute(database);
}

/** Adds digest preferences and moves safely unattempted activity into pending events. */
export async function up(database: Kysely<unknown>): Promise<void> {
  for (const [column, defaultValue] of [
    ["notify_upload_frequency", "daily"],
    ["notify_comment_frequency", "daily"],
    ["notify_comment_tag_frequency", "immediate"],
  ]) {
    await sql
      .raw(
        `alter table members add column ${column} text not null default '${defaultValue}' check(${column} in ('off','immediate','daily'))`,
      )
      .execute(database);
  }
  await _extendOutboundEmailKinds(database);
  await _addDigestTables(database);
  await _convertUnattemptedMail(database);
}
