import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { makeDownloadDispositionFromFilename } from "./makeDownloadDispositionFromFilename.ts";
import type { B2Client, B2OperationContext } from "./createB2Client.types.ts";
import { makeBucketKeyFromKey } from "./makeBucketKeyFromKey.ts";

/** presignGet against the configured bucket and key prefix. */
export function makePresignedGetUrlFromObject(
  input: Readonly<{
    context: B2OperationContext;
    options: Parameters<B2Client["presignGet"]>[0];
  }>,
): ReturnType<B2Client["presignGet"]> {
  const { config, s3, keyPrefix } = input.context;
  const {
    key,
    expiresInSeconds = MAX_PRESIGNED_URL_SECONDS,
    downloadFilename,
  } = input.options;

  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: makeBucketKeyFromKey({ keyPrefix, key }),
      ResponseCacheControl: `private, max-age=${MAX_PRESIGNED_URL_SECONDS}`,
      ...(downloadFilename === undefined
        ? {}
        : {
            ResponseContentDisposition:
              makeDownloadDispositionFromFilename(downloadFilename),
          }),
    }),
    { expiresIn: expiresInSeconds },
  );
}

/** Seven days, the maximum S3 presign lifetime. */
const MAX_PRESIGNED_URL_SECONDS = 604800;
