import { PutObjectCommand } from "@aws-sdk/client-s3";

import type { B2Client, B2OperationContext } from "./createB2Client.types.ts";
import { makeBucketKeyFromKey } from "./makeBucketKeyFromKey.ts";

/** putObject against the configured bucket and key prefix. */
export async function putBucketObject(
  input: Readonly<{
    context: B2OperationContext;
    options: Parameters<B2Client["putObject"]>[0];
  }>,
): ReturnType<B2Client["putObject"]> {
  const { config, s3, keyPrefix } = input.context;
  const { key, body, contentType } = input.options;

  await s3.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: makeBucketKeyFromKey({ keyPrefix, key }),
      Body: body,
      ContentType: contentType,
      CacheControl: `private, max-age=${MAX_PRESIGNED_URL_SECONDS}`,
    }),
  );
}

/** Seven days, the maximum S3 presign lifetime. */
const MAX_PRESIGNED_URL_SECONDS = 604800;
