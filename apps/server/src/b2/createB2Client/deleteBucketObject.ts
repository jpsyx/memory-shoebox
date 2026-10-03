import { DeleteObjectCommand } from "@aws-sdk/client-s3";

import type { B2Client, B2OperationContext } from "./createB2Client.types.ts";
import { makeBucketKeyFromKey } from "./makeBucketKeyFromKey.ts";

/** deleteObject against the configured bucket and key prefix. */
export async function deleteBucketObject(
  input: Readonly<{
    context: B2OperationContext;
    options: Parameters<B2Client["deleteObject"]>[0];
  }>,
): ReturnType<B2Client["deleteObject"]> {
  const { config, s3, keyPrefix } = input.context;
  const { key } = input.options;

  await s3.send(
    new DeleteObjectCommand({
      Bucket: config.bucket,
      Key: makeBucketKeyFromKey({ keyPrefix, key }),
    }),
  );
}
