import { createDatabase } from "../../../apps/server/src/db/client.ts";
import { E2E_DATABASE_PATH } from "../e2eEnvironment.constants.ts";

/** Identity boundaries captured before a single sequential engine case. */
export type UploadCaseOwnership = {
  uploaderId: string;
  sessionIds: Set<string>;
  itemIds: Set<string>;
};

/** Opens only the exact catalog owned by the ordinary local E2E runner. */
export function openUploadCaseDatabase(
  path: string,
): ReturnType<typeof createDatabase> {
  if (path !== E2E_DATABASE_PATH) {
    throw new Error("Upload cleanup requires the exact owned E2E catalog");
  }
  return createDatabase(path);
}

/** Records existing identities so later teardown cannot erase baseline rows. */
export async function getUploadCaseOwnershipFromDatabase(
  database: ReturnType<typeof createDatabase>,
  uploaderEmail: string,
): Promise<UploadCaseOwnership> {
  const uploader = await database
    .selectFrom("members")
    .select("id")
    .where("email", "=", uploaderEmail)
    .executeTakeFirstOrThrow();
  const sessions = await database
    .selectFrom("upload_sessions")
    .select("id")
    .where("uploaded_by", "=", uploader.id)
    .execute();
  const items = await database.selectFrom("items").select("id").execute();
  return {
    uploaderId: uploader.id,
    sessionIds: new Set(
      sessions.map((session) => {
        return session.id;
      }),
    ),
    itemIds: new Set(
      items.map((item) => {
        return item.id;
      }),
    ),
  };
}

/** Removes only newly owned items after the case's clients and batch retire. */
export async function retireUploadCase(
  database: ReturnType<typeof createDatabase>,
  ownership: UploadCaseOwnership,
): Promise<void> {
  const sessions = await database
    .selectFrom("upload_sessions")
    .select("id")
    .where("uploaded_by", "=", ownership.uploaderId)
    .execute();
  const ownedSessionIds = sessions
    .map((session) => {
      return session.id;
    })
    .filter((id) => {
      return !ownership.sessionIds.has(id);
    });
  if (ownedSessionIds.length === 0) {
    return;
  }
  const items = await database
    .selectFrom("items")
    .select("id")
    .where("uploaded_by", "=", ownership.uploaderId)
    .where("upload_session_id", "in", ownedSessionIds)
    .execute();
  const ownedItemIds = items
    .map((item) => {
      return item.id;
    })
    .filter((id) => {
      return !ownership.itemIds.has(id);
    });
  if (ownedItemIds.length > 0) {
    await database
      .deleteFrom("items")
      .where("id", "in", ownedItemIds)
      .where("uploaded_by", "=", ownership.uploaderId)
      .where("upload_session_id", "in", ownedSessionIds)
      .execute();
  }
}
