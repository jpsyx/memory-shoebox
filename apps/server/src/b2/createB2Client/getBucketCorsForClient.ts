import type { B2Client, B2OperationContext } from "./createB2Client.types.ts";

import { getBucketCorsFromHandle } from "./bucketCorsHelpers.ts";

/** getBucketCors against the configured bucket and key prefix. */
export function getBucketCorsForClient(
  input: Readonly<{ context: B2OperationContext }>,
): ReturnType<B2Client["getBucketCors"]> {
  const { handle } = input.context;

  return getBucketCorsFromHandle(handle);
}
