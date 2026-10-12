import { makeVisualFingerprintFromFile } from "@/upload/makeVisualFingerprintFromFile/makeVisualFingerprintFromFile";
import { makeImageDerivativesFromFile } from "@/upload/makeImageDerivativesFromFile/makeImageDerivativesFromFile";

import { makeSha256HexFromBlob } from "@/upload/makeSha256HexFromBlob/makeSha256HexFromBlob";

import type {
  MediaWorkerRequest,
  MediaWorkerResponse,
} from "@/upload/mediaWorker/mediaWorkerProtocol.types";

/** The answer to one request, which may throw. */
export async function answer(
  request: Readonly<MediaWorkerRequest>,
): Promise<MediaWorkerResponse> {
  if (request.kind === "hash") {
    return {
      kind: "hashed",
      requestId: request.requestId,
      contentHash: await makeSha256HexFromBlob(request.file),
    };
  }
  if (request.kind === "fingerprint") {
    return {
      kind: "fingerprinted",
      requestId: request.requestId,
      ...(await makeVisualFingerprintFromFile(request)),
    };
  }
  const made = await makeImageDerivativesFromFile(request);
  return {
    kind: "image-derivatives-made",
    requestId: request.requestId,
    ...made,
  };
}
