import type { PresignSingle, RenditionPurpose } from "@memory-shoebox/shared";

import { appConfig } from "../../../../../app.config.ts";

import { ApiError } from "../../http/ApiError.ts";

import { callBackblaze } from "../callBackblaze.ts";

import {
  type UploadFileRow,
  type UploadSessionRow,
} from "../uploadSessionAccessHelpers.ts";

import type {
  PresignInput,
  PresignContext,
} from "./presignUploadFile.types.ts";

import {
  DERIVATIVE_PURPOSES,
  PRESIGNABLE_FILE_STATES,
  makeUploadStorageKeyFromRendition,
  DERIVATIVE_CONTENT_TYPE,
} from "./uploadStorageKeyHelpers.ts";

import { markUploadDerivativeActivity } from "./uploadPresignPersistenceHelpers.ts";

/** The refusals that need no read and no network, in the contract's order. */
export function assertMayPresign(
  options: Readonly<{
    session: UploadSessionRow;
    file: UploadFileRow;
    input: PresignInput;
  }>,
): void {
  const { session, file, input } = options;
  // No byte may move before commit, and a cancelled draft never commits.
  if (session.committed_at === null || session.state === "cancelled") {
    throw ApiError.conflict({ code: "upload_session_conflict" });
  }
  if (
    !(
      new Set([
        "original",
        ...DERIVATIVE_PURPOSES,
      ]) satisfies ReadonlySet<RenditionPurpose>
    ).has(input.purpose)
  ) {
    throw ApiError.invalidRequest({
      purpose: [
        "Video transcodes are not uploaded; the player plays the original.",
      ],
    });
  }
  if (!PRESIGNABLE_FILE_STATES.has(file.state)) {
    throw ApiError.conflict({
      code: "upload_file_conflict",
      details: { state: file.state },
    });
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
 * A derivative: one PUT signed as a JPEG at its deterministic key. It writes
 * nothing on the row but the activity clocks and does not count as an
 * attempt; it needs the original presigned first, which is what wrote the
 * hash it rides on.
 */
export async function presignDerivative(
  context: Readonly<PresignContext>,
): Promise<PresignSingle> {
  const { file } = context;
  if (file.state !== "sending") {
    throw ApiError.conflict({
      code: "upload_file_conflict",
      details: { state: file.state },
    });
  }
  if (context.input.partNumbers !== undefined) {
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
  await markUploadDerivativeActivity(context);
  return {
    mode: "single",
    fileId: file.id,
    method: "PUT",
    url,
    headers: { "Content-Type": DERIVATIVE_CONTENT_TYPE },
    expiresAt: context.expiresAt,
  };
}
