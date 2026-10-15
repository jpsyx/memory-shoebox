import { expect, it, onTestFinished } from "vitest";

import { uploadProcessingOutput } from "../../../../src/mediaProcessing/output/uploadProcessingOutput.ts";

import {
  MIB,
  makeBodyFromSize,
  createMultipartOutputFixture,
  createRecordingMultipartStorage,
} from "./multipartOutputTestHelpers.ts";

it("persists multipart ID before first part and streams single eight MiB parts", async () => {
  const { b2, requests } = await createRecordingMultipartStorage();
  const events: string[] = [];
  await b2.putObjectStream({
    key: "processing/output",
    body: makeBodyFromSize(17 * MIB),
    contentType: "video/mp4",
    byteSize: 17 * MIB,
    signal: new AbortController().signal,
    onMultipartStarted: async (uploadId) => {
      expect(uploadId).not.toBe("");
      expect(
        (await requests()).map((request) => {
          return request.operation;
        }),
      ).toEqual(["CreateMultipartUpload"]);
      events.push("persisted");
    },
  });
  expect(events).toEqual(["persisted"]);
  const parts = (await requests()).filter((request) => {
    return request.operation === "UploadPart";
  });
  expect(
    parts.map((part) => {
      return part.byteLength;
    }),
  ).toEqual([8 * MIB, 8 * MIB, MIB]);
  expect(await b2.headObject({ key: "processing/output" })).toMatchObject({
    sizeBytes: 17 * MIB,
  });
});

it("aborts before parts when persistence fails", async () => {
  const { b2, requests } = await createRecordingMultipartStorage();
  await expect(
    b2.putObjectStream({
      key: "processing/output",
      body: makeBodyFromSize(1),
      contentType: "image/jpeg",
      byteSize: 1,
      signal: new AbortController().signal,
      onMultipartStarted: async () => {
        throw new Error("disk failure");
      },
    }),
  ).rejects.toThrow("disk failure");
  expect(
    (await requests()).map((request) => {
      return request.operation;
    }),
  ).toEqual(["CreateMultipartUpload", "AbortMultipartUpload"]);
});

it.each([1023, 1025])(
  "aborts stream size mismatch %s and never publishes it",
  async (byteSize) => {
    const { b2, requests } = await createRecordingMultipartStorage();
    await expect(
      b2.putObjectStream({
        key: "processing/output",
        body: makeBodyFromSize(1024),
        contentType: "image/jpeg",
        byteSize,
        signal: new AbortController().signal,
        onMultipartStarted: async () => {},
      }),
    ).rejects.toThrow(/size/i);
    expect((await requests()).at(-1)?.operation).toBe("AbortMultipartUpload");
    expect(await b2.headObject({ key: "processing/output" })).toBeUndefined();
  },
);

it("does not consume the next part until the previous upload completes", async () => {
  const { b2, requests } = await createRecordingMultipartStorage();
  const body = async function* () {
    yield Buffer.alloc(8 * MIB);
    expect(
      (await requests()).map((request) => {
        return request.operation;
      }),
    ).toEqual(["CreateMultipartUpload", "UploadPart"]);
    yield Buffer.alloc(1);
  };
  await b2.putObjectStream({
    key: "output",
    body: body(),
    byteSize: 8 * MIB + 1,
    contentType: "image/jpeg",
    signal: new AbortController().signal,
    onMultipartStarted: async () => {},
  });
});

it("persists the actual ID in SQLite before reading any output bytes", async () => {
  const { b2, upload, row } = await createMultipartOutputFixture();
  const putObjectStream = b2.putObjectStream;
  b2.putObjectStream = async (options) => {
    const body = async function* () {
      expect(await row()).toMatchObject({
        state: "uploading",
        multipart_upload_id: expect.any(String),
      });
      yield* options.body;
    };
    return putObjectStream({ ...options, body: body() });
  };
  await uploadProcessingOutput(upload);
  expect((await row()).state).toBe("uploaded");
});

it("aborts a missing local output without an unhandled stream error", async () => {
  const { upload, requests, b2 } = await createMultipartOutputFixture();
  const putObjectStream = b2.putObjectStream;
  b2.putObjectStream = async (options) => {
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
    return putObjectStream(options);
  };
  await expect(
    uploadProcessingOutput({ ...upload, path: `${upload.path}.missing` }),
  ).rejects.toThrow();
  expect((await requests()).at(-1)?.operation).toBe("AbortMultipartUpload");
});

it("aborts a cancelled stream before another part or completion", async () => {
  const { b2, requests } = await createRecordingMultipartStorage();
  const controller = new AbortController();
  const body = async function* () {
    yield Buffer.alloc(8 * MIB);
    controller.abort();
    yield Buffer.alloc(1);
  };
  await expect(
    b2.putObjectStream({
      key: "output",
      body: body(),
      byteSize: 8 * MIB + 1,
      contentType: "video/mp4",
      signal: controller.signal,
      onMultipartStarted: async () => {},
    }),
  ).rejects.toThrow();
  expect(
    (await requests()).map((request) => {
      return request.operation;
    }),
  ).toEqual(["CreateMultipartUpload", "UploadPart", "AbortMultipartUpload"]);
});

it("caps declared output size before initiation and aborts provider part failures", async () => {
  const { startStubBucket, INITIATE_XML } =
    await import("../../../b2/client/__tests__/clientTestHelpers.ts");
  const stub = await startStubBucket({
    answer: (request) => {
      return request.method === "POST"
        ? { status: 200, body: INITIATE_XML }
        : request.method === "DELETE"
          ? { status: 204 }
          : { status: 500, body: "<Error><Code>InternalError</Code></Error>" };
    },
  });
  onTestFinished(stub.close);
  const options = {
    key: "output",
    body: makeBodyFromSize(1),
    byteSize: 512 * MIB + 1,
    contentType: "image/jpeg",
    signal: new AbortController().signal,
    onMultipartStarted: async () => {},
  };
  await expect(stub.client.putObjectStream(options)).rejects.toThrow(/size/);
  expect(stub.requests).toEqual([]);
  await expect(
    stub.client.putObjectStream({ ...options, byteSize: 1 }),
  ).rejects.toThrow();
  expect(
    stub.requests.map((request) => {
      return request.method;
    }),
  ).toEqual(["POST", "PUT", "DELETE"]);
});
