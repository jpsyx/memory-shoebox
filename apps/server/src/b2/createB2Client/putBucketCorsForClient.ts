import type { B2Client, B2OperationContext } from "./createB2Client.types.ts";

import { putBucketCors } from "./bucketCorsHelpers.ts";

/** putBucketCors against the configured bucket and key prefix. */
export function putBucketCorsForClient(
  input: Readonly<{
    context: B2OperationContext;
    options: Parameters<B2Client["putBucketCors"]>[0];
  }>,
): ReturnType<B2Client["putBucketCors"]> {
  const { handle } = input.context;
  const { rules } = input.options;

  return putBucketCors({ handle, rules });
}
