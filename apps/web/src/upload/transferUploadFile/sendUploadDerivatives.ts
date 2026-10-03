import type { UploadedRendition } from "@memory-shoebox/shared";

import { appConfig } from "../../../../../app.config";

import type { MadeDerivative } from "@/upload/jpegDerivativesHelpers/jpegDerivativesHelpers";

import type { TransferContext } from "./transferUploadFile.types";

import { reportUploadProgress } from "./reportUploadProgress";

import { getSingleLeaseFromTransferContext } from "./uploadPresignHelpers";

import { putUploadBytes } from "./putUploadBytes";

import { isBatchClosed } from "./uploadTransferErrorHelpers";

/**
 * Lets a derivative go: it no longer counts toward the total, so the file can
 * still reach 100%.
 */
function _dropDerivative(
  functionOptions: Readonly<{
    context: TransferContext;
    derivative: Readonly<MadeDerivative>;
  }>,
): undefined {
  const { context, derivative } = functionOptions;

  context.totalBytes -= derivative.blob.size;
  reportUploadProgress({ context: context, inFlightBytes: 0 });
  return undefined;
}

/**
 * One derivative: presign, PUT. Answers its rendition, or null to drop it.
 *
 * The presign names the derivative's purpose and the *original's* size: a
 * derivative rides the original's presign (design decision 3), so the hash
 * and the size always describe the original, and the derivative's own size
 * is reported at `complete`, where Backblaze confirms it. One over
 * `appConfig.upload.derivatives.maxBytes`, which `complete` would refuse, is
 * dropped before it is presigned.
 */
async function _sendDerivative(
  functionOptions: Readonly<{
    context: TransferContext;
    derivative: MadeDerivative;
  }>,
): Promise<UploadedRendition | undefined> {
  const { context, derivative } = functionOptions;

  if (derivative.blob.size > appConfig.upload.derivatives.maxBytes) {
    return _dropDerivative({ context: context, derivative: derivative });
  }
  const presignDerivative = () => {
    return getSingleLeaseFromTransferContext({
      context: context,
      purpose: derivative.purpose,
    });
  };
  try {
    const lease = await presignDerivative();
    await putUploadBytes({
      request: {
        context,
        lease,
        headers: lease.headers,
        body: derivative.blob,
        represign: presignDerivative,
      },
    });
    return {
      purpose: derivative.purpose,
      byteSize: derivative.blob.size,
      width: derivative.width,
      height: derivative.height,
    };
  } catch (error: unknown) {
    // A derivative that will not land is dropped, as one that could not be
    // made is (Ruling 1): the file still completes, on its original. Only a
    // cancellation, or the batch closing under the file, stops it.
    if (context.signal.aborted || isBatchClosed(error)) {
      throw error;
    }
    return _dropDerivative({ context: context, derivative: derivative });
  }
}

/** Every derivative, one at a time, keeping the ones that landed. */
export async function sendUploadDerivatives(
  context: TransferContext,
): Promise<UploadedRendition[]> {
  return context.derivatives.reduce<Promise<UploadedRendition[]>>(
    async (landedSoFar, derivative) => {
      const landed = await landedSoFar;
      const rendition = await _sendDerivative({
        context: context,
        derivative: derivative,
      });
      return rendition === undefined ? landed : [...landed, rendition];
    },
    Promise.resolve([]),
  );
}
