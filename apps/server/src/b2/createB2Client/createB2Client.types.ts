import type { S3Client } from "@aws-sdk/client-s3";
import type { B2Config } from "../../configHelpers.ts";

/** Inputs for _signParts. */
export type SignPartsOptions2 = {
  handle: BucketHandle;
  key: string;
  uploadId: string;
  partNumbers: number[];
  expiresInSeconds: number;
};

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
  /** Defaults to `appConfig.upload.presignTtlSeconds`. */
  expiresInSeconds?: number;
};

/** What `headObject` reads off a stored object without fetching it. */
export type HeadObjectResult = {
  sizeBytes: number;
  /** The type Backblaze stored, which the presigned PUT signed. */
  contentType: string | undefined;
};

/** One freshly signed part URL of a multipart upload that is already open. */
export type SignedPart = {
  partNumber: number;
  url: string;
};

/**
 * One CORS rule on the bucket, in this codebase's spelling of S3's
 * `CORSRule`.
 *
 * The bucket needs one because the browser PUTs to Backblaze's origin, which
 * is not the app's, and **`exposeHeaders` must carry `ETag`**: without it the
 * browser cannot read a part's ETag and a multipart upload cannot complete.
 */
export type BucketCorsRule = {
  allowedOrigins: string[];
  allowedMethods: string[];
  allowedHeaders: string[];
  exposeHeaders: string[];
  maxAgeSeconds: number;
};

/**
 * What re-signing chosen parts of an open multipart upload needs to know.
 *
 * Named for the same reason `PresignMultipartOptions` is: it reaches four
 * properties, and `presign` composes it from a stored row.
 */
export type SignPartsOptions = {
  /** The object key the upload was opened at. */
  key: string;
  /** `upload_files.multipart_upload_id`, kept across every re-presign. */
  uploadId: string;
  /** Only the parts still wanted, 1-based. */
  partNumbers: number[];
  /** Defaults to `appConfig.upload.presignTtlSeconds`. */
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
  /**
   * The size and type of one stored object, or `undefined` when there is none.
   *
   * What `complete` verifies a single PUT and every derivative with. A
   * control-plane call: it moves no bytes.
   */
  headObject: (
    options: Readonly<{ key: string }>,
  ) => Promise<HeadObjectResult | undefined>;
  /**
   * Fresh URLs for chosen parts of a multipart upload that is already open.
   *
   * `presignMultipart` always opens a new upload, and a re-presign must keep
   * the one it has (`upload.md` § When a presigned URL expires), so an
   * expiry costs one part rather than the whole file. Local HMAC work only.
   */
  signParts: (
    options: Readonly<Omit<SignPartsOptions, "partNumbers">> &
      Readonly<{
        partNumbers: readonly number[];
      }>,
  ) => Promise<SignedPart[]>;
  /** The bucket's CORS rules, or none. Used by `pnpm b2:cors` only. */
  getBucketCors: () => Promise<BucketCorsRule[]>;
  /** Replaces the bucket's CORS rules. Used by `pnpm b2:cors` only. */
  putBucketCors: (
    options: Readonly<{
      rules: readonly BucketCorsRule[];
    }>,
  ) => Promise<void>;
};

/** The SDK client and the one bucket every operation addresses. */
export type BucketHandle = {
  s3: S3Client;
  bucket: string;
};

/** Shared SDK client and bucket coordinates for every operation. */
export type B2OperationContext = {
  config: B2Config;
  s3: S3Client;
  handle: BucketHandle;
  keyPrefix: string;
};
