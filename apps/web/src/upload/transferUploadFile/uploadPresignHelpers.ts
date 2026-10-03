import type {
  PresignUploadFileResponse,
  RenditionPurpose,
} from "@memory-shoebox/shared";

import type { TransferContext, SingleLease } from "./transferUploadFile.types";

import { callUploadApiWithRetry } from "./uploadRetryHelpers";

import {
  isRetryableApiError,
  isLostPresignRace,
} from "./uploadTransferErrorHelpers";

import { UploadTransferError } from "./UploadTransferError";

/** Presigns one rendition of this file, with the API's retry. */
export function getPresignFromTransferContext(
  functionOptions: Readonly<{
    context: TransferContext;
    body: Readonly<{
      purpose: RenditionPurpose;
      byteSize: number;
      partNumbers?: number[];
    }>;
  }>,
): Promise<PresignUploadFileResponse> {
  const { context, body } = functionOptions;

  return callUploadApiWithRetry({
    state: context,
    call: () => {
      return context.api.presignUploadFile({
        sessionId: context.sessionId,
        fileId: context.fileId,
        body: { contentHash: context.contentHash, ...body },
      });
    },
    isRetryable: (error: unknown): boolean => {
      return isRetryableApiError(error) || isLostPresignRace(error);
    },
  });
}

/**
 * The single-PUT presign as a lease received now, or an error if the server
 * chose multipart.
 */
export function getSingleLeaseFromPresign(
  functionOptions: Readonly<{
    context: Readonly<Pick<TransferContext, "now">>;
    presigned: PresignUploadFileResponse;
  }>,
): SingleLease {
  const { context, presigned } = functionOptions;

  if (presigned.mode !== "single") {
    throw new UploadTransferError({
      problemCode: "storage_rejected",
      message: "Expected a single PUT and was given a multipart upload",
    });
  }
  return {
    url: presigned.url,
    headers: presigned.headers,
    receivedAtMs: context.now(),
  };
}

/** A fresh single-PUT URL for this file's original or one derivative. */
export async function getSingleLeaseFromTransferContext(
  functionOptions: Readonly<{
    context: TransferContext;
    purpose: RenditionPurpose;
  }>,
): Promise<SingleLease> {
  const { context, purpose } = functionOptions;

  return getSingleLeaseFromPresign({
    context: context,
    presigned: await getPresignFromTransferContext({
      context: context,
      body: { purpose, byteSize: context.file.size },
    }),
  });
}
