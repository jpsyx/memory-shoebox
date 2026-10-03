import {
  SESSION_ID,
  FILE_ID,
  makeSinglePresignFromOverrides,
  makeMultipartPresignFromOverrides,
  makeUploadTransportFromAnswers,
  makeUploadApiFromAnswers,
  makeInstantRetryPolicyFromAttempts,
  getSleptMsFromRetryPolicy,
  makeTransferOptionsFromOverrides,
} from "./transferUploadFileTestHelpers";

import { describe, expect, it } from "vitest";
import { appConfig } from "../../../../../../app.config";
import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";

import { transferUploadFile } from "@/upload/transferUploadFile/transferUploadFile";

import { UploadNetworkError } from "@/upload/transferUploadFile/uploadTransportHelpers/uploadTransportHelpers";

describe("transferUploadFile", () => {
  it("fails the file when a re-presign names a different multipart upload", async () => {
    const api = makeUploadApiFromAnswers([
      makeMultipartPresignFromOverrides({
        partNumbers: [1, 2, 3],
        prefix: "old",
      }),
      makeMultipartPresignFromOverrides({
        partNumbers: [2],
        prefix: "new",
        uploadId: "upload-2",
      }),
    ]);
    const transport = makeUploadTransportFromAnswers([
      { status: 200, etag: '"e1"' },
      { status: 403, etag: undefined },
    ]);

    const outcome = await transferUploadFile(
      makeTransferOptionsFromOverrides({ api, transport }),
    );

    expect(outcome).toMatchObject({
      outcome: "failed",
      problemCode: "storage_rejected",
    });
    expect(outcome.outcome === "failed" ? outcome.detail : "").toContain(
      "different multipart upload",
    );
    expect(transport.calls).toHaveLength(2);
  });

  it("fails the file naming CORS when a part's ETag cannot be read", async () => {
    const api = makeUploadApiFromAnswers([
      makeMultipartPresignFromOverrides({
        partNumbers: [1, 2, 3],
        prefix: "part",
      }),
    ]);
    const transport = makeUploadTransportFromAnswers([
      { status: 200, etag: undefined },
    ]);

    const outcome = await transferUploadFile(
      makeTransferOptionsFromOverrides({ api, transport }),
    );

    expect(outcome).toMatchObject({
      outcome: "failed",
      problemCode: "storage_rejected",
    });
    expect(outcome.outcome === "failed" ? outcome.detail : "").toContain(
      "CORS",
    );
    expect(api.completeUploadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          outcome: "failed",
          problemCode: "storage_rejected",
        }),
      }),
    );
  });

  it("treats a blank ETag as unreadable, since complete refuses one", async () => {
    const api = makeUploadApiFromAnswers([
      makeMultipartPresignFromOverrides({
        partNumbers: [1, 2, 3],
        prefix: "part",
      }),
    ]);
    const transport = makeUploadTransportFromAnswers([
      { status: 200, etag: "  " },
    ]);

    const outcome = await transferUploadFile(
      makeTransferOptionsFromOverrides({ api, transport }),
    );

    expect(outcome).toMatchObject({
      outcome: "failed",
      problemCode: "storage_rejected",
    });
    expect(transport.calls).toHaveLength(1);
  });

  it("sends the width and the height together, or neither", async () => {
    const api = makeUploadApiFromAnswers([
      makeSinglePresignFromOverrides("https://b2/original"),
    ]);

    await transferUploadFile(
      makeTransferOptionsFromOverrides({
        api,
        transport: makeUploadTransportFromAnswers([]),
        size: undefined,
      }),
    );

    const body = api.completeUploadFile.mock.calls[0]?.[0].body;
    expect(body).toMatchObject({ width: null, height: null });
  });

  it("tries complete again on a 503, after the backoff", async () => {
    const api = makeUploadApiFromAnswers([
      makeSinglePresignFromOverrides("https://b2/original"),
    ]);
    api.completeUploadFile.mockRejectedValueOnce(
      new ApiRequestError({
        status: 503,
        code: "upload_storage_unavailable",
        message: "Backblaze is down.",
      }),
    );
    const retry = makeInstantRetryPolicyFromAttempts();

    const outcome = await transferUploadFile(
      makeTransferOptionsFromOverrides({
        api,
        transport: makeUploadTransportFromAnswers([]),
        retry,
      }),
    );

    expect(outcome.outcome).toBe("done");
    expect(api.completeUploadFile).toHaveBeenCalledTimes(2);
    expect(retry.sleep).toHaveBeenCalledWith({
      delayMs: 1000,
      signal: expect.any(AbortSignal),
    });
  });

  it("tries a PUT again after Backblaze's own 503", async () => {
    const api = makeUploadApiFromAnswers([
      makeSinglePresignFromOverrides("https://b2/original"),
    ]);
    const transport = makeUploadTransportFromAnswers([
      { status: 503, etag: undefined },
      { status: 200, etag: undefined },
    ]);

    const outcome = await transferUploadFile(
      makeTransferOptionsFromOverrides({ api, transport }),
    );

    expect(outcome.outcome).toBe("done");
    expect(transport.calls).toHaveLength(2);
  });

  it("gives up after the last try, and completes the file as failed", async () => {
    const api = makeUploadApiFromAnswers([
      makeSinglePresignFromOverrides("https://b2/original"),
    ]);
    const lost = new UploadNetworkError("The PUT to storage got no answer");
    const transport = makeUploadTransportFromAnswers([lost, lost, lost]);
    const retry = makeInstantRetryPolicyFromAttempts(3);

    const outcome = await transferUploadFile(
      makeTransferOptionsFromOverrides({ api, transport, retry }),
    );

    expect(transport.calls).toHaveLength(3);
    expect(getSleptMsFromRetryPolicy(retry)).toEqual([1000, 2000]);
    expect(outcome).toMatchObject({
      outcome: "failed",
      problemCode: "connection_lost",
      response: { file: { state: "failed" } },
    });
    expect(api.completeUploadFile).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      fileId: FILE_ID,
      body: {
        outcome: "failed",
        problemCode: "connection_lost",
        problemDetail: "UploadNetworkError: The PUT to storage got no answer",
      },
    });
  });

  it("drops a derivative that will not land, and still completes the file", async () => {
    const api = makeUploadApiFromAnswers([
      makeSinglePresignFromOverrides("https://b2/original"),
      makeSinglePresignFromOverrides("https://b2/thumb"),
    ]);
    const transport = makeUploadTransportFromAnswers([
      { status: 200, etag: undefined },
      { status: 400, etag: undefined },
    ]);

    const outcome = await transferUploadFile(
      makeTransferOptionsFromOverrides({
        api,
        transport,
        derivatives: [
          {
            purpose: "thumb",
            blob: new Blob([new Uint8Array(2)]),
            width: 270,
            height: 480,
          },
        ],
      }),
    );

    expect(outcome.outcome).toBe("done");
    expect(api.completeUploadFile.mock.calls[0]?.[0].body.renditions).toEqual(
      [],
    );
  });

  it("drops a derivative over the server's cap without presigning it", async () => {
    const api = makeUploadApiFromAnswers([
      makeSinglePresignFromOverrides("https://b2/original"),
      makeSinglePresignFromOverrides("https://b2/thumb"),
    ]);
    const transport = makeUploadTransportFromAnswers([]);
    const oversized = new Blob([
      new Uint8Array(appConfig.upload.derivatives.maxBytes + 1),
    ]);

    const outcome = await transferUploadFile(
      makeTransferOptionsFromOverrides({
        api,
        transport,
        derivatives: [
          { purpose: "display", blob: oversized, width: 2048, height: 1536 },
          {
            purpose: "thumb",
            blob: new Blob([new Uint8Array(2)]),
            width: 480,
            height: 360,
          },
        ],
      }),
    );

    expect(outcome.outcome).toBe("done");
    expect(
      api.presignUploadFile.mock.calls.map(([call]) => {
        return call.body.purpose;
      }),
    ).toEqual(["original", "thumb"]);
    expect(api.completeUploadFile.mock.calls[0]?.[0].body.renditions).toEqual([
      { purpose: "thumb", byteSize: 2, width: 480, height: 360 },
    ]);
  });

  it("skips a file presign cancelled as a duplicate, and completes nothing", async () => {
    const api = makeUploadApiFromAnswers([
      new ApiRequestError({
        status: 409,
        code: "upload_file_conflict",
        message: "These bytes are already in this batch.",
        details: {
          fileId: "018f0000-0000-7000-8000-00000000f002",
          state: "cancelled",
        },
      }),
    ]);
    const transport = makeUploadTransportFromAnswers([]);

    const outcome = await transferUploadFile(
      makeTransferOptionsFromOverrides({ api, transport }),
    );

    expect(outcome).toEqual({
      outcome: "skipped",
      reason: "duplicate",
      holderFileId: "018f0000-0000-7000-8000-00000000f002",
    });
    expect(transport.calls).toHaveLength(0);
    expect(api.completeUploadFile).not.toHaveBeenCalled();
  });

  it("reports the batch closed when it was closed under the file", async () => {
    const api = makeUploadApiFromAnswers([
      new ApiRequestError({
        status: 409,
        code: "upload_file_conflict",
        message: "This file is cancelled.",
        details: { state: "cancelled" },
      }),
    ]);

    const outcome = await transferUploadFile(
      makeTransferOptionsFromOverrides({
        api,
        transport: makeUploadTransportFromAnswers([]),
      }),
    );

    expect(outcome).toEqual({ outcome: "batch-closed" });
    expect(api.completeUploadFile).not.toHaveBeenCalled();
  });
});
