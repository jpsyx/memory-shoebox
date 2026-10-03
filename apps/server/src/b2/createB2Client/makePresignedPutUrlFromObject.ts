import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { appConfig } from "../../../../../app.config.ts";

import type { B2Client, B2OperationContext } from "./createB2Client.types.ts";
import { makeBucketKeyFromKey } from "./makeBucketKeyFromKey.ts";

/** presignPut against the configured bucket and key prefix. */
export function makePresignedPutUrlFromObject(
  input: Readonly<{
    context: B2OperationContext;
    options: Parameters<B2Client["presignPut"]>[0];
  }>,
): ReturnType<B2Client["presignPut"]> {
  const { config, s3, keyPrefix } = input.context;
  const {
    key,
    contentType,
    expiresInSeconds = appConfig.upload.presignTtlSeconds,
  } = input.options;

  return getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: makeBucketKeyFromKey({ keyPrefix, key }),
      ContentType: contentType,
    }),
    {
      expiresIn: expiresInSeconds,
      signableHeaders: new Set(["content-type"]),
    },
  );
}
