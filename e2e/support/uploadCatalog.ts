import { createDatabase } from "../../apps/server/src/db/client.ts";
import { E2E_DATABASE_PATH, E2E_FAKE_S3_URL } from "./e2eEnvironment.ts";
import type { FakeS3Request } from "./fakeS3Server/fakeS3Server.ts";

/**
 * What a batch left behind, read where it was left: the catalog and the
 * stand-in's request log.
 *
 * **A second handle on the catalog**, for the reason `database.ts` gives:
 * none of this is something a route answers in one call. The detail route
 * describes a batch to its uploader; these reads check what the product
 * wrote, which is the claim the spec is making. Every read but one is a
 * read: `activateMember` is the single write, and says why.
 */

/** One stored object of an item, as the spec checks it. */
export type RenditionRecord = {
  purpose: string;
  width: number;
  height: number;
};

/** The item a manifest row became. */
export type UploadedItemRecord = {
  itemId: string;
  capturedOn: string;
  captureSource: string;
  captureOffsetMinutes: number | null;
  width: number;
  height: number;
  renditions: RenditionRecord[];
  tagNames: string[];
};

/** One manifest row of a batch, with the item it became, if it became one. */
export type UploadedFileRecord = {
  fileId: string;
  originalFilename: string;
  state: string;
  problemCode: string | null;
  attemptCount: number;
  storageKey: string | null;
  item: UploadedItemRecord | null;
};

/** Runs `work` against the run's catalog, then closes the handle. */
async function _withCatalog<T>(
  work: (database: ReturnType<typeof createDatabase>) => Promise<T>,
): Promise<T> {
  const database = createDatabase(E2E_DATABASE_PATH);
  try {
    return await work(database);
  } finally {
    await database.destroy();
  }
}

/**
 * Accepts a seeded member's invitation, which the first sign-in would do.
 *
 * **The one write here, and the reason it is not a sign-in.** Recipient
 * resolution reads `status = 'active'` (`notifications.md` § Recipient
 * resolution), and a seeded member stays `invited` until they first sign in.
 * Signing them in would spend a code from the run's per-IP budget to flip one
 * column that no route can flip until step 8a.
 *
 * @param memberId The seeded member.
 */
export async function activateMember(memberId: string): Promise<void> {
  await _withCatalog(async (database) => {
    await database
      .updateTable("members")
      .set({ status: "active", joined_at: new Date().toISOString() })
      .where("id", "=", memberId)
      .where("status", "=", "invited")
      .execute();
  });
}

/** Every rendition and every tag name of these items, keyed by item. */
async function _readItemExtras(options: {
  database: ReturnType<typeof createDatabase>;
  itemIds: readonly string[];
}): Promise<{
  renditionsByItem: Map<string, RenditionRecord[]>;
  tagNamesByItem: Map<string, string[]>;
}> {
  const { database, itemIds } = options;
  const renditionsByItem = new Map<string, RenditionRecord[]>();
  const tagNamesByItem = new Map<string, string[]>();
  if (itemIds.length === 0) {
    return { renditionsByItem, tagNamesByItem };
  }
  const renditions = await database
    .selectFrom("item_renditions")
    .select(["item_id", "purpose", "width", "height"])
    .where("item_id", "in", itemIds)
    .execute();
  const tags = await database
    .selectFrom("item_tags")
    .innerJoin("tags", "tags.id", "item_tags.tag_id")
    .select(["item_tags.item_id", "tags.name"])
    .where("item_tags.item_id", "in", itemIds)
    .execute();
  renditions.forEach((row) => {
    const list = renditionsByItem.get(row.item_id) ?? [];
    list.push({ purpose: row.purpose, width: row.width, height: row.height });
    renditionsByItem.set(row.item_id, list);
  });
  tags.forEach((row) => {
    tagNamesByItem.set(row.item_id, [
      ...(tagNamesByItem.get(row.item_id) ?? []),
      row.name,
    ]);
  });
  return { renditionsByItem, tagNamesByItem };
}

/** The columns `readUploadedFiles` selects, as Kysely returns them. */
type UploadedFileRow = {
  fileId: string;
  originalFilename: string;
  state: string;
  problemCode: string | null;
  attemptCount: number;
  storageKey: string | null;
  itemId: string | null;
  capturedOn: string | null;
  captureSource: string | null;
  captureOffsetMinutes: number | null;
  width: number | null;
  height: number | null;
};

/** One row and its item's extras, as the record a spec reads. */
function _makeFileRecordFromRow(options: {
  row: Readonly<UploadedFileRow>;
  renditionsByItem: ReadonlyMap<string, RenditionRecord[]>;
  tagNamesByItem: ReadonlyMap<string, string[]>;
}): UploadedFileRecord {
  const { row } = options;
  const { itemId, capturedOn, captureSource, width, height } = row;
  const isIngested =
    itemId !== null &&
    capturedOn !== null &&
    captureSource !== null &&
    width !== null &&
    height !== null;
  return {
    fileId: row.fileId,
    originalFilename: row.originalFilename,
    state: row.state,
    problemCode: row.problemCode,
    attemptCount: row.attemptCount,
    storageKey: row.storageKey,
    item: isIngested
      ? {
          itemId,
          capturedOn,
          captureSource,
          captureOffsetMinutes: row.captureOffsetMinutes,
          width,
          height,
          renditions: options.renditionsByItem.get(itemId) ?? [],
          tagNames: options.tagNamesByItem.get(itemId) ?? [],
        }
      : null,
  };
}

/**
 * Every manifest row of one batch, in manifest order, with its item.
 *
 * @param sessionId The batch.
 * @returns One record per `upload_files` row.
 */
export async function readUploadedFiles(
  sessionId: string,
): Promise<UploadedFileRecord[]> {
  return _withCatalog(async (database) => {
    const rows = await database
      .selectFrom("upload_files")
      .leftJoin("items", "items.id", "upload_files.item_id")
      .select([
        "upload_files.id as fileId",
        "upload_files.original_filename as originalFilename",
        "upload_files.state as state",
        "upload_files.problem_code as problemCode",
        "upload_files.attempt_count as attemptCount",
        "upload_files.storage_key as storageKey",
        "items.id as itemId",
        "items.captured_on as capturedOn",
        "items.capture_source as captureSource",
        "items.captured_at_offset_minutes as captureOffsetMinutes",
        "items.width as width",
        "items.height as height",
      ])
      .where("upload_files.upload_session_id", "=", sessionId)
      .orderBy("upload_files.position")
      .execute();
    const itemIds = rows.flatMap((row) => {
      return row.itemId === null ? [] : [row.itemId];
    });
    const extras = await _readItemExtras({ database, itemIds });
    return rows.map((row) => {
      return _makeFileRecordFromRow({ row, ...extras });
    });
  });
}

/**
 * The session row's own record of how it ended.
 *
 * @param sessionId The batch.
 * @returns Its state and the two settle columns.
 */
export async function readUploadSession(sessionId: string): Promise<{
  state: string;
  settledAt: string | null;
  notifiedMemberCount: number | null;
}> {
  return _withCatalog(async (database) => {
    return database
      .selectFrom("upload_sessions")
      .select([
        "state",
        "settled_at as settledAt",
        "notified_member_count as notifiedMemberCount",
      ])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
  });
}

/**
 * Who was written an `upload_session` message about this batch, one entry per
 * row, sorted, duplicates kept so a spec can see them.
 *
 * Found by the idempotency recipe `upload.md` binds,
 * `upload:<session_id>:<member_id>`, rather than by `trigger_id`, because the
 * recipe is the contract and the trigger column is an implementation detail.
 *
 * @param sessionId The batch.
 * @returns The addresses, one per row.
 */
export async function readUploadSessionEmailAddresses(
  sessionId: string,
): Promise<string[]> {
  return _withCatalog(async (database) => {
    const rows = await database
      .selectFrom("outbound_emails")
      .select("to_address")
      .where("kind", "=", "upload_session")
      .where("idempotency_key", "like", `upload:${sessionId}:%`)
      .orderBy("to_address")
      .execute();
    return rows.map((row) => {
      return row.to_address;
    });
  });
}

/**
 * Who should be told about a batch whose rule is `everyone`, sorted.
 *
 * Under that rule every candidate can see every item, so the recipient set is
 * the candidate set, which is `notifications.md` § Recipient resolution step
 * 2 written out: active, notifications on, and not the uploader.
 *
 * @param uploaderEmail The uploader, who is never told.
 * @returns The addresses.
 */
export async function readEligibleRecipientAddresses(
  uploaderEmail: string,
): Promise<string[]> {
  return _withCatalog(async (database) => {
    const rows = await database
      .selectFrom("members")
      .select("email")
      .where("status", "=", "active")
      .where("notify_on_upload", "=", 1)
      .where("email", "<>", uploaderEmail)
      .orderBy("email")
      .execute();
    return rows.map((row) => {
      return row.email;
    });
  });
}

/** Every request the stand-in has answered this run, in order. */
export async function readFakeS3Requests(): Promise<FakeS3Request[]> {
  const response = await fetch(`${E2E_FAKE_S3_URL}/__fake-s3/requests`);
  const body = (await response.json()) as { requests: FakeS3Request[] };
  return body.requests;
}

/**
 * The S3 requests made on one file's original, in order, preflights left
 * out, each with the status the stand-in answered. Keys follow the step
 * design's decision 3: `uploads/<sessionId>/<fileId>/original.<ext>`.
 *
 * @param options.requests The stand-in's log.
 * @param options.sessionId The batch.
 * @param options.fileId The manifest row.
 * @returns Those log entries.
 */
export function getOriginalRequestsFromRequests(options: {
  requests: readonly FakeS3Request[];
  sessionId: string;
  fileId: string;
}): FakeS3Request[] {
  const prefix = `uploads/${options.sessionId}/${options.fileId}/original.`;
  return options.requests.filter((request) => {
    return request.key.startsWith(prefix) && request.operation !== "Preflight";
  });
}
