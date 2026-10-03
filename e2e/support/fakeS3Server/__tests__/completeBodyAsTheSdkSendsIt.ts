import { createFakeS3Server } from "../../createFakeS3Server/createFakeS3Server.ts";

/** Inputs for _putPart. */
export type PutPartOptions = {
  key: string;
  uploadId: string;
  partNumber: number;
  body: Uint8Array<ArrayBuffer>;
};

/**
 * Bucket name used by the fake-S3 fixtures.
 */
export const BUCKET = "memory-shoebox-media";

/** What the server's own client files every key under: see `B2Config`. */
export const KEY_PREFIX = "test";

/**
 * Allowed browser origin used by the fake-S3 fixtures.
 */
export const PAGE_ORIGIN = "http://localhost:8099";

/**
 * Number of bytes in one mebibyte.
 */
export const MIB = 1024 * 1024;

/** One part as a completion lists it. */
export type PartListing = { partNumber: number; etag: string };

/**
 * Fake S3 server shared by this suite and closed during teardown.
 */
export const server = createFakeS3Server({
  bucketName: BUCKET,
  allowedOrigins: [PAGE_ORIGIN],
});

/**
 * The body `@aws-sdk/client-s3` sends for `CompleteMultipartUpload`, byte for
 * byte: captured from the SDK the server uses, against a logging server. ETag
 * comes before PartNumber, and its quotes are `&quot;` entities.
 */
export function completeBodyAsTheSdkSendsIt(
  parts: readonly PartListing[],
): string {
  const partXml = parts
    .map((part) => {
      const etag = part.etag.replaceAll('"', "&quot;");
      return `<Part><ETag>${etag}</ETag><PartNumber>${part.partNumber}</PartNumber></Part>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><CompleteMultipartUpload xmlns="http://s3.amazonaws.com/doc/2006-03-01/">${partXml}</CompleteMultipartUpload>`;
}
