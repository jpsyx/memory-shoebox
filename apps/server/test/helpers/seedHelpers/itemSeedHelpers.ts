import type { Kysely } from "kysely";
import { createId } from "../../../src/db/createId.ts";
import type { Database } from "../../../src/db/types/db.types.ts";
import { EVERYONE_VISIBILITY_RULE_ID } from "../../../src/visibility/everyoneRule.ts";
import { NOW } from "./seedTime.ts";

/**
 * Inserts one photograph and returns its id.
 *
 * `seq` carries a unique index, so a test wanting a second item passes its own.
 */
export async function insertItem(
  database: Kysely<Database>,
  options: { uploadedBy: string } & Partial<Database["items"]>,
): Promise<string> {
  const { uploadedBy, ...overrides } = options;
  const id = overrides.id ?? createId();
  await database
    .insertInto("items")
    .values({
      id,
      kind: "photo",
      captured_at: NOW,
      captured_at_offset_minutes: 120,
      captured_on: "2026-09-27",
      capture_source: "exif",
      original_captured_at: NOW,
      seq: 0,
      uploaded_by: uploadedBy,
      upload_session_id: null,
      visibility_rule_id: EVERYONE_VISIBILITY_RULE_ID,
      burst_id: null,
      burst_index: null,
      width: 4032,
      height: 3024,
      duration_ms: null,
      byte_size: 2_400_000,
      content_type: "image/jpeg",
      checksum: null,
      original_filename: "IMG_0001.jpg",
      alt_text: null,
      created_at: NOW,
      ...overrides,
    })
    .execute();
  return id;
}

/**
 * Inserts one upload session and returns its id.
 *
 * Defaults to a committed batch still transferring: `state = 'uploading'` with
 * `committed_at` set, because no byte may move before that column is written
 * and that is the only session shape the abandon sweep's file half looks at.
 * A draft is the interesting departure, so a caller wanting one passes both
 * `state: "draft"` and `committed_at: null`.
 */
export async function insertUploadSession(
  database: Kysely<Database>,
  options: { uploadedBy: string } & Partial<Database["upload_sessions"]>,
): Promise<string> {
  const { uploadedBy, ...overrides } = options;
  const id = overrides.id ?? createId();
  await database
    .insertInto("upload_sessions")
    .values({
      id,
      uploaded_by: uploadedBy,
      state: "uploading",
      visibility_rule_id: EVERYONE_VISIBILITY_RULE_ID,
      file_count: 1,
      total_bytes: 1024,
      client_timezone: "Europe/Madrid",
      created_at: NOW,
      committed_at: NOW,
      last_activity_at: NOW,
      settled_at: null,
      notified_at: null,
      notified_member_count: null,
      ...overrides,
    })
    .execute();
  return id;
}

/** Inserts one upload file and returns its id. */
export async function insertUploadFile(
  database: Kysely<Database>,
  options: { uploadSessionId: string } & Partial<Database["upload_files"]>,
): Promise<string> {
  const { uploadSessionId, ...overrides } = options;
  const id = overrides.id ?? createId();
  await database
    .insertInto("upload_files")
    .values({
      id,
      upload_session_id: uploadSessionId,
      item_id: null,
      position: 0,
      original_filename: "IMG_0001.jpg",
      declared_content_type: "image/jpeg",
      declared_bytes: 1024,
      content_hash: null,
      kind: "photo",
      storage_key: null,
      state: "waiting",
      attempt_count: 0,
      presigned_until: null,
      multipart_upload_id: null,
      problem_code: null,
      problem_detail: null,
      captured_at: null,
      capture_date: null,
      capture_offset_minutes: null,
      capture_source: null,
      original_captured_at: null,
      width: null,
      height: null,
      duration_ms: null,
      created_at: NOW,
      updated_at: NOW,
      ...overrides,
    })
    .execute();
  return id;
}
