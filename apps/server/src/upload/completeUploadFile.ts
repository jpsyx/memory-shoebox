import type { FastifyBaseLogger } from "fastify";
import {
  uploadSessionStateSchema,
  type CompleteUploadFileRequest,
  type CompleteUploadFileResponse,
  type UploadProblemCode,
} from "@memory-shoebox/shared";
import type { B2Client } from "../b2/client/client.ts";
import { runInImmediateTransaction } from "../db/runInImmediateTransaction.ts";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import { ApiError } from "../http/ApiError.ts";
import {
  abortMultipartUploads,
  getMultipartUploadRefFromFile,
} from "./abortMultipartUploads.ts";
import { ingestUploadFile, type IngestRendition } from "./ingestUploadFile.ts";
import { readUploadFileDtos } from "./readUploadFilePage.ts";
import { readUploadProgress } from "./readUploadSessionDetail.ts";
import { settleUploadSession } from "./settleUploadSession.ts";
import {
  getUploadFileOr404,
  type UploadFileRow,
  type UploadSessionRow,
} from "./uploadSessionAccess.ts";
import {
  getCompletedTransferFromRequest,
  verifyUploadedObjects,
  type CompletedTransfer,
} from "./verifyUploadedObjects.ts";

/** Terminal: the latch counts these, and nothing completes one twice. */
const TERMINAL_FILE_STATES: ReadonlySet<string> = new Set([
  "done",
  "failed",
  "refused",
  "cancelled",
]);

/** What a browser may say went wrong. The rest are the server's verdicts. */
const CLIENT_PROBLEM_CODES: ReadonlySet<UploadProblemCode> = new Set([
  "connection_lost",
  "checksum_mismatch",
  "content_mismatch",
  "storage_rejected",
]);

/** Everything one `complete` call needs, read before anything is written. */
type CompleteContext = {
  database: DatabaseExecutor;
  b2: B2Client;
  session: UploadSessionRow;
  file: UploadFileRow;
  now: string;
  logger: Pick<FastifyBaseLogger, "warn">;
};

/** A draft's files cannot have moved a byte, and a cancelled one never will. */
function _assertSessionAcceptsCompletion(
  session: Readonly<UploadSessionRow>,
): void {
  if (session.committed_at === null || session.state === "cancelled") {
    throw ApiError.conflict("upload_session_conflict");
  }
}

/** A terminal row takes no second ending, and `done` needs a presign first. */
function _assertFileAcceptsOutcome(options: {
  file: UploadFileRow;
  outcome: CompleteUploadFileRequest["outcome"];
}): void {
  const { file } = options;
  const isNeverPresigned =
    options.outcome === "done" && file.state === "waiting";
  if (TERMINAL_FILE_STATES.has(file.state) || isNeverPresigned) {
    throw ApiError.conflict("upload_file_conflict", { state: file.state });
  }
}

/** The code a `failed` call reports, defaulting to a dropped connection. */
function _getReportedProblemCode(
  body: Readonly<CompleteUploadFileRequest>,
): UploadProblemCode {
  const problemCode = body.problemCode ?? "connection_lost";
  if (!CLIENT_PROBLEM_CODES.has(problemCode)) {
    throw ApiError.invalidRequest({
      problemCode: ["That is the server's verdict to give, not the browser's."],
    });
  }
  return problemCode;
}

/** The row goes `failed` and the latch runs, in one short transaction. */
async function _failInTransaction(options: {
  context: CompleteContext;
  problemCode: UploadProblemCode;
  problemDetail: string | null;
}): Promise<{ didSettle: boolean }> {
  const { context } = options;
  return runInImmediateTransaction({
    database: context.database,
    callback: async (transaction) => {
      const current = await getUploadFileOr404({
        database: transaction,
        sessionId: context.session.id,
        fileId: context.file.id,
      });
      // A sweep or a racing call may have ended it since it was read.
      if (current.state !== "waiting" && current.state !== "sending") {
        throw ApiError.conflict("upload_file_conflict", {
          state: current.state,
        });
      }
      await transaction
        .updateTable("upload_files")
        .set({
          state: "failed",
          problem_code: options.problemCode,
          problem_detail: options.problemDetail,
          presigned_until: null,
          updated_at: context.now,
        })
        .where("id", "=", current.id)
        .execute();
      await transaction
        .updateTable("upload_sessions")
        .set({ last_activity_at: context.now })
        .where("id", "=", context.session.id)
        .execute();
      return settleUploadSession({
        transaction,
        sessionId: context.session.id,
        now: context.now,
      });
    },
  });
}

/** After the commit: stop Backblaze billing a multipart upload's parts. */
async function _abortIfMultipart(context: CompleteContext): Promise<void> {
  const upload = getMultipartUploadRefFromFile(context.file);
  if (upload === null) {
    return;
  }
  await abortMultipartUploads({
    database: context.database,
    b2: context.b2,
    uploads: [upload],
    logger: context.logger,
  });
}

/** The verified file's row, its item, and the session's `last_activity_at`. */
async function _writeDone(options: {
  transaction: DatabaseExecutor;
  context: CompleteContext;
  current: UploadFileRow;
  transfer: CompletedTransfer;
  renditions: readonly IngestRendition[];
}): Promise<void> {
  const { transaction, context, current, transfer } = options;
  await transaction
    .updateTable("upload_files")
    .set({
      state: "done",
      width: transfer.width,
      height: transfer.height,
      duration_ms: transfer.durationMs,
      presigned_until: null,
      multipart_upload_id: null,
      problem_code: null,
      problem_detail: null,
      updated_at: context.now,
    })
    .where("id", "=", current.id)
    .execute();
  await ingestUploadFile({
    transaction,
    session: context.session,
    file: current,
    dimensions: transfer,
    renditions: options.renditions,
    now: context.now,
  });
  await transaction
    .updateTable("upload_sessions")
    .set({ last_activity_at: context.now })
    .where("id", "=", context.session.id)
    .execute();
}

/**
 * The one transaction of a verified `done`: the row, the item, the bump and
 * the latch. It calls nothing outside SQLite.
 */
async function _markDoneInTransaction(options: {
  context: CompleteContext;
  transfer: CompletedTransfer;
  renditions: readonly IngestRendition[];
}): Promise<{ didSettle: boolean }> {
  const { context, transfer } = options;
  return runInImmediateTransaction({
    database: context.database,
    callback: async (transaction) => {
      const current = await getUploadFileOr404({
        database: transaction,
        sessionId: context.session.id,
        fileId: context.file.id,
      });
      // A double-clicked complete that lost the race is still a repeat.
      if (
        current.state === "done" &&
        current.content_hash === transfer.contentHash
      ) {
        return { didSettle: false };
      }
      if (current.state !== "sending") {
        throw ApiError.conflict("upload_file_conflict", {
          state: current.state,
        });
      }
      await _writeDone({ ...options, transaction, current });
      return settleUploadSession({
        transaction,
        sessionId: context.session.id,
        now: context.now,
      });
    },
  });
}

/**
 * `outcome: "done"`: verify everything in Backblaze, then write once.
 *
 * A disagreement fails the row (and runs the latch) before the 409 goes out;
 * a Backblaze failure throws the 503 from `verifyUploadedObjects` before any
 * write, leaving the row `sending`.
 */
async function _completeAsDone(options: {
  context: CompleteContext;
  transfer: CompletedTransfer;
}): Promise<{ didSettle: boolean }> {
  const { context, transfer } = options;
  const verification = await verifyUploadedObjects({
    b2: context.b2,
    file: context.file,
    transfer,
  });
  if (!verification.isVerified) {
    await _failInTransaction({
      context,
      problemCode: verification.problemCode,
      problemDetail: verification.problemDetail,
    });
    await _abortIfMultipart(context);
    throw ApiError.conflict("upload_file_conflict", { state: "failed" });
  }
  return _markDoneInTransaction({
    context,
    transfer,
    renditions: verification.renditions,
  });
}

/**
 * Ends one file's transfer, either way, and runs the latch.
 *
 * **No Backblaze call happens inside a transaction** (design decision 2):
 * `verifyUploadedObjects` makes every one of them first, and a multipart
 * abort comes after the commit. See the plan's Task 16 notes for every
 * outcome and repeat this answers.
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
export async function completeUploadFile(options: {
  database: DatabaseExecutor;
  b2: B2Client;
  session: UploadSessionRow;
  file: UploadFileRow;
  body: CompleteUploadFileRequest;
  now: string;
  logger: Pick<FastifyBaseLogger, "warn">;
}): Promise<{ didSettle: boolean }> {
  const { body, ...context } = options;
  _assertSessionAcceptsCompletion(context.session);
  const isRepeat =
    context.file.state === "done" &&
    body.outcome === "done" &&
    body.contentHash === context.file.content_hash;
  if (isRepeat) {
    return { didSettle: false };
  }
  _assertFileAcceptsOutcome({ file: context.file, outcome: body.outcome });
  if (body.outcome === "failed") {
    const result = await _failInTransaction({
      context,
      problemCode: _getReportedProblemCode(body),
      problemDetail: body.problemDetail ?? null,
    });
    await _abortIfMultipart(context);
    return result;
  }
  return _completeAsDone({
    context,
    transfer: getCompletedTransferFromRequest({ body, file: context.file }),
  });
}

/**
 * The `complete` response: the file, the progress and the session's state,
 * so 264 completes are not 264 completes plus 264 reads (Ruling 10).
 *
 * The file is Task 6's `readUploadFileDtos` over the row as it now stands,
 * the same mapping the detail's file page uses. It signs URLs, which is why
 * this runs once every write has committed.
 *
 * @param options.database A handle; read after the write has committed.
 * @param options.b2 For the file's signed media URLs.
 * @param options.sessionId The session.
 * @param options.fileId The file.
 * @param options.didSettle Whether this caller's latch fired.
 * @param options.now The request's clock, which `expiresAt` counts from.
 */
export async function readCompleteUploadFileResponse(options: {
  database: DatabaseExecutor;
  b2: B2Client;
  sessionId: string;
  fileId: string;
  didSettle: boolean;
  now: Date;
}): Promise<CompleteUploadFileResponse> {
  const { database, sessionId } = options;
  const fileRow = await getUploadFileOr404(options);
  const [[file], progress, session] = await Promise.all([
    readUploadFileDtos({ ...options, fileRows: [fileRow] }),
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
