import { AbortMultipartUploadCommand } from "@aws-sdk/client-s3";

import type { B2Client, B2OperationContext } from "./createB2Client.types.ts";
import { makeBucketKeyFromKey } from "./makeBucketKeyFromKey.ts";

/** abortMultipart against the configured bucket and key prefix. */
export async function abortMultipartUpload(
  input: Readonly<{
    context: B2OperationContext;
    options: Parameters<B2Client["abortMultipart"]>[0];
  }>,
): ReturnType<B2Client["abortMultipart"]> {
  const { config, s3, keyPrefix } = input.context;
  const { key, uploadId } = input.options;

  await s3.send(
    new AbortMultipartUploadCommand({
      Bucket: config.bucket,
      Key: makeBucketKeyFromKey({ keyPrefix, key }),
      UploadId: uploadId,
    }),
  );
}
