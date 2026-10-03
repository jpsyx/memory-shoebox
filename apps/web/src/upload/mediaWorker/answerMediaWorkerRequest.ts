import { makeImageDerivatives } from "@/upload/makeImageDerivatives/makeImageDerivatives";
import { makeSha256HexFromBlob } from "@/upload/makeSha256HexFromBlob/makeSha256HexFromBlob";
import type {
  MediaWorkerRequest,
  MediaWorkerResponse,
} from "@/upload/mediaWorker/mediaWorkerProtocol";

/** A thrown value as one line, for a `failed` response and the admin's eye. */
export function getDetailFromError(error: unknown): string {
  return error instanceof Error
    ? `${error.name}: ${error.message}`
    : String(error);
}

/** The answer to one request, which may throw. */
async function _answer(
  request: Readonly<MediaWorkerRequest>,
): Promise<MediaWorkerResponse> {
  if (request.kind === "hash") {
    return {
      kind: "hashed",
      requestId: request.requestId,
      contentHash: await makeSha256HexFromBlob(request.file),
    };
  }
  const made = await makeImageDerivatives(request);
  return {
    kind: "image-derivatives-made",
    requestId: request.requestId,
    ...made,
  };
}

/**
 * The worker's answer to one request. Never rejects.
 *
 * A file that cannot be read (moved, deleted, or revoked by the picker since
 * it was chosen) answers `failed` with what the browser said, so the engine
 * fails that one file and carries on with the rest. An image that cannot be
 * decoded is not a failure at all: it answers with no derivatives.
 */
export async function answerMediaWorkerRequest(
  request: Readonly<MediaWorkerRequest>,
): Promise<MediaWorkerResponse> {
  try {
    return await _answer(request);
  } catch (error: unknown) {
    return {
      kind: "failed",
      requestId: request.requestId,
      detail: getDetailFromError(error),
    };
  }
}
