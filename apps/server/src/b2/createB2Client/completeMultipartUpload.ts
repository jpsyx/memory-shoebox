import { CompleteMultipartUploadCommand } from "@aws-sdk/client-s3";

import type { B2Client, B2OperationContext } from "./createB2Client.types.ts";
import { makeBucketKeyFromKey } from "./makeBucketKeyFromKey.ts";

/** completeMultipart against the configured bucket and key prefix. */
export async function completeMultipartUpload(
  input: Readonly<{
    context: B2OperationContext;
    options: Parameters<B2Client["completeMultipart"]>[0];
  }>,
): ReturnType<B2Client["completeMultipart"]> {
  const { config, s3, keyPrefix } = input.context;
  const { key, uploadId, parts } = input.options;

  await s3.send(
    new CompleteMultipartUploadCommand({
      Bucket: config.bucket,
      Key: makeBucketKeyFromKey({ keyPrefix, key }),
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts.map((part) => {
          return { PartNumber: part.partNumber, ETag: part.etag };
        }),
      },
    }),
  );
}
