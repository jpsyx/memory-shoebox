import type { B2Client, B2OperationContext } from "./createB2Client.types.ts";
import { makeBucketKeyFromKey } from "./makeBucketKeyFromKey.ts";
import { getObjectHeadFromBucketKey } from "./getObjectHeadFromBucketKey.ts";

/** headObject against the configured bucket and key prefix. */
export function headBucketObject(
  input: Readonly<{
    context: B2OperationContext;
    options: Parameters<B2Client["headObject"]>[0];
  }>,
): ReturnType<B2Client["headObject"]> {
  const { handle, keyPrefix } = input.context;
  const { key } = input.options;

  return getObjectHeadFromBucketKey({
    handle,
    key: makeBucketKeyFromKey({ keyPrefix, key }),
  });
}
