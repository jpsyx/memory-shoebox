import type { Kysely } from "kysely";
import type { UploadSessionDetail } from "@memory-shoebox/shared";
import { createDatabase } from "../../../src/db/client.ts";
import { migrateToLatest } from "../../../src/db/migrate.ts";
import type { Database } from "../../../src/db/types/db.types.ts";
import type { UploadFilePageRequest } from "../../../src/upload/readUploadFilePage.ts";
import { readUploadSessionDetail } from "../../../src/upload/readUploadSessionDetail.ts";
import {
  createFakeB2Client,
  type FakeB2Client,
} from "../../helpers/createFakeB2Client.ts";
import {
  insertMember,
  insertUploadFile,
  insertUploadSession,
  NOW,
} from "../../helpers/seedHelpers/seedHelpers.ts";

/** One session over a fresh catalog, and the clients the composer takes. */
export type DetailContext = {
  database: Kysely<Database>;
  b2: FakeB2Client;
  memberId: string;
  sessionId: string;
};

/**
 * A migrated in-memory catalog holding one uploader and one session.
 *
 * Defaults to a draft, because the plan is only editable there and most of
 * the detail is about the plan; a test about settling passes its own state.
 *
 * @param session Columns to override on the session.
 */
export async function createDetailContext(
  session: Partial<Database["upload_sessions"]> = {},
): Promise<DetailContext> {
  const database = createDatabase(":memory:");
  await migrateToLatest(database);
  const memberId = await insertMember(database, { display_name: "Papá" });
  const sessionId = await insertUploadSession(database, {
    uploadedBy: memberId,
    state: "draft",
    committed_at: null,
    file_count: 0,
    total_bytes: 0,
    ...session,
  });
  return { database, b2: createFakeB2Client(), memberId, sessionId };
}

/**
 * The detail as `GET /api/upload-sessions/:sessionId` would serve it, at the
 * seeded clock.
 *
 * @param context The test's session.
 * @param page Which page of files; the first of every state when omitted.
 */
export function readDetail(
  context: Readonly<DetailContext>,
  page?: Readonly<UploadFilePageRequest>,
): Promise<UploadSessionDetail> {
  return readUploadSessionDetail({
    database: context.database,
    b2: context.b2,
    sessionId: context.sessionId,
    now: new Date(NOW),
    page,
  });
}

/**
 * One manifest row at a given position, with a capture date, returning its
 * id. Positions are unique per session, so every call names its own.
 *
 * @param context The test's session.
 * @param options.position The row's ordinal.
 * @param options.captureDate The day the ladder put it on, or null.
 * @param options.overrides Any other column.
 */
export function insertManifestFile(
  context: Readonly<DetailContext>,
  options: {
    position: number;
    captureDate?: string | null;
    overrides?: Partial<Database["upload_files"]>;
  },
): Promise<string> {
  const captureDate =
    options.captureDate === undefined ? "2026-09-14" : options.captureDate;
  return insertUploadFile(context.database, {
    uploadSessionId: context.sessionId,
    position: options.position,
    original_filename: `IMG_${String(options.position).padStart(4, "0")}.jpg`,
    capture_date: captureDate,
    captured_at: captureDate === null ? null : `${captureDate}T04:41:32.000Z`,
    capture_source: captureDate === null ? null : "exif",
    ...options.overrides,
  });
}
