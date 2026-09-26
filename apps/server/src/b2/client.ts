import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type ListObjectsV2CommandOutput,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { B2Config } from "../config.ts";

/** One object listed from the bucket. */
export type B2Object = {
  key: string;
  sizeBytes: number;
  uploadedAt: string;
};

/** The Backblaze operations the rest of the server is allowed to use. */
export type B2Client = {
  listObjects: (options?: { prefix?: string }) => AsyncGenerator<B2Object>;
  presignGetUrl: (options: {
    key: string;
    expiresInSeconds?: number;
  }) => Promise<string>;
  putObject: (options: {
    key: string;
    body: Uint8Array;
    contentType: string;
  }) => Promise<void>;
};

/** Seven days, the maximum lifetime an S3 presigned URL may be given. */
const MAX_PRESIGNED_URL_SECONDS = 604800;

/**
 * Creates a thin client over Backblaze B2's S3-compatible API.
 *
 * Memory Shoebox keeps media bytes in B2 and only metadata in SQLite. The browser
 * fetches photos and videos straight from B2 through presigned URLs, so large
 * files never pass through the server and never count against its bandwidth.
 *
 * Presigned URLs are signed for their maximum lifetime and carry a matching
 * `Cache-Control`, so the browser can reuse a cached copy for the same period
 * instead of re-fetching bytes that never change. The tradeoff is that a
 * presigned URL is a bearer link for as long as it lives: anyone holding one
 * can fetch that object without a session.
 *
 * @param config Bucket coordinates and credentials.
 * @returns A client exposing only the operations Memory Shoebox needs.
 */
export function createB2Client(config: Readonly<B2Config>): B2Client {
  const s3 = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.keyId,
      secretAccessKey: config.applicationKey,
    },
    forcePathStyle: true,
  });

  return {
    /** Yields every object in the bucket, following pagination. */
    listObjects: async function* (options = {}) {
      // A loop is unavoidable here: the S3 list API is cursor-paginated and
      // each page's token is only known once the previous page returns.
      let continuationToken: string | undefined = undefined;
      do {
        // Annotated because `page` feeds the token that produced it, and
        // TypeScript cannot infer a type through that cycle.
        const page: ListObjectsV2CommandOutput = await s3.send(
          new ListObjectsV2Command({
            Bucket: config.bucket,
            Prefix: options.prefix,
            ContinuationToken: continuationToken,
          }),
        );
        const contents = page.Contents ?? [];
        for (const object of contents) {
          if (object.Key === undefined) {
            continue;
          }
          yield {
            key: object.Key,
            sizeBytes: object.Size ?? 0,
            uploadedAt: (object.LastModified ?? new Date()).toISOString(),
          };
        }
        continuationToken =
          page.IsTruncated === true ? page.NextContinuationToken : undefined;
      } while (continuationToken !== undefined);
    },

    /**
     * Returns a presigned URL the browser can use to fetch one object.
     *
     * @param options.key The object key.
     * @param options.expiresInSeconds Lifetime of the URL. Defaults to the
     *   seven-day maximum so browser caching stays effective.
     */
    presignGetUrl: ({ key, expiresInSeconds = MAX_PRESIGNED_URL_SECONDS }) => {
      return getSignedUrl(
        s3,
        new GetObjectCommand({
          Bucket: config.bucket,
          Key: key,
          ResponseCacheControl: `private, max-age=${MAX_PRESIGNED_URL_SECONDS}`,
        }),
        { expiresIn: expiresInSeconds },
      );
    },

    /** Uploads one object, used for derived files such as thumbnails. */
    putObject: async ({ key, body, contentType }) => {
      await s3.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          CacheControl: `private, max-age=${MAX_PRESIGNED_URL_SECONDS}`,
        }),
      );
    },
  };
}
