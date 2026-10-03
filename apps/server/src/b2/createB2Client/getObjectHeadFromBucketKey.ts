import { HeadObjectCommand, S3ServiceException } from "@aws-sdk/client-s3";

import type { BucketHandle, HeadObjectResult } from "./createB2Client.types.ts";

/**
 * `HEAD` one object, mapping Backblaze's 404 to `undefined`.
 *
 * `options.key` is the key as the bucket stores it, prefix included.
 */
export async function getObjectHeadFromBucketKey(
  options: Readonly<{
    handle: BucketHandle;
    key: string;
  }>,
): Promise<HeadObjectResult | undefined> {
  try {
    const head = await options.handle.s3.send(
      new HeadObjectCommand({
        Bucket: options.handle.bucket,
        Key: options.key,
      }),
    );
    return {
      sizeBytes: head.ContentLength ?? 0,
      contentType: head.ContentType ?? undefined,
    };
  } catch (error) {
    // A missing object is an answer, not a failure: `complete` turns it into
    // `content_mismatch`. Anything else, an outage included, is the caller's
    // `503`, so it is rethrown untouched.
    if (
      ((sourceError: unknown, status: number): boolean => {
        return (
          sourceError instanceof S3ServiceException &&
          sourceError.$metadata.httpStatusCode === status
        );
      })(error, 404)
    ) {
      return undefined;
    }
    throw error;
  }
}
