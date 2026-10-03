import { createDatabase } from "../../../../src/db/client.ts";

import { migrateToLatest } from "../../../../src/db/migrate.ts";

import { createFakeB2Client } from "../../../helpers/createFakeB2Client/createFakeB2Client.ts";

import {
  NOW,
  insertItem,
  insertMember,
  insertUploadFile,
  insertUploadSession,
  shiftMinutes,
} from "../../../helpers/seedHelpers/seedHelpers.ts";

/** A summary in which nothing happened. */
export const NOTHING = {
  abandonedFileCount: 0,
  cancelledDraftCount: 0,
  settledSessionCount: 0,
  abortedMultipartCount: 0,
};

/**
 * Creates an in-memory catalog, member and fake B2 client for sweep tests.
 */
export async function createContext(): Promise<{
  database: ReturnType<typeof createDatabase>;
  memberId: string;
  b2: ReturnType<typeof createFakeB2Client>;
}> {
  const database = createDatabase(":memory:");
  await migrateToLatest(database);
  const memberId = await insertMember(database);
  const b2 = createFakeB2Client();
  return { database, memberId, b2 };
}

/**
 * Every derivative key a browser may have sent ahead of one file's original.
 */
export function getDerivativeKeysFromFile(
  options: Readonly<{
    sessionId: string;
    fileId: string;
  }>,
): string[] {
  return ["display", "thumb", "poster"].map((purpose) => {
    return `uploads/${options.sessionId}/${options.fileId}/${purpose}.jpg`;
  });
}

/** What `pending_object_deletions` holds, in key order. */
export async function getQueuedKeysFromDatabase(
  database: Awaited<ReturnType<typeof createContext>>["database"],
): Promise<string[]> {
  const rows = await database
    .selectFrom("pending_object_deletions")
    .select("storage_key")
    .orderBy("storage_key")
    .execute();
  return rows.map((row) => {
    return row.storage_key;
  });
}

/**
 * A committed batch idle past the grace period, with one photograph that
 * landed and one large video whose multipart upload never finished.
 */
export async function insertAbandonedBatch(
  context: Awaited<ReturnType<typeof createContext>>,
): Promise<{ sessionId: string; videoFileId: string }> {
  const sessionId = await insertUploadSession(context.database, {
    uploadedBy: context.memberId,
    last_activity_at: shiftMinutes({ instant: NOW, minutes: -100 }),
  });
  const itemId = await insertItem(context.database, {
    uploadedBy: context.memberId,
    upload_session_id: sessionId,
  });
  await insertUploadFile(context.database, {
    uploadSessionId: sessionId,
    position: 0,
    state: "done",
    item_id: itemId,
  });
  const videoFileId = await insertUploadFile(context.database, {
    uploadSessionId: sessionId,
    position: 1,
    state: "sending",
    original_filename: "IMG_0002.MOV",
    declared_content_type: "video/quicktime",
    kind: "video",
    storage_key: `uploads/${sessionId}/video/original.mov`,
    multipart_upload_id: "multipart-upload-1",
  });
  return { sessionId, videoFileId };
}
