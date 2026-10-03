import {
  UPLOAD_LIMITS,
  type PendingFileRef,
  type UploadUndatedGroup,
} from "@memory-shoebox/shared";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import {
  IN_FLIGHT_FILE_STATES,
  NEVER_LANDING_FILE_STATES,
} from "./uploadStateHelpers.ts";

/**
 * `UploadSessionDetail.undated`: the files that reached rung 4 or rung 6, so
 * the surface can put "these did not say when they were taken" at the top of
 * the days list, or undefined when there are none.
 *
 * `captureSource` names one rung for the group, and a group can hold both. It
 * is the weaker of the two present, `upload_time` over `file_mtime`, because
 * the surface's copy is about the least that is known, and each file's own rung
 * is on its `UploadFileDto`. Refused and cancelled files never land and are
 * left out.
 *
 * @param options.database The Kysely handle, or a transaction.
 * @param options.sessionId The session, already resolved for the viewer.
 */
export async function readUploadUndatedGroup(
  options: Readonly<{
    database: DatabaseExecutor;
    sessionId: string;
  }>,
): Promise<UploadUndatedGroup | undefined> {
  const rows = await options.database
    .selectFrom("upload_files")
    .select([
      "upload_files.id as fileId",
      "upload_files.original_filename as originalFilename",
      "upload_files.capture_date as captureDate",
      "upload_files.capture_source as captureSource",
    ])
    .where("upload_files.upload_session_id", "=", options.sessionId)
    .where("upload_files.capture_source", "in", [
      ...(["file_mtime", "upload_time"] as const),
    ])
    .where("upload_files.state", "not in", [...NEVER_LANDING_FILE_STATES])
    .orderBy("upload_files.position", "asc")
    .execute();

  const files = rows.flatMap((row) => {
    return row.captureDate === null
      ? []
      : [
          {
            fileId: row.fileId,
            originalFilename: row.originalFilename,
            capturedOn: row.captureDate,
          },
        ];
  });
  if (files.length === 0) {
    return undefined;
  }
  const hasUploadTime = rows.some((row) => {
    return row.captureSource === "upload_time";
  });
  return {
    fileCount: files.length,
    captureSource: hasUploadTime ? "upload_time" : "file_mtime",
    files,
  };
}

/**
 * `UploadSessionDetail.pendingFiles`: the first hundred files still waiting
 * or sending, in manifest order, which is what lets resume say "these 64 are
 * still to come" and list them. The rest are on the paged `files` list.
 *
 * @param options.database The Kysely handle, or a transaction.
 * @param options.sessionId The session, already resolved for the viewer.
 */
export async function readPendingFileRefs(
  options: Readonly<{
    database: DatabaseExecutor;
    sessionId: string;
  }>,
): Promise<PendingFileRef[]> {
  return options.database
    .selectFrom("upload_files")
    .select([
      "upload_files.id as fileId",
      "upload_files.original_filename as originalFilename",
      "upload_files.declared_bytes as declaredBytes",
    ])
    .where("upload_files.upload_session_id", "=", options.sessionId)
    .where("upload_files.state", "in", [...IN_FLIGHT_FILE_STATES])
    .orderBy("upload_files.position", "asc")
    .limit(UPLOAD_LIMITS.pendingFilesInDetail)
    .execute();
}
