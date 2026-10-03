import { listBucketObjects } from "./listBucketObjects.ts";
import { makePresignedGetUrlFromObject } from "./makePresignedGetUrlFromObject.ts";
import { makePresignedPutUrlFromObject } from "./makePresignedPutUrlFromObject.ts";
import { startMultipartUpload } from "./startMultipartUpload.ts";
import { completeMultipartUpload } from "./completeMultipartUpload.ts";
import { abortMultipartUpload } from "./abortMultipartUpload.ts";
import { deleteBucketObject } from "./deleteBucketObject.ts";
import { putBucketObject } from "./putBucketObject.ts";
import { headBucketObject } from "./headBucketObject.ts";
import { signMultipartParts } from "./signMultipartParts.ts";
import { getBucketCorsForClient } from "./getBucketCorsForClient.ts";
import { putBucketCorsForClient } from "./putBucketCorsForClient.ts";
import { S3Client } from "@aws-sdk/client-s3";

import { KEY_PREFIX_PATTERN, type B2Config } from "../../configHelpers.ts";

import type {
  B2Client,
  BucketHandle,
  B2OperationContext,
} from "./createB2Client.types.ts";

/**
 * Creates a thin client over Backblaze B2's S3-compatible API.
 *
 * Memory Shoebox keeps media bytes in B2 and only metadata in SQLite. The
 * browser fetches photos and videos straight from B2 through presigned URLs, so
 * large files never pass through the server and never count against its
 * bandwidth.
 *
 * Presigned URLs are signed for their maximum lifetime and carry a matching
 * `Cache-Control`, so the browser can reuse a cached copy for the same period
 * instead of re-fetching bytes that never change. The tradeoff is that a
 * presigned URL is a bearer link for as long as it lives: anyone holding one
 * can fetch that object without a session.
 *
 * **Every key is prefixed here and only here.** Each operation that takes a key
 * sends `<keyPrefix>/<key>` to Backblaze, and `listObjects` lists under the
 * prefix and hands the keys back without it, so test and production objects
 * share one bucket without ever sharing a key (`B2Config.keyPrefix`). The CORS
 * operations address the bucket itself and are not prefixed. The prefix is
 * checked here too, not only in `parseConfig`, so a config built by hand with
 * an empty one throws rather than writing at the bucket's root.
 *
 * `requestChecksumCalculation` is set to `WHEN_REQUIRED` because **a signed URL
 * must not assert a checksum for bytes the server never saw**. The SDK's
 * default, `WHEN_SUPPORTED`, computes a checksum at signing time, when the only
 * body in hand is the empty one, and bakes `x-amz-checksum-crc32=AAAAAA==` (the
 * CRC32 of nothing) into every presigned PUT and every multipart part URL. The
 * browser then uploads megabytes at a URL whose checksum describes none of
 * them. `WHEN_REQUIRED` leaves the checksum to the operations that genuinely
 * require one, such as `DeleteObjects`.
 *
 * @param config Bucket coordinates and credentials.
 * @returns A client exposing only the operations Memory Shoebox needs.
 * @throws If `config.keyPrefix` is not a valid key prefix.
 */
export function createB2Client(config: Readonly<B2Config>): B2Client {
  if (!KEY_PREFIX_PATTERN.test(config.keyPrefix)) {
    throw new Error(
      `Invalid B2 key prefix ${JSON.stringify(config.keyPrefix)}: it must be one or more lowercase path segments with no slash at either end, because an empty or malformed prefix could write at the bucket's root`,
    );
  }
  const s3 = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.keyId,
      secretAccessKey: config.applicationKey,
    },
    forcePathStyle: true,
    // See the docstring: a signed URL must not assert a checksum for bytes
    // the server never saw.
    requestChecksumCalculation: "WHEN_REQUIRED",
  });
  const handle: BucketHandle = { s3, bucket: config.bucket };
  const { keyPrefix } = config;

  const context = { config, s3, handle, keyPrefix };
  return {
    ..._makeReadOperations(context),
    ..._makeWriteOperations(context),
    ..._makeMultipartOperations(context),
    ..._makeCorsOperations(context),
  };
}

// Binds B2 read operations to this client context.
function _makeReadOperations(
  context: Readonly<B2OperationContext>,
): Pick<B2Client, "listObjects" | "headObject" | "presignGet"> {
  return {
    listObjects: (options) => {
      return listBucketObjects({ context, options });
    },
    presignGet: (options) => {
      return makePresignedGetUrlFromObject({ context, options });
    },
    headObject: (options) => {
      return headBucketObject({ context, options });
    },
  };
}

// Binds B2 write operations to this client context.
function _makeWriteOperations(
  context: Readonly<B2OperationContext>,
): Pick<B2Client, "presignPut" | "putObject" | "deleteObject"> {
  return {
    presignPut: (options) => {
      return makePresignedPutUrlFromObject({ context, options });
    },
    deleteObject: (options) => {
      return deleteBucketObject({ context, options });
    },
    putObject: (options) => {
      return putBucketObject({ context, options });
    },
  };
}

// Binds B2 multipart operations to this client context.
function _makeMultipartOperations(
  context: Readonly<B2OperationContext>,
): Pick<
  B2Client,
  "presignMultipart" | "signParts" | "completeMultipart" | "abortMultipart"
> {
  return {
    presignMultipart: (options) => {
      return startMultipartUpload({ context, options });
    },
    completeMultipart: (options) => {
      return completeMultipartUpload({ context, options });
    },
    abortMultipart: (options) => {
      return abortMultipartUpload({ context, options });
    },
    signParts: (options) => {
      return signMultipartParts({ context, options });
    },
  };
}

// Bind the getBucketCors, putBucketCors operations to this client context.
function _makeCorsOperations(
  context: Readonly<B2OperationContext>,
): Pick<B2Client, "getBucketCors" | "putBucketCors"> {
  return {
    getBucketCors: () => {
      return getBucketCorsForClient({ context });
    },
    putBucketCors: (options) => {
      return putBucketCorsForClient({ context, options });
    },
  };
}
