import { appConfig } from "../../../../../app.config.ts";

import type { B2Client, B2OperationContext } from "./createB2Client.types.ts";
import { makeBucketKeyFromKey } from "./makeBucketKeyFromKey.ts";

import { signB2Parts } from "./signB2Parts.ts";

/** signParts against the configured bucket and key prefix. */
export function signMultipartParts(
  input: Readonly<{
    context: B2OperationContext;
    options: Parameters<B2Client["signParts"]>[0];
  }>,
): ReturnType<B2Client["signParts"]> {
  const { handle, keyPrefix } = input.context;
  const {
    key,
    uploadId,
    partNumbers,
    expiresInSeconds = appConfig.upload.presignTtlSeconds,
  } = input.options;

  return signB2Parts({
    handle,
    key: makeBucketKeyFromKey({ keyPrefix, key }),
    uploadId,
    partNumbers,
    expiresInSeconds,
  });
}
