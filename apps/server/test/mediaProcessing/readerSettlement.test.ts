import { expect, it, onTestFinished, vi } from "vitest";
import { createMediaRangeReader } from "../../src/mediaProcessing/input/createMediaRangeReader/createMediaRangeReader.ts";
import { createFakeB2Client } from "../helpers/createFakeB2Client/createFakeB2Client.ts";

it("drains delayed upstream cancellation before close and idle resolve", async () => {
  const nativeFetch = globalThis.fetch;
  const started = Promise.withResolvers<void>();
  const settle = Promise.withResolvers<void>();
  const b2 = createFakeB2Client();
  b2.presignGet = async () => {
    return "http://upstream.invalid/source";
  };
  const fetchSpy = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (url, options) => {
      if (String(url) !== "http://upstream.invalid/source") {
        return nativeFetch(url, options);
      }
      started.resolve();
      await new Promise<void>((done) => {
        return options!.signal!.addEventListener(
          "abort",
          () => {
            return done();
          },
          {
            once: true,
          },
        );
      });
      await settle.promise;
      throw options!.signal!.reason;
    });
  onTestFinished(() => {
    return fetchSpy.mockRestore();
  });
  const reader = await createMediaRangeReader({
    b2,
    key: "source",
    sourceBytes: 20,
    phaseByteLimit: 16,
    signal: new AbortController().signal,
  });
  onTestFinished(async () => {
    settle.resolve();
    await reader.close();
  });
  const child = fetch(reader.url).catch(() => {
    return undefined;
  });
  await started.promise;
  expect(() => {
    return reader.setPhaseByteLimit(undefined);
  }).toThrow("processing_reads_active");
  const cancelledWaiter = new AbortController();
  const waiting = reader.awaitIdle(cancelledWaiter.signal);
  cancelledWaiter.abort(new Error("stop active waiting"));
  await expect(waiting).rejects.toMatchObject({ name: "AbortError" });
  expect(() => {
    reader.setPhaseByteLimit(undefined);
  }).toThrow("processing_reads_active");
  let idle = false;
  let closed = false;
  const idleWork = reader.awaitIdle(AbortSignal.timeout(1000)).then(() => {
    idle = true;
  });
  const closing = reader.close().then(() => {
    closed = true;
  });
  await new Promise((done) => {
    return setImmediate(done);
  });
  expect({ idle, closed }).toEqual({ idle: false, closed: false });
  settle.resolve();
  await Promise.all([idleWork, closing, child]);
  expect({ idle, closed }).toEqual({ idle: true, closed: true });
  expect(reader.getBytesRead()).toBe(0);
  expect(reader.getFailure()).toBeUndefined();
  reader.setPhaseByteLimit(undefined);
});

it("aborts an idle waiter without resetting or canceling the reader", async () => {
  const b2 = createFakeB2Client();
  const reader = await createMediaRangeReader({
    b2,
    key: "source",
    sourceBytes: 20,
    signal: new AbortController().signal,
  });
  onTestFinished(reader.close);
  const abort = new AbortController();
  abort.abort(new Error("stop waiting"));
  await expect(reader.awaitIdle(abort.signal)).rejects.toThrow("stop waiting");
  await reader.awaitIdle(AbortSignal.timeout(1000));
  expect(reader.getBytesRead()).toBe(0);
});
