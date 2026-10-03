import type { FastifyBaseLogger } from "fastify";
import type {
  PresignSingle,
  PresignUploadFileResponse,
  RenditionPurpose,
} from "@memory-shoebox/shared";
import { appConfig } from "../../../../app.config.ts";
import type { B2Client, SignedPart } from "../b2/client/client.ts";
import { runInImmediateTransaction } from "../db/runInImmediateTransaction.ts";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import { ApiError } from "../http/ApiError.ts";
import { callBackblaze } from "./callBackblaze.ts";
import { settleUploadSession } from "./settleUploadSession.ts";
import {
  getUploadFileOr404,
  type UploadFileRow,
  type UploadSessionRow,
} from "./uploadSessionAccess.ts";

/**
 * Every derivative is a JPEG. The spike found WebKit silently answering a
 * WebP request with a PNG 5.7 times the size, so the engine encodes JPEG and
 * this is the type every derivative PUT is signed with.
 */
export const DERIVATIVE_CONTENT_TYPE = "image/jpeg";

/** One of the types the manifest accepts; nothing else reaches a presign. */
type AcceptedContentType =
  (typeof appConfig.upload.acceptedContentTypes)[number];

/** The extension an original is stored under, one per accepted type. */
const ORIGINAL_EXTENSION_BY_TYPE: ReadonlyMap<string, string> = new Map(
  Object.entries({
    "image/jpeg": "jpg",
    "image/heic": "heic",
    "image/heif": "heif",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/quicktime": "mov",
    "video/mp4": "mp4",
  } satisfies Record<AcceptedContentType, string>),
);

/** What the browser makes and uploads. v1 transcodes no video (Ruling 1). */
const UPLOADABLE_PURPOSES: ReadonlySet<RenditionPurpose> = new Set([
  "original",
  "display",
  "thumb",
  "poster",
]);

/** A presign acts on a row that has not finished, failed or been refused. */
const PRESIGNABLE_FILE_STATES: ReadonlySet<string> = new Set([
  "waiting",
  "sending",
]);

/**
 * What one presign asks for, once the route has parsed it.
 *
 * `contentHash` and `byteSize` describe the original even when `purpose` is
 * a derivative: a derivative rides the original's presign.
 */
export type PresignInput = {
  contentHash: string;
  byteSize: number;
  purpose: RenditionPurpose;
  partNumbers: number[] | null;
};

/** The original's signed URLs, and the row values that go with them. */
type SignedOriginal = {
  response: PresignUploadFileResponse;
  storageKey: string;
  multipartUploadId: string | null;
  /** Set only when this call opened the upload, so a failure can abort it. */
  openedUploadId: string | null;
};

/** Another row of the same session that already holds these bytes. */
type HashHolder = {
  fileId: string;
  originalFilename: string;
};

/** The fixed inputs of one presign. */
type PresignContext = {
  database: DatabaseExecutor;
  b2: B2Client;
  session: UploadSessionRow;
  file: UploadFileRow;
  input: PresignInput;
  expiresAt: string;
  now: string;
  logger: Pick<FastifyBaseLogger, "warn">;
};

/**
 * The deterministic key one rendition of one file is stored at.
 *
 * `uploads/<sessionId>/<fileId>/<purpose>.<ext>` (design decision 3): the
 * declared type's extension for the original, `jpg` for every derivative.
 * The key is never in a payload; the signed URL embedding it is the one
 * unavoidable exposure.
 *
 * @param options.sessionId The session.
 * @param options.fileId The file.
 * @param options.purpose Which rendition.
 * @param options.declaredContentType The file's declared type.
 */
export function makeUploadStorageKeyFromRendition(options: {
  sessionId: string;
  fileId: string;
  purpose: RenditionPurpose;
  declaredContentType: string;
}): string {
  const extension =
    options.purpose === "original"
      ? (ORIGINAL_EXTENSION_BY_TYPE.get(
          options.declaredContentType.toLowerCase(),
        ) ?? "bin")
      : "jpg";
  return `uploads/${options.sessionId}/${options.fileId}/${options.purpose}.${extension}`;
}

/** The refusals that need no read and no network, in the contract's order. */
function _assertMayPresign(options: {
  session: UploadSessionRow;
  file: UploadFileRow;
  input: PresignInput;
}): void {
  const { session, file, input } = options;
  // No byte may move before commit, and a cancelled draft never commits.
  if (session.committed_at === null || session.state === "cancelled") {
    throw ApiError.conflict("upload_session_conflict");
  }
  if (!UPLOADABLE_PURPOSES.has(input.purpose)) {
    throw ApiError.invalidRequest({
      purpose: [
        "Video transcodes are not uploaded; the player plays the original.",
      ],
    });
  }
  if (!PRESIGNABLE_FILE_STATES.has(file.state)) {
    throw ApiError.conflict("upload_file_conflict", { state: file.state });
  }
  if (input.byteSize !== file.declared_bytes) {
    throw ApiError.invalidRequest({
      byteSize: ["That is not the size this file was declared with."],
    });
  }
  if (file.content_hash !== null && file.content_hash !== input.contentHash) {
    throw ApiError.invalidRequest({
      contentHash: ["This file was presigned with different bytes."],
    });
  }
}

/**
 * The other row of this session that already holds these bytes, or nothing.
 *
 * Read before any Backblaze call, so a duplicate never opens a multipart
 * upload, and again inside the write, which is what keeps the partial unique
 * index on `(upload_session_id, content_hash)` from ever turning a race into
 * a 500. A row that already carries a hash has none to collide with.
 */
async function _getHashHolder(options: {
  database: DatabaseExecutor;
  file: UploadFileRow;
  contentHash: string;
}): Promise<HashHolder | undefined> {
  if (options.file.content_hash !== null) {
    return undefined;
  }
  return options.database
    .selectFrom("upload_files")
    .select([
      "upload_files.id as fileId",
      "upload_files.original_filename as originalFilename",
    ])
    .where(
      "upload_files.upload_session_id",
      "=",
      options.file.upload_session_id,
    )
    .where("upload_files.content_hash", "=", options.contentHash)
    .where("upload_files.id", "!=", options.file.id)
    .executeTakeFirst();
}

/**
 * A duplicate is cancelled, not failed (design decision 15): a failed row
 * would show as a casualty with a retry that can never succeed, and a row
 * left `waiting` would hold the latch open. Cancelling is a terminal
 * transition, so the latch runs in the same transaction. `problem_code`
 * stays null, as a draft cancel leaves it: the column has no duplicate code.
 */
async function _cancelDuplicate(options: {
  transaction: DatabaseExecutor;
  file: UploadFileRow;
  holder: HashHolder;
  now: string;
}): Promise<void> {
  const { transaction, file, now } = options;
  await transaction
    .updateTable("upload_files")
    .set({
      state: "cancelled",
      problem_code: null,
      problem_detail: `Identical to ${options.holder.originalFilename}, which is already in this batch.`,
      presigned_until: null,
      updated_at: now,
    })
    .where("id", "=", file.id)
    .execute();
  await transaction
    .updateTable("upload_sessions")
    .set({ last_activity_at: now })
    .where("id", "=", file.upload_session_id)
    .execute();
  await settleUploadSession({
    transaction,
    sessionId: file.upload_session_id,
    now,
  });
}

/** The 409 a duplicate answers with: the row holding the bytes, and its own end. */
function _makeDuplicateConflict(holder: HashHolder): ApiError {
  return ApiError.conflict("upload_file_conflict", {
    fileId: holder.fileId,
    state: "cancelled",
  });
}

/** The parts to sign: all of them, or the ones asked for, in order. */
function _getWantedPartNumbers(options: {
  requested: readonly number[] | null;
  partCount: number;
}): number[] {
  if (options.requested === null) {
    return Array.from({ length: options.partCount }, (_unused, index) => {
      return index + 1;
    });
  }
  const isOutOfRange = options.requested.some((partNumber) => {
    return (
      !Number.isInteger(partNumber) ||
      partNumber < 1 ||
      partNumber > options.partCount
    );
  });
  if (options.requested.length === 0 || isOutOfRange) {
    throw ApiError.invalidRequest({
      partNumbers: [`This file's parts run from 1 to ${options.partCount}.`],
    });
  }
  return [...new Set(options.requested)].sort((left, right) => {
    return left - right;
  });
}

/** Opens the upload and keeps the URLs for the parts asked for. */
async function _openMultipart(options: {
  context: PresignContext;
  storageKey: string;
  partCount: number;
  partNumbers: readonly number[];
}): Promise<{ uploadId: string; openedUploadId: string; parts: SignedPart[] }> {
  const { context } = options;
  const started = await callBackblaze(() => {
    return context.b2.presignMultipart({
      key: options.storageKey,
      contentType: context.file.declared_content_type,
      partCount: options.partCount,
      expiresInSeconds: appConfig.upload.presignTtlSeconds,
    });
  });
  return {
    uploadId: started.uploadId,
    openedUploadId: started.uploadId,
    parts: options.partNumbers.flatMap((partNumber) => {
      const url = started.partUrls[partNumber - 1];
      return url === undefined ? [] : [{ partNumber, url }];
    }),
  };
}

/** Keeps the open upload's id and signs fresh URLs for the parts asked for. */
async function _resignParts(options: {
  context: PresignContext;
  storageKey: string;
  uploadId: string;
  partNumbers: readonly number[];
}): Promise<{ uploadId: string; openedUploadId: null; parts: SignedPart[] }> {
  const parts = await callBackblaze(() => {
    return options.context.b2.signParts({
      key: options.storageKey,
      uploadId: options.uploadId,
      partNumbers: options.partNumbers,
      expiresInSeconds: appConfig.upload.presignTtlSeconds,
    });
  });
  return { uploadId: options.uploadId, openedUploadId: null, parts };
}

/**
 * A multipart original: open it on the first presign, or keep its id and
 * sign only the parts still wanted on a re-presign (`upload.md` § When a
 * presigned URL expires), since `presignMultipart` always opens a new one.
 */
async function _signMultipartOriginal(options: {
  context: PresignContext;
  storageKey: string;
}): Promise<SignedOriginal> {
  const { context, storageKey } = options;
  const { file } = context;
  const partCount = Math.ceil(
    file.declared_bytes / appConfig.upload.multipartPartSizeBytes,
  );
  const partNumbers = _getWantedPartNumbers({
    requested: context.input.partNumbers,
    partCount,
  });
  const uploadId = file.multipart_upload_id;
  const signed =
    uploadId === null
      ? await _openMultipart({ context, storageKey, partCount, partNumbers })
      : await _resignParts({ context, storageKey, uploadId, partNumbers });
  return {
    storageKey,
    multipartUploadId: signed.uploadId,
    openedUploadId: signed.openedUploadId,
    response: {
      mode: "multipart",
      fileId: file.id,
      multipartUploadId: signed.uploadId,
      partSizeBytes: appConfig.upload.multipartPartSizeBytes,
      partCount,
      parts: signed.parts.map((part) => {
        return { ...part, expiresAt: context.expiresAt };
      }),
      method: "PUT",
      // The part URLs sign `host` alone; the type was set when the upload opened.
      headers: {},
      expiresAt: context.expiresAt,
    },
  };
}

/** The original's URL or URLs, single or multipart by declared size. */
async function _signOriginal(context: PresignContext): Promise<SignedOriginal> {
  const { file } = context;
  const storageKey = makeUploadStorageKeyFromRendition({
    sessionId: file.upload_session_id,
    fileId: file.id,
    purpose: "original",
    declaredContentType: file.declared_content_type,
  });
  if (file.declared_bytes >= appConfig.upload.multipartThresholdBytes) {
    return _signMultipartOriginal({ context, storageKey });
  }
  if (context.input.partNumbers !== null) {
    throw ApiError.invalidRequest({
      partNumbers: ["This file goes up in one PUT and has no parts."],
    });
  }
  const url = await callBackblaze(() => {
    return context.b2.presignPut({
      key: storageKey,
      contentType: file.declared_content_type,
      expiresInSeconds: appConfig.upload.presignTtlSeconds,
    });
  });
  return {
    storageKey,
    multipartUploadId: null,
    openedUploadId: null,
    response: {
      mode: "single",
      fileId: file.id,
      method: "PUT",
      url,
      headers: { "Content-Type": file.declared_content_type },
      expiresAt: context.expiresAt,
    },
  };
}

/** The row is still the one that was signed for, or a 409 naming its state. */
function _assertUnchangedSinceSigning(options: {
  planned: UploadFileRow;
  current: UploadFileRow;
  contentHash: string;
}): void {
  const { planned, current } = options;
  const isUnchanged =
    PRESIGNABLE_FILE_STATES.has(current.state) &&
    current.multipart_upload_id === planned.multipart_upload_id &&
    (current.content_hash === null ||
      current.content_hash === options.contentHash);
  if (!isUnchanged) {
    throw ApiError.conflict("upload_file_conflict", { state: current.state });
  }
}

/**
 * Aborts a multipart upload this call opened and could not record, outside
 * any transaction, so Backblaze does not bill parts nothing will name.
 */
async function _abortOrphanedUpload(options: {
  context: PresignContext;
  signed: SignedOriginal;
}): Promise<void> {
  const uploadId = options.signed.openedUploadId;
  if (uploadId === null) {
    return;
  }
  try {
    await options.context.b2.abortMultipart({
      key: options.signed.storageKey,
      uploadId,
    });
  } catch (error) {
    options.context.logger.warn(
      { err: error, fileId: options.context.file.id },
      "could not abort a multipart upload this presign opened and never recorded",
    );
  }
}

/**
 * Everything the presign decided, on the row, with the session's
 * `last_activity_at`: the hash, the key, the expiry, the upload id, and one
 * more attempt.
 *
 * `presigned_until` is the latest presign's expiry and nothing more. A
 * re-presign of some parts moves it forward while the URLs signed earlier for
 * the other parts may expire sooner, so nothing may read it as a guarantee
 * that every URL still works; the browser learns of an expiry from Backblaze's
 * `403` and presigns again.
 */
async function _markPresigned(options: {
  transaction: DatabaseExecutor;
  context: PresignContext;
  signed: SignedOriginal;
  file: UploadFileRow;
}): Promise<void> {
  const { transaction, context, signed, file } = options;
  await transaction
    .updateTable("upload_files")
    .set((expressionBuilder) => {
      return {
        content_hash: context.input.contentHash,
        storage_key: signed.storageKey,
        presigned_until: context.expiresAt,
        multipart_upload_id: signed.multipartUploadId,
        attempt_count: expressionBuilder("attempt_count", "+", 1),
        state: "sending",
        updated_at: context.now,
      };
    })
    .where("id", "=", file.id)
    .execute();
  await transaction
    .updateTable("upload_sessions")
    .set({ last_activity_at: context.now })
    .where("id", "=", file.upload_session_id)
    .execute();
}

/**
 * Inside the write: re-read the row, re-check it against what was signed,
 * and write everything the presign decided. A row that turns out to
 * duplicate another is cancelled here instead, and its holder returned.
 */
async function _writeOriginalPresign(options: {
  transaction: DatabaseExecutor;
  context: PresignContext;
  signed: SignedOriginal;
}): Promise<HashHolder | undefined> {
  const { transaction, context, signed } = options;
  const current = await getUploadFileOr404({
    database: transaction,
    sessionId: context.file.upload_session_id,
    fileId: context.file.id,
  });
  _assertUnchangedSinceSigning({
    planned: context.file,
    current,
    contentHash: context.input.contentHash,
  });
  const holder = await _getHashHolder({
    database: transaction,
    file: current,
    contentHash: context.input.contentHash,
  });
  if (holder !== undefined) {
    await _cancelDuplicate({
      transaction,
      file: current,
      holder,
      now: context.now,
    });
    return holder;
  }
  await _markPresigned({ transaction, context, signed, file: current });
  return undefined;
}

/**
 * The one short transaction after Backblaze has answered: re-read the row,
 * re-check it, and write everything the presign decided together, with the
 * session's `last_activity_at`. A multipart upload this call opened and could
 * not record, because the write refused or the row lost a race to a
 * duplicate, is aborted after it.
 */
async function _recordOriginalPresign(options: {
  context: PresignContext;
  signed: SignedOriginal;
}): Promise<void> {
  const { context, signed } = options;
  const holder = await runInImmediateTransaction({
    database: context.database,
    callback: (transaction) => {
      return _writeOriginalPresign({ transaction, context, signed });
    },
  }).catch(async (error: unknown) => {
    await _abortOrphanedUpload({ context, signed });
    throw error;
  });
  if (holder !== undefined) {
    await _abortOrphanedUpload({ context, signed });
    throw _makeDuplicateConflict(holder);
  }
}

/**
 * A duplicate found before any Backblaze call: cancelled in one short
 * transaction, which re-reads the row first, then the 409.
 */
async function _cancelDuplicateBeforeSigning(options: {
  context: PresignContext;
  holder: HashHolder;
}): Promise<never> {
  const { context, holder } = options;
  await runInImmediateTransaction({
    database: context.database,
    callback: async (transaction) => {
      const current = await getUploadFileOr404({
        database: transaction,
        sessionId: context.file.upload_session_id,
        fileId: context.file.id,
      });
      _assertUnchangedSinceSigning({
        planned: context.file,
        current,
        contentHash: context.input.contentHash,
      });
      await _cancelDuplicate({
        transaction,
        file: current,
        holder,
        now: context.now,
      });
    },
  });
  throw _makeDuplicateConflict(holder);
}

/**
 * A derivative: one PUT signed as a JPEG at its deterministic key. It writes
 * nothing on the row and does not count as an attempt; it needs the original
 * presigned first, which is what wrote the hash it rides on.
 */
async function _presignDerivative(
  context: PresignContext,
): Promise<PresignSingle> {
  const { file } = context;
  if (file.state !== "sending") {
    throw ApiError.conflict("upload_file_conflict", { state: file.state });
  }
  if (context.input.partNumbers !== null) {
    throw ApiError.invalidRequest({
      partNumbers: ["A derivative goes up in one PUT and has no parts."],
    });
  }
  const key = makeUploadStorageKeyFromRendition({
    sessionId: file.upload_session_id,
    fileId: file.id,
    purpose: context.input.purpose,
    declaredContentType: file.declared_content_type,
  });
  const url = await callBackblaze(() => {
    return context.b2.presignPut({
      key,
      contentType: DERIVATIVE_CONTENT_TYPE,
      expiresInSeconds: appConfig.upload.presignTtlSeconds,
    });
  });
  await context.database
    .updateTable("upload_sessions")
    .set({ last_activity_at: context.now })
    .where("id", "=", file.upload_session_id)
    .execute();
  return {
    mode: "single",
    fileId: file.id,
    method: "PUT",
    url,
    headers: { "Content-Type": DERIVATIVE_CONTENT_TYPE },
    expiresAt: context.expiresAt,
  };
}

/**
 * Mints the URL the browser PUTs one rendition of one file to.
 *
 * **Backblaze first, then one short transaction, and nothing written if
 * Backblaze fails.** The route's contract is `tech-specs/apis/upload.md`
 * (`POST .../presign`, and the sequence's "When a presigned URL expires
 * mid-transfer"); the order, the bookkeeping and the duplicate are decisions
 * 2, 3 and 15 of `docs/superpowers/specs/2026-10-02-upload-design.md`.
 *
 * @param options.database The outer handle; the write opens its own
 *   transaction.
 * @param options.b2 The Backblaze client.
 * @param options.session The session, already resolved for its uploader.
 * @param options.file The file, already resolved in that session.
 * @param options.input What the browser asked for.
 * @param options.now The request's instant.
 * @param options.logger Where an orphaned upload's failed abort is reported.
 */
export async function presignUploadFile(options: {
  database: DatabaseExecutor;
  b2: B2Client;
  session: UploadSessionRow;
  file: UploadFileRow;
  input: PresignInput;
  now: Date;
  logger: Pick<FastifyBaseLogger, "warn">;
}): Promise<PresignUploadFileResponse> {
  _assertMayPresign(options);
  const context: PresignContext = {
    ...options,
    expiresAt: new Date(
      options.now.getTime() + appConfig.upload.presignTtlSeconds * 1000,
    ).toISOString(),
    now: options.now.toISOString(),
  };
  if (options.input.purpose !== "original") {
    return _presignDerivative(context);
  }
  const holder = await _getHashHolder({
    database: options.database,
    file: options.file,
    contentHash: options.input.contentHash,
  });
  if (holder !== undefined) {
    return _cancelDuplicateBeforeSigning({ context, holder });
  }
  const signed = await _signOriginal(context);
  await _recordOriginalPresign({ context, signed });
  return signed.response;
}
