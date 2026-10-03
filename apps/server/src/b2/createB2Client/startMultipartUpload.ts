import {
  CreateMultipartUploadCommand,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { appConfig } from "../../../../../app.config.ts";

import type { B2Client, B2OperationContext } from "./createB2Client.types.ts";
import { makeBucketKeyFromKey } from "./makeBucketKeyFromKey.ts";

/** presignMultipart against the configured bucket and key prefix. */
export async function startMultipartUpload(
  input: Readonly<{
    context: B2OperationContext;
    options: Parameters<B2Client["presignMultipart"]>[0];
  }>,
): ReturnType<B2Client["presignMultipart"]> {
  const { config, s3, keyPrefix } = input.context;
  const {
    key,
    contentType,
    partCount,
    expiresInSeconds = appConfig.upload.presignTtlSeconds,
  } = input.options;

  const created = await s3.send(
    new CreateMultipartUploadCommand({
      Bucket: config.bucket,
      Key: makeBucketKeyFromKey({ keyPrefix, key }),
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
          Key: makeBucketKeyFromKey({ keyPrefix, key }),
          UploadId: uploadId,
          PartNumber: index + 1,
        }),
        { expiresIn: expiresInSeconds },
      );
    }),
  );

  return { uploadId, partUrls };
}
