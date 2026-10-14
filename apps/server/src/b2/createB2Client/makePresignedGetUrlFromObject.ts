import type { SignedMediaLease } from "../../media/mediaDelivery.types.ts";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { makeDownloadDispositionFromFilename } from "./makeDownloadDispositionFromFilename.ts";
import type { B2Client, B2OperationContext } from "./createB2Client.types.ts";
import { makeBucketKeyFromKey } from "./makeBucketKeyFromKey.ts";

/** Shared storage context and GET parameters for low-level signing. */
type GetSigningInput = {
  context: B2OperationContext;
  options: Parameters<B2Client["presignGet"]>[0] & { now?: Date };
};

/** Signs a focused download or maintenance GET against the private bucket. */
export async function makePresignedGetUrlFromObject(
  input: Readonly<GetSigningInput>,
): Promise<string> {
  const lease = await makeSignedMediaLeaseFromObject(input);
  return lease.url;
}

/** Signs a GET and returns the exact second-aligned validity interval. */
export async function makeSignedMediaLeaseFromObject(
  input: Readonly<GetSigningInput>,
): Promise<SignedMediaLease> {
  const { config, s3, keyPrefix } = input.context;
  const {
    key,
    expiresInSeconds = MAX_PRESIGNED_URL_SECONDS,
    downloadFilename,
  } = input.options;

  const signingDate = new Date(
    Math.floor((input.options.now ?? new Date()).getTime() / 1000) * 1000,
  );
  const url = await getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: makeBucketKeyFromKey({ keyPrefix, key }),
      ResponseCacheControl: `private, max-age=${MAX_PRESIGNED_URL_SECONDS}`,
      ...(downloadFilename === undefined
        ? {}
        : {
            ResponseContentDisposition:
              makeDownloadDispositionFromFilename(downloadFilename),
          }),
    }),
    { expiresIn: expiresInSeconds, signingDate },
  );
  return {
    url,
    issuedAt: signingDate.toISOString(),
    expiresAt: new Date(
      signingDate.getTime() + expiresInSeconds * 1000,
    ).toISOString(),
  };
}

/** Seven days, the maximum S3 presign lifetime. */
const MAX_PRESIGNED_URL_SECONDS = 604800;
