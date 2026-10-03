import {
  makeSinglePresignFromOverrides,
  makeUploadTransportFromAnswers,
  makeUploadApiFromAnswers,
  makeInstantRetryPolicyFromAttempts,
  getSleptMsFromRetryPolicy,
  makeTransferOptionsFromOverrides,
  getUrlsFromTransport,
} from "./transferUploadFileTestHelpers";

import { describe, expect, it } from "vitest";

import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";

import { transferUploadFile } from "@/upload/transferUploadFile/transferUploadFile";

import { type UploadTransport } from "@/upload/transferUploadFile/uploadTransportHelpers/uploadTransportHelpers";

describe("transferUploadFile", () => {
  it("reports the batch closed when the session itself is gone, from presign or complete", async () => {
    const sessionGone = new ApiRequestError({
      status: 409,
      code: "upload_session_conflict",
      message: "This batch is not taking files.",
    });
    const atPresign = makeUploadApiFromAnswers([sessionGone]);
    const atComplete = makeUploadApiFromAnswers([
      makeSinglePresignFromOverrides("https://b2/original"),
    ]);
    atComplete.completeUploadFile.mockRejectedValue(sessionGone);

    const fromPresign = await transferUploadFile(
      makeTransferOptionsFromOverrides({
        api: atPresign,
        transport: makeUploadTransportFromAnswers([]),
      }),
    );
    const fromComplete = await transferUploadFile(
      makeTransferOptionsFromOverrides({
        api: atComplete,
        transport: makeUploadTransportFromAnswers([]),
      }),
    );

    expect(fromPresign).toEqual({ outcome: "batch-closed" });
    expect(atPresign.completeUploadFile).not.toHaveBeenCalled();
    // Not a checksum mismatch, and no second complete to say it failed.
    expect(fromComplete).toEqual({ outcome: "batch-closed" });
    expect(atComplete.completeUploadFile).toHaveBeenCalledTimes(1);
  });

  it("does not complete again when the server already failed the row", async () => {
    const api = makeUploadApiFromAnswers([
      makeSinglePresignFromOverrides("https://b2/original"),
    ]);
    api.completeUploadFile.mockRejectedValueOnce(
      new ApiRequestError({
        status: 409,
        code: "upload_file_conflict",
        message: "The hash disagrees with what was presigned.",
      }),
    );

    const outcome = await transferUploadFile(
      makeTransferOptionsFromOverrides({
        api,
        transport: makeUploadTransportFromAnswers([]),
      }),
    );

    expect(outcome).toMatchObject({
      outcome: "failed",
      problemCode: "checksum_mismatch",
      response: undefined,
    });
    expect(api.completeUploadFile).toHaveBeenCalledTimes(1);
  });

  it("does not try complete again when the server refused the object", async () => {
    const api = makeUploadApiFromAnswers([
      makeSinglePresignFromOverrides("https://b2/original"),
    ]);
    api.completeUploadFile.mockRejectedValue(
      new ApiRequestError({
        status: 409,
        code: "upload_file_conflict",
        message: "The bucket holds a different object.",
        details: { state: "failed" },
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

    expect(outcome).toMatchObject({
      outcome: "failed",
      problemCode: "content_mismatch",
      response: undefined,
    });
    expect(outcome.outcome === "failed" ? outcome.detail : "").toContain(
      "refused what landed",
    );
    expect(api.completeUploadFile).toHaveBeenCalledTimes(1);
    expect(retry.sleep).not.toHaveBeenCalled();
  });

  it("presigns again when another presign of the file won the race", async () => {
    const lostRace = new ApiRequestError({
      status: 409,
      code: "upload_file_conflict",
      message: "Another presign of this file got there first.",
      details: { state: "sending" },
    });
    const api = makeUploadApiFromAnswers([
      lostRace,
      makeSinglePresignFromOverrides("https://b2/original"),
    ]);
    const transport = makeUploadTransportFromAnswers([]);
    const retry = makeInstantRetryPolicyFromAttempts();

    const outcome = await transferUploadFile(
      makeTransferOptionsFromOverrides({ api, transport, retry }),
    );

    expect(outcome.outcome).toBe("done");
    expect(api.presignUploadFile).toHaveBeenCalledTimes(2);
    expect(retry.sleep).toHaveBeenCalledWith({
      delayMs: 1000,
      signal: expect.any(AbortSignal),
    });
    expect(getUrlsFromTransport(transport)).toEqual(["https://b2/original"]);
  });

  it("gives up on a presign that keeps losing the race", async () => {
    const lostRace = new ApiRequestError({
      status: 409,
      code: "upload_file_conflict",
      message: "Another presign of this file got there first.",
      details: { state: "sending" },
    });
    const api = makeUploadApiFromAnswers([lostRace, lostRace, lostRace]);
    const transport = makeUploadTransportFromAnswers([]);
    const retry = makeInstantRetryPolicyFromAttempts(3);

    const outcome = await transferUploadFile(
      makeTransferOptionsFromOverrides({ api, transport, retry }),
    );

    expect(api.presignUploadFile).toHaveBeenCalledTimes(3);
    expect(getSleptMsFromRetryPolicy(retry)).toEqual([1000, 2000]);
    expect(transport.calls).toHaveLength(0);
    expect(outcome).toMatchObject({ outcome: "failed" });
  });

  it("reports the batch closed when complete finds it closed under the file", async () => {
    const api = makeUploadApiFromAnswers([
      makeSinglePresignFromOverrides("https://b2/original"),
    ]);
    api.completeUploadFile.mockRejectedValue(
      new ApiRequestError({
        status: 409,
        code: "upload_file_conflict",
        message: "This file is cancelled.",
        details: { state: "cancelled" },
      }),
    );

    const outcome = await transferUploadFile(
      makeTransferOptionsFromOverrides({
        api,
        transport: makeUploadTransportFromAnswers([]),
      }),
    );

    expect(outcome).toEqual({ outcome: "batch-closed" });
    expect(api.completeUploadFile).toHaveBeenCalledTimes(1);
  });

  it("tries complete once more when the row moved under its verification", async () => {
    const api = makeUploadApiFromAnswers([
      makeSinglePresignFromOverrides("https://b2/original"),
    ]);
    api.completeUploadFile.mockRejectedValueOnce(
      new ApiRequestError({
        status: 409,
        code: "upload_file_conflict",
        message: "The row moved while it was verified.",
        details: { state: "sending" },
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

  it("fails the file as connection_lost when the row keeps moving", async () => {
    const api = makeUploadApiFromAnswers([
      makeSinglePresignFromOverrides("https://b2/original"),
    ]);
    const moved = new ApiRequestError({
      status: 409,
      code: "upload_file_conflict",
      message: "The row moved while it was verified.",
      details: { state: "sending" },
    });
    api.completeUploadFile
      .mockRejectedValueOnce(moved)
      .mockRejectedValueOnce(moved);

    const outcome = await transferUploadFile(
      makeTransferOptionsFromOverrides({
        api,
        transport: makeUploadTransportFromAnswers([]),
      }),
    );

    expect(outcome).toMatchObject({
      outcome: "failed",
      problemCode: "connection_lost",
    });
    expect(api.completeUploadFile).toHaveBeenCalledTimes(3);
    expect(api.completeUploadFile.mock.calls[2]?.[0].body).toMatchObject({
      outcome: "failed",
      problemCode: "connection_lost",
    });
  });

  it("does not drop a derivative when its presign finds the batch closed", async () => {
    const api = makeUploadApiFromAnswers([
      makeSinglePresignFromOverrides("https://b2/original"),
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

    expect(outcome).toEqual({ outcome: "batch-closed" });
    expect(api.completeUploadFile).not.toHaveBeenCalled();
  });

  it.each([502, 504])(
    "tries the API again after a proxy's %i, as after a 503",
    async (status) => {
      const api = makeUploadApiFromAnswers([
        new ApiRequestError({
          status,
          code: "unknown_error",
          message: `Request failed with status ${status}`,
        }),
        makeSinglePresignFromOverrides("https://b2/original"),
      ]);
      api.completeUploadFile.mockRejectedValueOnce(
        new ApiRequestError({
          status,
          code: "unknown_error",
          message: `Request failed with status ${status}`,
        }),
      );

      const outcome = await transferUploadFile(
        makeTransferOptionsFromOverrides({
          api,
          transport: makeUploadTransportFromAnswers([]),
        }),
      );

      expect(outcome.outcome).toBe("done");
      expect(api.presignUploadFile).toHaveBeenCalledTimes(2);
      expect(api.completeUploadFile).toHaveBeenCalledTimes(2);
    },
  );

  it("reports nothing and completes nothing when cancelled mid-PUT", async () => {
    const controller = new AbortController();
    const api = makeUploadApiFromAnswers([
      makeSinglePresignFromOverrides("https://b2/original"),
    ]);
    const transport: UploadTransport = {
      putBytes: async () => {
        controller.abort();
        throw new DOMException("The upload was cancelled", "AbortError");
      },
    };

    const outcome = await transferUploadFile(
      makeTransferOptionsFromOverrides({
        api,
        transport,
        signal: controller.signal,
      }),
    );

    expect(outcome).toEqual({ outcome: "aborted" });
    expect(api.completeUploadFile).not.toHaveBeenCalled();
  });
});
