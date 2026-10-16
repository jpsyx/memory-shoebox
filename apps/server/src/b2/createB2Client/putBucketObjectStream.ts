import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  type CompletedPart,
} from "@aws-sdk/client-s3";
import type { B2Client, B2OperationContext } from "./createB2Client.types.ts";
import { makeBucketKeyFromKey } from "./makeBucketKeyFromKey.ts";

const PART_BYTES = 8 * 1024 ** 2;
const MAX_OUTPUT_BYTES = 512 * 1024 ** 2;

type StreamUpload = {
  s3: S3Client;
  bucket: string;
  key: string;
  uploadId: string;
  options: Parameters<B2Client["putObjectStream"]>[0];
};

async function* _getPartsFromBody(
  options: Readonly<Parameters<B2Client["putObjectStream"]>[0]>,
): AsyncGenerator<Uint8Array> {
  const buffer = Buffer.allocUnsafe(Math.min(PART_BYTES, options.byteSize));
  let bufferedBytes = 0;
  let totalBytes = 0;
  for await (const chunk of options.body) {
    options.signal.throwIfAborted();
    totalBytes += chunk.byteLength;
    if (totalBytes > options.byteSize) {
      throw new Error("processing_output_size_mismatch");
    }
    for (let offset = 0; offset < chunk.byteLength; ) {
      const length = Math.min(
        buffer.length - bufferedBytes,
        chunk.byteLength - offset,
      );
      buffer.set(chunk.subarray(offset, offset + length), bufferedBytes);
      bufferedBytes += length;
      offset += length;
      if (bufferedBytes === buffer.length) {
        yield buffer;
        bufferedBytes = 0;
      }
    }
  }
  if (totalBytes !== options.byteSize) {
    throw new Error("processing_output_size_mismatch");
  }
  if (bufferedBytes > 0) {
    yield buffer.subarray(0, bufferedBytes);
  }
}

async function _uploadParts(
  upload: Readonly<StreamUpload>,
): Promise<CompletedPart[]> {
  const parts: CompletedPart[] = [];
  for await (const body of _getPartsFromBody(upload.options)) {
    const partNumber = parts.length + 1;
    const response = await upload.s3.send(
      new UploadPartCommand({
        Bucket: upload.bucket,
        Key: upload.key,
        UploadId: upload.uploadId,
        PartNumber: partNumber,
        Body: body,
        ContentLength: body.byteLength,
      }),
      { abortSignal: upload.options.signal },
    );
    if (response.ETag === undefined) {
      throw new Error("processing_output_part_missing");
    }
    parts.push({ PartNumber: partNumber, ETag: response.ETag });
  }
  return parts;
}

async function _putStream(
  upload: Omit<StreamUpload, "uploadId">,
): Promise<void> {
  const { s3, bucket, key, options } = upload;
  const created = await s3.send(
    new CreateMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      ContentType: options.contentType,
    }),
    { abortSignal: options.signal },
  );
  if (created.UploadId === undefined) {
    throw new Error("processing_output_upload_missing");
  }
  const uploadId = created.UploadId;
  try {
    await options.onMultipartStarted(uploadId);
    options.signal.throwIfAborted();
    const parts = await _uploadParts({ ...upload, uploadId });
    options.signal.throwIfAborted();
    await s3.send(
      new CompleteMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: { Parts: parts },
      }),
      { abortSignal: options.signal },
    );
  } catch (error) {
    // Cancellation must not suppress abort. Durable ownership covers abort
    // failure.
    await s3
      .send(
        new AbortMultipartUploadCommand({
          Bucket: bucket,
          Key: key,
          UploadId: uploadId,
        }),
      )
      .catch(() => {});
    throw error;
  }
}

/**
 * Streams one bounded output, recording the upload ID before a single part is
 * sent.
 */
export async function putBucketObjectStream(
  options: Readonly<{
    context: B2OperationContext;
    options: Parameters<B2Client["putObjectStream"]>[0];
  }>,
): Promise<void> {
  const { options: uploadOptions, context } = options;
  uploadOptions.signal.throwIfAborted();
  if (
    !Number.isSafeInteger(uploadOptions.byteSize) ||
    uploadOptions.byteSize <= 0 ||
    uploadOptions.byteSize > MAX_OUTPUT_BYTES
  ) {
    throw new Error("processing_output_size_invalid");
  }
  const { config } = context;
  // A lost initiation response must not cause an invisible second initiation.
  const s3 = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.keyId,
      secretAccessKey: config.applicationKey,
    },
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    maxAttempts: 1,
  });
  try {
    await _putStream({
      s3,
      bucket: config.bucket,
      key: makeBucketKeyFromKey({
        keyPrefix: context.keyPrefix,
        key: uploadOptions.key,
      }),
      options: uploadOptions,
    });
  } finally {
    s3.destroy();
  }
}
