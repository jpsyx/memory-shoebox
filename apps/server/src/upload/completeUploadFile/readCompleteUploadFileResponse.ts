import {
  uploadSessionStateSchema,
  type CompleteUploadFileResponse,
} from "@memory-shoebox/shared";

import { makeUploadFileDtosFromRows } from "../readUploadFilePage/makeUploadFileDtosFromRows.ts";

import { readUploadProgress } from "../readUploadSessionDetailHelpers.ts";

import { getUploadFileFromFileIdOr404 } from "../uploadSessionAccessHelpers.ts";

import type { ReadCompleteUploadFileResponseOptions } from "./completeUploadFile.types.ts";

/**
 * The `complete` response: the file, the progress and the session's state,
 * so 264 completes are not 264 completes plus 264 reads (Ruling 10).
 *
 * The file is `readUploadFileDtos` over the row as it now stands, the same
 * mapping the detail's file page uses. It signs URLs, which is why this runs
 * once every write has committed.
 *
 * @param options.database A handle; read after the write has committed.
 * @param options.b2 For the file's signed media URLs.
 * @param options.sessionId The session.
 * @param options.fileId The file.
 * @param options.didSettle Whether this caller's latch fired.
 * @param options.now The request's clock, which `expiresAt` counts from.
 */
export async function readCompleteUploadFileResponse(
  options: Readonly<ReadCompleteUploadFileResponseOptions>,
): Promise<CompleteUploadFileResponse> {
  const { database, sessionId } = options;
  const fileRow = await getUploadFileFromFileIdOr404(options);
  const [[file], progress, session] = await Promise.all([
    makeUploadFileDtosFromRows({ ...options, fileRows: [fileRow] }),
    readUploadProgress({ database, sessionId }),
    database
      .selectFrom("upload_sessions")
      .select("upload_sessions.state as state")
      .where("upload_sessions.id", "=", sessionId)
      .executeTakeFirstOrThrow(),
  ]);
  if (file === undefined) {
    throw new Error(`no file DTO was made for upload file ${options.fileId}`);
  }
  return {
    file,
    progress,
    sessionState: uploadSessionStateSchema.parse(session.state),
    didSettle: options.didSettle,
  };
}
