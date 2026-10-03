import { answerMediaWorkerRequest } from "@/upload/mediaWorker/answerMediaWorkerRequest";
import type { MediaWorkerRequest } from "@/upload/mediaWorker/mediaWorkerProtocol";

/*
 * The media worker's entry point, loaded by `createUploadEngine` as
 * `new Worker(new URL(...), { type: "module" })`.
 *
 * Everything it does is in `answerMediaWorkerRequest`, which runs in a test
 * without a worker; this file only connects it to the message port. Typed
 * against the DOM library, as the rest of `apps/web` is: `self.postMessage`
 * and `self.addEventListener("message")` have the same shape on a
 * `DedicatedWorkerGlobalScope`, and adding the `WebWorker` library beside
 * `DOM` would declare half of both twice.
 */
self.addEventListener("message", (event: MessageEvent<MediaWorkerRequest>) => {
  void answerMediaWorkerRequest(event.data).then((response) => {
    self.postMessage(response);
  });
});
