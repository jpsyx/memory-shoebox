import { ApiError } from "../../http/ApiError.ts";

import { type UploadSessionRow } from "../uploadSessionAccessHelpers.ts";

import { getCompletedTransferFromRequest } from "../verifyUploadedObjects/getCompletedTransferFromRequest.ts";

import type { CompleteUploadFileOptions } from "./completeUploadFile.types.ts";

import {
  assertFileAcceptsOutcome,
  failInTransaction,
  getReportedProblemCode,
  abortMultipartUpload,
  completeAsDone,
} from "./uploadCompletionHelpers.ts";

/**
 * Ends one file's transfer, either way, and runs the latch.
 *
 * **No Backblaze call happens inside a transaction** (design decision 2):
 * `verifyUploadedObjects` makes every one of them first, and a multipart
 * abort comes after the commit. A `done` for a row that is already `done`
 * with the same hash is a repeat and changes nothing; any other `done` is
 * verified, ingested and latched, and a `failed` is recorded and latched.
 *
 * @param options.database The outer handle; each write opens its own
 *   transaction.
 * @param options.b2 The Backblaze client.
 * @param options.session The session, resolved for its uploader.
 * @param options.file The file, resolved in that session.
 * @param options.body The parsed request body.
 * @param options.now The request's instant.
 * @param options.logger Where a failed multipart abort is reported.
 */
export async function completeUploadFile(
  options: Readonly<CompleteUploadFileOptions>,
): Promise<{ didSettle: boolean }> {
  const { body, ...context } = options;
  ((session: Readonly<UploadSessionRow>): void => {
    if (session.committed_at === null || session.state === "cancelled") {
      throw ApiError.conflict({ code: "upload_session_conflict" });
    }
  })(context.session);
  const isRepeat =
    context.file.state === "done" &&
    body.outcome === "done" &&
    body.contentHash === context.file.content_hash;
  if (isRepeat) {
    return { didSettle: false };
  }
  assertFileAcceptsOutcome({ file: context.file, outcome: body.outcome });
  if (body.outcome === "failed") {
    const failed = await failInTransaction({
      context,
      problemCode: getReportedProblemCode(body),
      problemDetail: body.problemDetail ?? undefined,
    });
    await abortMultipartUpload({ context, upload: failed.multipartUpload });
    return { didSettle: failed.didSettle };
  }
  return completeAsDone({
    context,
    transfer: getCompletedTransferFromRequest({ body, file: context.file }),
  });
}
