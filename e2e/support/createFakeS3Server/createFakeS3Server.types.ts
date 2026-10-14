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
 * Local path-style S3 storage for upload and media-delivery acceptance.
 * It validates ranges, object validators, multipart isolation and bucket CORS.
 * Optional date enforcement checks presigned lifetimes, not cryptography.
 * Everything is ephemeral; the caller owns the server's lifetime.
 */

/** Sanitized response evidence, excluding bearer URLs and query strings. */
export type FakeS3Transfer = {
  objectId: string;
  status: number;
  bodyBytes: number;
};

/** Optional local transport controls; uploads keep their existing behavior. */
export type FakeS3ServerOptions = {
  bucketName: string;
  allowedOrigins: readonly string[];
  /** Shared immutable fixture buffers avoid 5,000 copies of the same image. */
  objects?: ReadonlyMap<string, StoredObject>;
  clock?: () => Date;
  enforceSignatureExpiry?: boolean;
  latencyMs?: number;
  bytesPerSecond?: number;
  onTransfer?: (transfer: FakeS3Transfer) => void;
};

/** The operations the stand-in tells apart. */
export type FakeS3Operation =
  | "Preflight"
  | "PutObject"
  | "CreateMultipartUpload"
  | "ListParts"
  | "ListMultipartUploads"
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
  /** Response payload bytes queued, excluding HTTP headers. */
  bodyBytes: number;
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
  clock: () => Date;
  enforceSignatureExpiry: boolean;
  latencyMs: number;
  bytesPerSecond: number | undefined;
  onTransfer: ((transfer: FakeS3Transfer) => void) | undefined;
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
