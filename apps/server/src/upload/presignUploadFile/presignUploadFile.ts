import type { PresignUploadFileResponse } from "@memory-shoebox/shared";

import { appConfig } from "../../../../../app.config.ts";

import type {
  PresignContext,
  PresignUploadFileOptions,
} from "./presignUploadFile.types.ts";

import { recordUploadOriginalPresign } from "./uploadPresignPersistenceHelpers.ts";

import {
  getHashHolderFromPresignContext,
  cancelDuplicateBeforeSigning,
} from "./uploadDuplicateHelpers.ts";

import { signUploadOriginal } from "./signUploadOriginal.ts";

import {
  assertMayPresign,
  presignDerivative,
} from "./presignUploadFileSupportHelpers.ts";

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
export async function presignUploadFile(
  options: Readonly<PresignUploadFileOptions>,
): Promise<PresignUploadFileResponse> {
  assertMayPresign(options);
  const context: PresignContext = {
    ...options,
    expiresAt: new Date(
      options.now.getTime() + appConfig.upload.presignTtlSeconds * 1000,
    ).toISOString(),
    now: options.now.toISOString(),
  };
  if (options.input.purpose !== "original") {
    return presignDerivative(context);
  }
  const holder = await getHashHolderFromPresignContext({
    database: options.database,
    file: options.file,
    contentHash: options.input.contentHash,
  });
  if (holder !== undefined) {
    return cancelDuplicateBeforeSigning({ context, holder });
  }
  const signed = await signUploadOriginal(context);
  await recordUploadOriginalPresign({ context, signed });
  return signed.response;
}
