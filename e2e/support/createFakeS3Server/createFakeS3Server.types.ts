import { type IncomingMessage, type ServerResponse } from "node:http";

import type { BucketCorsRule } from "../../../apps/server/src/b2/createB2Client/createB2Client.types.ts";

/** Inputs for _sendS3Error. */
export type SendS3ErrorOptions = {
  response: ServerResponse;
  status: number;
  code: string;
  message: string;
};

/**
 * A local stand-in for the bucket, so an end-to-end run needs no Backblaze key
 * and costs no storage.
 *
 * **It answers the handful of S3 calls the upload flow makes and nothing
 * else**, path-style, because the B2 client already sets `forcePathStyle`: a
 * presigned PUT, the four multipart calls, `HEAD`, `GET`, `DELETE`, and the
 * CORS preflight. Anything else is a `501`, so a call the server starts making
 * fails loudly here rather than passing against a fake that guessed.
 *
 * **It checks no signature and reads no `X-Amz-*` parameter.** What it does
 * check is what Backblaze would refuse and a signature cannot see: a part list
 * out of order, an ETag that names no part, a part under 5 MiB that is not the
 * last, and a CORS request the bucket's rule does not allow. Each is a mistake
 * the browser engine could make that only a real bucket would otherwise catch.
 * Its **`501`** covers a query parameter the flow never sends, and a copy.
 *
 * **The CORS rule is the one `pnpm b2:cors` writes**, made by the same function
 * from the allowed origins rather than copied here, so the two cannot drift
 * apart.
 *
 * Everything lives in memory and dies with the process. Playwright starts it as
 * a `webServer` and stops it at the end of the run.
 */

/** The operations the stand-in tells apart. */
export type FakeS3Operation =
  | "Preflight"
  | "PutObject"
  | "CreateMultipartUpload"
  | "UploadPart"
  | "CompleteMultipartUpload"
  | "AbortMultipartUpload"
  | "HeadObject"
  | "GetObject"
  | "DeleteObject"
  | "Unsupported";

/**
 * One request the stand-in answered, as `GET /__fake-s3/requests` lists it.
 *
 * `null` rather than an absent field, because this is JSON on the wire.
 * `status` is the response's, written when the response finishes, so a
 * refused `CompleteMultipartUpload` reads differently from one that joined the
 * parts. It is `null` only for a request still being answered, or one whose
 * client went away before the answer was sent.
 */
export type FakeS3Request = {
  operation: FakeS3Operation;
  method: string;
  key: string;
  partNumber: number | null;
  uploadId: string | null;
  contentType: string | null;
  byteLength: number;
  origin: string | null;
  status: number | null;
};

/**
 * Object bytes and metadata retained by the fake S3 server.
 */
export type StoredObject = {
  body: Buffer;
  contentType: string;
  etag: string;
  lastModified: string;
};

/**
 * One multipart part and the ETag returned for its bytes.
 */
export type StoredPart = { body: Buffer; etag: string };

/**
 * An open multipart upload and its stored parts.
 */
export type OpenUpload = {
  key: string;
  contentType: string;
  parts: Map<number, StoredPart>;
};

/**
 * Mutable bucket, object and multipart state owned by the fake S3 server.
 */
export type FakeS3State = {
  bucketName: string;
  corsRule: BucketCorsRule;
  objects: Map<string, StoredObject>;
  uploads: Map<string, OpenUpload>;
  requests: FakeS3Request[];
};

/** One request, with everything a handler needs to answer it. */
export type FakeS3Exchange = {
  request: IncomingMessage;
  response: ServerResponse;
  state: FakeS3State;
  key: string;
  query: URLSearchParams;
  body: Buffer;
};

/** One `<Part>` of a `CompleteMultipartUpload` body. */
export type CompletedPart = { partNumber: number; etag: string };
