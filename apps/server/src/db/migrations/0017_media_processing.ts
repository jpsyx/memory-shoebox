import { sql, type Kysely } from "kysely";

/** Runner owns FK suspension, backups, transaction and integrity checks. */
async function _expandRenditionPurposes(
  database: Kysely<unknown>,
): Promise<void> {
  await sql`create table new_item_renditions (
    id text primary key not null,
    item_id text not null references items(id) on delete cascade,
    purpose text not null check (purpose in (
      'original', 'display', 'thumb', 'poster', 'video_webm', 'video_mp4',
      'display_small', 'display_webp', 'display_small_webp'
    )),
    storage_key text not null,
    content_type text not null,
    byte_size integer not null,
    width integer not null,
    height integer not null
  )`.execute(database);
  await sql`insert into new_item_renditions
    (id, item_id, purpose, storage_key, content_type, byte_size, width, height)
    select id, item_id, purpose, storage_key, content_type, byte_size, width, height
    from item_renditions`.execute(database);
  await database.schema.dropTable("item_renditions").execute();
  await database.schema
    .alterTable("new_item_renditions")
    .renameTo("item_renditions")
    .execute();
  await database.schema
    .createIndex("item_renditions_item_purpose")
    .unique()
    .on("item_renditions")
    .columns(["item_id", "purpose"])
    .execute();
  await database.schema
    .createIndex("item_renditions_storage_key")
    .unique()
    .on("item_renditions")
    .column("storage_key")
    .execute();
}

async function _addJobs(database: Kysely<unknown>): Promise<void> {
  // Source is a revision snapshot: replacement must not erase its ownership.
  await sql`create table media_processing_jobs (
    id text primary key not null,
    item_id text not null references items(id) on delete cascade,
    source_rendition_id text not null,
    recipe text not null,
    state text not null check (state in ('pending', 'running', 'complete', 'unavailable')),
    priority integer not null,
    attempts integer not null default 0 check (attempts >= 0),
    next_attempt_at text not null,
    lease_token text,
    lease_expires_at text,
    error_code text,
    created_at text not null,
    updated_at text not null,
    unique (item_id, source_rendition_id, recipe),
    check ((state = 'running' and lease_token is not null and lease_expires_at is not null)
      or (state <> 'running' and lease_token is null and lease_expires_at is null))
  )`.execute(database);
  await sql`create index media_processing_jobs_due on media_processing_jobs
    (state, next_attempt_at, priority desc, created_at, id)`.execute(database);
  await sql`create index media_processing_jobs_lease on media_processing_jobs
    (state, lease_expires_at)`.execute(database);
}

async function _addOutputs(database: Kysely<unknown>): Promise<void> {
  // Key, attempt and multipart identity survive deletion of both parents.
  await sql`create table media_processing_outputs (
    id text primary key not null,
    job_id text references media_processing_jobs(id) on delete set null,
    item_id text references items(id) on delete set null,
    attempt_token text not null,
    storage_key text not null unique,
    purpose text not null check (purpose in (
      'display', 'thumb', 'poster', 'video_webm', 'video_mp4',
      'display_small', 'display_webp', 'display_small_webp'
    )),
    state text not null check (state in ('reserved', 'uploading', 'uploaded', 'published', 'cleanup')),
    multipart_upload_id text,
    created_at text not null,
    updated_at text not null
  )`.execute(database);
  await sql`create index media_processing_outputs_job on media_processing_outputs
    (job_id)`.execute(database);
  await sql`create index media_processing_outputs_item on media_processing_outputs
    (item_id)`.execute(database);
  await sql`create index media_processing_outputs_state on media_processing_outputs
    (state, updated_at, id)`.execute(database);
}

async function _addDiscovery(database: Kysely<unknown>): Promise<void> {
  // Cursor is an ordering position, not a live reference to its last item.
  await sql`create table media_processing_discovery (
    id integer primary key not null check (id = 1),
    cursor_item_id text,
    updated_at text not null
  )`.execute(database);
  await sql`insert into media_processing_discovery (id, cursor_item_id, updated_at)
    values (1, null, '1970-01-01T00:00:00.000Z')`.execute(database);
}

/** Adds durable ownership and purposes without starting any media processing. */
export async function up(database: Kysely<unknown>): Promise<void> {
  await _expandRenditionPurposes(database);
  await _addJobs(database);
  await _addOutputs(database);
  await _addDiscovery(database);
}
