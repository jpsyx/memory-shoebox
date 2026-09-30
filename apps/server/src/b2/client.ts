import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
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

/** One part of a multipart upload, as the browser finished it. */
export type UploadedPart = {
  partNumber: number;
  /** The `ETag` header Backblaze returned for that part, verbatim. */
  etag: string;
};

/** A multipart upload that has been opened and signed, part by part. */
export type StartedMultipartUpload = {
  /** Backblaze's own id for the upload, stored on `upload_files`. */
  uploadId: string;
  /** One signed URL per part, in part order. */
  partUrls: string[];
};

/**
 * What opening a multipart upload needs to know.
 *
 * Named rather than inline because it reaches four properties, and because
 * `presignMultipart` is the one signature on this client a later step calls
 * with a value it composed somewhere else.
 */
export type PresignMultipartOptions = {
  /** The object key the finished upload lands at. */
  key: string;
  contentType: string;
  /** How many part URLs to sign, one per part, in part order. */
  partCount: number;
  /** Defaults to `UPLOAD_URL_SECONDS`. */
  expiresInSeconds?: number;
};

/**
 * The Backblaze operations the rest of the server is allowed to use.
 *
 * **Media bytes never pass through the server** (`docs/architecture.md`
 * § Where data lives), which is what confines this interface to signing URLs
 * the browser uses and deleting objects the browser cannot. `putObject` is the
 * one exception and exists for small derived files.
 */
export type B2Client = {
  listObjects: (options?: { prefix?: string }) => AsyncGenerator<B2Object>;
  presignGet: (options: {
    key: string;
    expiresInSeconds?: number;
    /**
     * Turns the signed URL into a download with a sensible name.
     *
     * The one caller is `GET /api/items/:itemId/original`, which redirects to
     * this URL: without it a browser saves the storage key, and the key is a
     * uuid. `ResponseContentDisposition` is part of the signature, so it
     * cannot be added or changed by whoever holds the URL.
     */
    downloadFilename?: string;
  }) => Promise<string>;
  presignPut: (options: {
    key: string;
    contentType: string;
    expiresInSeconds?: number;
  }) => Promise<string>;
  presignMultipart: (
    options: PresignMultipartOptions,
  ) => Promise<StartedMultipartUpload>;
  completeMultipart: (options: {
    key: string;
    uploadId: string;
    parts: readonly UploadedPart[];
  }) => Promise<void>;
  abortMultipart: (options: { key: string; uploadId: string }) => Promise<void>;
  deleteObject: (options: { key: string }) => Promise<void>;
  putObject: (options: {
    key: string;
    body: Uint8Array;
    contentType: string;
  }) => Promise<void>;
};

/** Seven days, the maximum lifetime an S3 presigned URL may be given. */
const MAX_PRESIGNED_URL_SECONDS = 604800;

/**
 * `"`, `\`, and every control character (0x00-0x1F, 0x7F), CR and LF included.
 *
 * A `"` or `\` would escape the quoted string `filename=""` sits inside. A
 * control character is worse than a formatting glitch: this server never
 * emits `Content-Disposition` itself, Backblaze does, when it serves the
 * signed URL this builds. Backblaze decodes `response-content-disposition`
 * off the query string and writes the decoded bytes back as a literal
 * response header, so a raw CR/LF here is a header-splitting primitive
 * against whatever reads that download, not merely against this process.
 */
// The control characters are exactly what this pattern exists to find.
// eslint-disable-next-line no-control-regex
const UNSAFE_FILENAME_CHARACTERS = /["\\\x00-\x1f\x7f]/gu;

/**
 * The four characters RFC 5987's `ext-value` forbids that
 * `encodeURIComponent` leaves unescaped.
 */
const UNENCODED_EXT_VALUE_CHARACTERS = /['()*]/gu;

/**
 * An ASCII fallback for `filename=""`, RFC 6266's plain, unencoded parameter.
 *
 * Some clients still read `filename` as they would have in 1999: literal
 * bytes, no charset. A family member's "Cumpleaños.jpg" cannot survive that
 * unmodified, so the real name travels on `filename*` below and this exists
 * only for a client old enough to ignore it.
 */
function _asciiDownloadFilename(filename: string): string {
  return filename
    .replaceAll(UNSAFE_FILENAME_CHARACTERS, "")
    .replaceAll(/[^\x20-\x7e]/gu, "_");
}

/**
 * Percent-encodes one filename for RFC 5987/8187's `ext-value`, the form
 * `filename*` takes, which is what lets "Cumpleaños.jpg" survive intact for
 * every client that reads it.
 *
 * `encodeURIComponent` already turns `"`, `\`, control characters, and every
 * non-ASCII code point into percent-escapes over their UTF-8 bytes; the only
 * gap is `' ( ) *`, which it leaves raw because they are legal in a URI
 * component even though none of the four is a legal `attr-char`.
 */
function _encodeExtValueFilename(filename: string): string {
  return encodeURIComponent(filename).replaceAll(
    UNENCODED_EXT_VALUE_CHARACTERS,
    (character) => {
      return `%${character.charCodeAt(0).toString(16).toUpperCase()}`;
    },
  );
}

/**
 * Builds a `Content-Disposition` value safe to sign into
 * `ResponseContentDisposition`.
 *
 * Carries both parameters on purpose: `filename` for a client that has never
 * heard of `filename*`, and `filename*` for the name as it was actually
 * typed. A compliant client prefers `filename*` when both are present
 * (RFC 6266 §5), so the ASCII fallback is never what a modern browser shows.
 */
function _downloadDisposition(filename: string): string {
  const asciiFallback = _asciiDownloadFilename(filename);
  const extValue = _encodeExtValueFilename(filename);
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${extValue}`;
}

/**
 * How long an upload URL lives.
 *
 * Far shorter than the seven days a read URL gets: a read URL is a bearer link
 * to bytes that already exist, and a write URL is permission to put new bytes
 * in the bucket. `upload_files.presigned_until` records when one dies, which
 * is also how `upload-abandon-sweep` recognises a stale transfer.
 */
const UPLOAD_URL_SECONDS = 3600;

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
 * `requestChecksumCalculation` is set to `WHEN_REQUIRED` because **a signed
 * URL must not assert a checksum for bytes the server never saw**. The SDK's
 * default, `WHEN_SUPPORTED`, computes a checksum at signing time, when the
 * only body in hand is the empty one, and bakes
 * `x-amz-checksum-crc32=AAAAAA==` (the CRC32 of nothing) into every presigned
 * PUT and every multipart part URL. The browser then uploads megabytes at a
 * URL whose checksum describes none of them. `WHEN_REQUIRED` leaves the
 * checksum to the operations that genuinely require one, such as
 * `DeleteObjects`.
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
    // See the docstring: a signed URL must not assert a checksum for bytes
    // the server never saw.
    requestChecksumCalculation: "WHEN_REQUIRED",
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
     * @param options.downloadFilename See the type's own docstring.
     */
    presignGet: ({
      key,
      expiresInSeconds = MAX_PRESIGNED_URL_SECONDS,
      downloadFilename,
    }) => {
      return getSignedUrl(
        s3,
        new GetObjectCommand({
          Bucket: config.bucket,
          Key: key,
          ResponseCacheControl: `private, max-age=${MAX_PRESIGNED_URL_SECONDS}`,
          ...(downloadFilename === undefined
            ? {}
            : {
                ResponseContentDisposition:
                  _downloadDisposition(downloadFilename),
              }),
        }),
        { expiresIn: expiresInSeconds },
      );
    },

    /**
     * Returns a presigned URL the browser uploads one whole object to.
     *
     * `contentType` is part of the signature, not a hint: `signableHeaders`
     * adds `content-type` to `X-Amz-SignedHeaders`, which the presigner
     * otherwise leaves at `host` alone. Without it a browser holding the URL
     * could PUT under any type it liked and Backblaze would store that type,
     * so the parameter would read as a constraint while enforcing nothing.
     *
     * **The caller that hands this URL to the browser owns the consequence:
     * the PUT must carry exactly this `Content-Type` and nothing else, or
     * Backblaze rejects it as a signature mismatch.** It has to send the
     * browser back the same string the server signed here.
     *
     * @param options.key The object key.
     * @param options.contentType The type the browser must send, verbatim.
     * @param options.expiresInSeconds Lifetime of the URL, one hour by default.
     */
    presignPut: ({
      key,
      contentType,
      expiresInSeconds = UPLOAD_URL_SECONDS,
    }) => {
      return getSignedUrl(
        s3,
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          ContentType: contentType,
        }),
        {
          expiresIn: expiresInSeconds,
          signableHeaders: new Set(["content-type"]),
        },
      );
    },

    /**
     * Opens a multipart upload and signs one URL per part.
     *
     * This is the one place the server talks to Backblaze on the write path,
     * and it still moves no bytes: the browser puts each part straight at the
     * signed URL and reports the `ETag` back.
     */
    presignMultipart: async ({
      key,
      contentType,
      partCount,
      expiresInSeconds = UPLOAD_URL_SECONDS,
    }) => {
      const created = await s3.send(
        new CreateMultipartUploadCommand({
          Bucket: config.bucket,
          Key: key,
          ContentType: contentType,
        }),
      );
      const uploadId = created.UploadId;
      if (uploadId === undefined) {
        throw new Error(`Backblaze opened no multipart upload for ${key}`);
      }

      const partUrls = await Promise.all(
        Array.from({ length: partCount }, (_unused, index) => {
          return getSignedUrl(
            s3,
            new UploadPartCommand({
              Bucket: config.bucket,
              Key: key,
              UploadId: uploadId,
              PartNumber: index + 1,
            }),
            { expiresIn: expiresInSeconds },
          );
        }),
      );

      return { uploadId, partUrls };
    },

    /** Closes a multipart upload once every part has landed. */
    completeMultipart: async ({ key, uploadId, parts }) => {
      await s3.send(
        new CompleteMultipartUploadCommand({
          Bucket: config.bucket,
          Key: key,
          UploadId: uploadId,
          MultipartUpload: {
            Parts: parts.map((part) => {
              return { PartNumber: part.partNumber, ETag: part.etag };
            }),
          },
        }),
      );
    },

    /** Abandons a multipart upload, so Backblaze stops billing for its parts. */
    abortMultipart: async ({ key, uploadId }) => {
      await s3.send(
        new AbortMultipartUploadCommand({
          Bucket: config.bucket,
          Key: key,
          UploadId: uploadId,
        }),
      );
    },

    /**
     * Deletes one object.
     *
     * Driven by `object-deletion-drain` and never called inline, because there
     * is no transaction spanning SQLite and Backblaze: the rows commit first so
     * the photograph genuinely vanishes, and the objects are drained after
     * (`data-models.md` § `pending_object_deletions`).
     */
    deleteObject: async ({ key }) => {
      await s3.send(
        new DeleteObjectCommand({ Bucket: config.bucket, Key: key }),
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
