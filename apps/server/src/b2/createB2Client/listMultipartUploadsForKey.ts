import {
  ListMultipartUploadsCommand,
  type ListMultipartUploadsCommandOutput,
} from "@aws-sdk/client-s3";
import type { B2OperationContext } from "./createB2Client.types.ts";
import { makeBucketKeyFromKey } from "./makeBucketKeyFromKey.ts";

/** Lists every unfinished upload for exactly one key inside this client's prefix. */
export async function* listMultipartUploadsForKey(
  input: Readonly<{ context: B2OperationContext; key: string }>,
): AsyncGenerator<{ uploadId: string }> {
  const { context } = input;
  const key = makeBucketKeyFromKey({
    keyPrefix: context.keyPrefix,
    key: input.key,
  });
  let keyMarker: string | undefined;
  let uploadIdMarker: string | undefined;
  const markers = new Set<string>();
  do {
    const page: ListMultipartUploadsCommandOutput = await context.s3.send(
      new ListMultipartUploadsCommand({
        Bucket: context.config.bucket,
        Prefix: key,
        KeyMarker: keyMarker,
        UploadIdMarker: uploadIdMarker,
        MaxUploads: 1000,
      }),
    );
    for (const upload of page.Uploads ?? []) {
      if (upload.Key === key && upload.UploadId !== undefined) {
        yield { uploadId: upload.UploadId };
      }
    }
    if (page.IsTruncated !== true) {
      return;
    }
    keyMarker = page.NextKeyMarker;
    uploadIdMarker = page.NextUploadIdMarker;
    const marker = JSON.stringify([keyMarker, uploadIdMarker]);
    if (
      keyMarker === undefined ||
      uploadIdMarker === undefined ||
      markers.has(marker)
    ) {
      throw new Error("processing_multipart_listing_invalid");
    }
    markers.add(marker);
  } while (true);
}
