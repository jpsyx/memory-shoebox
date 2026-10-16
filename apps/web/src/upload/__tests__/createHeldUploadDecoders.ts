import {
  makeWorkerAnswerFromRequest,
  makeWorkerFactoryFromAnswer,
} from "@/upload/createUploadEngine/__tests__/createUploadEngineTestHelpers";
import type { MediaWorkerRequest } from "@/upload/mediaWorker/mediaWorkerProtocol.types";

type HeldUploadDecoders = {
  factory: ReturnType<typeof makeWorkerFactoryFromAnswer>;
  previewGate: PromiseWithResolvers<void>;
  fingerprintGate: PromiseWithResolvers<void>;
  decodeKinds: Array<MediaWorkerRequest["kind"]>;
};

/** Holds actual decode answers while hashes continue through their own lane. */
export function createHeldUploadDecoders(): HeldUploadDecoders {
  const previewGate = Promise.withResolvers<void>();
  const fingerprintGate = Promise.withResolvers<void>();
  const decodeKinds: Array<MediaWorkerRequest["kind"]> = [];
  const factory = makeWorkerFactoryFromAnswer(async (request) => {
    if (request.kind !== "hash") {
      decodeKinds.push(request.kind);
      await (request.kind === "fingerprint"
        ? fingerprintGate.promise
        : previewGate.promise);
    }
    return makeWorkerAnswerFromRequest(request);
  });
  return { factory, previewGate, fingerprintGate, decodeKinds };
}
