import { UploadPartCommand } from "@aws-sdk/client-s3";

import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import type { SignPartsOptions2, SignedPart } from "./createB2Client.types.ts";

/**
 * Signs `UploadPart` URLs for an upload that is already open, exactly as
 * `presignMultipart` signs them: same command, same lifetime option.
 *
 * `options.key` is the key as the bucket stores it, prefix included.
 */
export function signB2Parts(
  options: Readonly<Omit<SignPartsOptions2, "partNumbers">> &
    Readonly<{ partNumbers: readonly number[] }>,
): Promise<SignedPart[]> {
  return Promise.all(
    options.partNumbers.map(async (partNumber) => {
      const url = await getSignedUrl(
        options.handle.s3,
        new UploadPartCommand({
          Bucket: options.handle.bucket,
          Key: options.key,
          UploadId: options.uploadId,
          PartNumber: partNumber,
        }),
        { expiresIn: options.expiresInSeconds },
      );
      return { partNumber, url };
    }),
  );
}
