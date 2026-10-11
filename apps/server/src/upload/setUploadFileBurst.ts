import type { DatabaseExecutor } from "../db/types/db.types.ts";
import { ApiError } from "../http/ApiError.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import { setItemBurst } from "../items/setItemBurst.ts";
import { readUploadBurstGroups } from "./readUploadBurstGroups.ts";
import {
  getReadableUploadSessionFromSessionIdOr404,
  getUploadFileFromFileIdOr404,
} from "./uploadSessionAccessHelpers.ts";

type SetUploadFileBurstOptions = {
  database: DatabaseExecutor;
  viewer: Viewer;
  sessionId: string;
  fileId: string;
  excluded: boolean;
};

/** Saves a grouping choice in the caller's transaction, never transfer state. */
export async function setUploadFileBurst(
  options: Readonly<SetUploadFileBurstOptions>,
): Promise<void> {
  const { database, viewer, sessionId, fileId, excluded } = options;
  const session = await getReadableUploadSessionFromSessionIdOr404({
    database,
    viewer,
    sessionId,
  });
  const file = await getUploadFileFromFileIdOr404({
    database,
    sessionId,
    fileId,
  });
  if (session.settled_at !== null && file.item_id !== null) {
    await setItemBurst({
      database,
      viewer,
      itemId: file.item_id,
      action: excluded ? "remove" : "restore",
    });
  } else {
    const groups = await readUploadBurstGroups({ database, sessionId });
    if (!groups.has(fileId)) {
      throw ApiError.conflict({ code: "upload_burst_unavailable" });
    }
  }
  await database
    .updateTable("upload_files")
    .set({ burst_excluded: excluded ? 1 : 0 })
    .where("id", "=", fileId)
    .execute();
}
