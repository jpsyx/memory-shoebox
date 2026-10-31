import { sql, type Kysely } from "kysely";

/** Adds independent durable avatar ownership without rewriting historical rows. */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`create table member_avatar_uploads (
    id text primary key not null,
    member_id text not null references members(id) on delete restrict,
    storage_key text not null unique,
    expected_avatar_id text,
    crop_json text not null,
    content_type text not null check(content_type in ('image/jpeg','image/png','image/webp')),
    declared_byte_size integer not null check(declared_byte_size > 0 and declared_byte_size <= 10485760),
    output_byte_size integer,
    state text not null check(state in ('reserved','uploading','published','retired')),
    expires_at text not null,
    created_at text not null
  )`.execute(database);
  await sql`alter table members add column avatar_id text references member_avatar_uploads(id) on delete restrict`.execute(
    database,
  );
  await sql`create index member_avatar_uploads_state_expires on member_avatar_uploads(state, expires_at)`.execute(
    database,
  );
  await sql`create index member_avatar_uploads_member on member_avatar_uploads(member_id)`.execute(
    database,
  );
  await sql`create index members_avatar on members(avatar_id)`.execute(
    database,
  );
}
