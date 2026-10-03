import {
  ListObjectsV2Command,
  type ListObjectsV2CommandOutput,
} from "@aws-sdk/client-s3";

import type { B2Client, B2OperationContext } from "./createB2Client.types.ts";
import { makeBucketKeyFromKey } from "./makeBucketKeyFromKey.ts";

/** listObjects against the configured bucket and key prefix. */
export async function* listBucketObjects(
  input: Readonly<{
    context: B2OperationContext;
    options?: Parameters<B2Client["listObjects"]>[0];
  }>,
): ReturnType<B2Client["listObjects"]> {
  const { config, s3, keyPrefix } = input.context;
  const options = input.options ?? {};

  // A loop is unavoidable here: the S3 list API is cursor-paginated and
  // each page's token is only known once the previous page returns.
  let continuationToken: string | undefined = undefined;
  do {
    // Annotated because `page` feeds the token that produced it, and
    // TypeScript cannot infer a type through that cycle.
    const { prefix = "" } = options;
    const page: ListObjectsV2CommandOutput = await s3.send(
      new ListObjectsV2Command({
        Bucket: config.bucket,
        Prefix: makeBucketKeyFromKey({
          keyPrefix,
          key: prefix,
        }),
        ContinuationToken: continuationToken,
      }),
    );
    const contents = page.Contents ?? [];
    for (const object of contents) {
      const key = object.Key?.startsWith(`${keyPrefix}/`)
        ? object.Key.slice(keyPrefix.length + 1)
        : undefined;
      if (key === undefined) {
        continue;
      }
      yield {
        key,
        sizeBytes: object.Size ?? 0,
        uploadedAt: (object.LastModified ?? new Date()).toISOString(),
      };
    }
    continuationToken =
      page.IsTruncated === true ? page.NextContinuationToken : undefined;
  } while (continuationToken !== undefined);
}
