import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { createUploadEngine } from "../createUploadEngine";
import { makeSha256HexFromBlob } from "../../makeSha256HexFromBlob/makeSha256HexFromBlob";
import {
  SESSION_ID,
  makeUploadApiFromScenario,
  makeUploadEngineFilesFromPhotoCount,
  makeWorkerFactoryFromAnswer,
} from "./createUploadEngineTestHelpers";

it("preserves original photo bytes while sending reencoded derivatives separately", async () => {
  const [picked] = makeUploadEngineFilesFromPhotoCount({ count: 1 });
  const originalBytes = await picked!.file.arrayBuffer();
  const expectedHash = createHash("sha256")
    .update(new Uint8Array(originalBytes))
    .digest("hex");
  const derivative = new Blob(["smaller reencoded pixels"], {
    type: "image/jpeg",
  });
  const uploads = new Map<string, Blob>();
  const api = makeUploadApiFromScenario({ fileCount: 1 });
  const engine = createUploadEngine({
    sessionId: SESSION_ID,
    api,
    onEvent: () => {},
    createMediaWorker: makeWorkerFactoryFromAnswer(async (request) => {
      return request.kind === "hash"
        ? {
            kind: "hashed",
            requestId: request.requestId,
            contentHash: await makeSha256HexFromBlob(request.file),
          }
        : {
            kind: "image-derivatives-made",
            requestId: request.requestId,
            usedWasmDecoder: false,
            originalSize: request.size,
            derivatives: [
              {
                purpose: "display",
                blob: derivative,
                width: 1024,
                height: 768,
              },
            ],
          };
    }).createMediaWorker,
    transport: {
      putBytes: async ({ url, body }) => {
        uploads.set(url.split("/").at(-1)!, body);
        return { status: 200, etag: undefined };
      },
    },
  });
  await engine.start([picked!]);
  expect(uploads.get("original")).toBe(picked!.file);
  expect(await uploads.get("original")!.arrayBuffer()).toEqual(originalBytes);
  expect(await makeSha256HexFromBlob(uploads.get("original")!)).toBe(
    expectedHash,
  );
  expect(uploads.get("display")).toBe(derivative);
  expect(api.completeUploadFile.mock.calls[0]?.[0].body).toMatchObject({
    outcome: "done",
    contentHash: expectedHash,
    byteSize: originalBytes.byteLength,
    width: 4032,
    height: 3024,
  });
});
