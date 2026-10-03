import type {
  MediaWorkerRequest,
  MediaWorkerResponse,
} from "@/upload/mediaWorker/mediaWorkerProtocol.types";

import { getDetailFromError } from "./getDetailFromError";

import { answer } from "./answer";

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
    return await answer(request);
  } catch (error: unknown) {
    return {
      kind: "failed",
      requestId: request.requestId,
      detail: getDetailFromError(error),
    };
  }
}
