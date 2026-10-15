import { expect, it } from "vitest";

import {
  MIB,
  createOwnedRangeReader,
  createRangeSource,
  makeRangeResponseFromSize,
  readRange,
} from "./rangeReaderTestHelpers.ts";

it("limits concurrent reads to two and refuses phase changes until idle", async () => {
  const started = Promise.withResolvers<void>();
  const finish = Promise.withResolvers<void>();
  let active = 0;
  const b2 = await createRangeSource((request, response) => {
    active += 1;
    if (active === 2) {
      started.resolve();
    }
    void finish.promise.then(() => {
      makeRangeResponseFromSize(8)(request, response);
    });
  });
  const reader = await createOwnedRangeReader({
    b2,
    key: "source",
    sourceBytes: 8,
    signal: new AbortController().signal,
    phaseByteLimit: 16 * MIB,
  });
  const reads = [
    readRange(reader.url, "bytes=0-7"),
    readRange(reader.url, "bytes=0-7"),
  ];
  await started.promise;
  expect(() => {
    reader.setPhaseByteLimit(undefined);
  }).toThrow(/active/i);
  expect((await readRange(reader.url, "bytes=0-7")).status).toBe(429);
  finish.resolve();
  expect(
    (await Promise.all(reads)).map((read) => {
      return read.status;
    }),
  ).toEqual([206, 206]);
});

it("closes on cancellation without exposing credentials or other object paths", async () => {
  const controller = new AbortController();
  const reader = await createOwnedRangeReader({
    b2: await createRangeSource(makeRangeResponseFromSize(4)),
    key: "private/path",
    sourceBytes: 4,
    signal: controller.signal,
  });
  expect(new URL(reader.url).hostname).toBe("127.0.0.1");
  expect(new URL(reader.url).search).toBe("");
  expect(reader.url).not.toMatch(/private|credential|secret/);
  expect((await fetch(new URL("/other", reader.url))).status).toBe(404);
  controller.abort();
  await reader.close();
  await expect(fetch(reader.url)).rejects.toThrow();
});

it("aborts an idle upstream read after fifteen seconds and shuts down active reads", async () => {
  const reader = await createOwnedRangeReader({
    b2: await createRangeSource(() => {}),
    key: "source",
    sourceBytes: 4,
    signal: new AbortController().signal,
  });
  const start = Date.now();
  expect((await readRange(reader.url, "bytes=0-3")).status).toBe(502);
  expect(Date.now() - start).toBeGreaterThanOrEqual(14_900);
  expect(reader.getFailure()).toBe("upstream_timeout");
  const pending = readRange(reader.url, "bytes=0-3");
  const rejected = expect(pending).rejects.toThrow();
  await new Promise((resolve) => {
    setTimeout(resolve, 20);
  });
  await reader.close();
  await rejected;
}, 20_000);

it("charges consumed partial bytes when a child aborts and never resets a probe cap", async () => {
  const lengths: number[] = [];
  const b2 = await createRangeSource((request, response) => {
    if (lengths.length > 0) {
      makeRangeResponseFromSize(MIB, lengths)(request, response);
      return;
    }
    lengths.push(MIB);
    response.writeHead(206, {
      "content-range": `bytes 0-${MIB - 1}/${MIB}`,
      "content-length": MIB,
    });
    const timer = setInterval(() => {
      response.write(Buffer.alloc(64 * 1024));
    }, 10);
    response.once("close", () => {
      clearInterval(timer);
    });
  });
  const reader = await createOwnedRangeReader({
    b2,
    key: "source",
    sourceBytes: MIB,
    signal: new AbortController().signal,
    phaseByteLimit: MIB,
  });
  const response = await fetch(reader.url, {
    headers: { range: `bytes=0-${MIB - 1}` },
  });
  const body = response.body!.getReader();
  await body.read();
  await body.cancel();
  await new Promise((resolve) => {
    setTimeout(resolve, 40);
  });
  const bytesRead = reader.getBytesRead();
  expect(bytesRead).toBeGreaterThan(0);
  expect(bytesRead).toBeLessThan(MIB);
  expect(reader.getFailure()).toBeUndefined();
  reader.setPhaseByteLimit(MIB);
  await expect(readRange(reader.url, `bytes=0-${MIB - 1}`)).rejects.toThrow();
  expect(lengths).toEqual([MIB, MIB - bytesRead]);
  expect(reader.getBytesRead()).toBe(MIB);
  expect(reader.getFailure()).toBe("phase_byte_limit");
  expect((await readRange(reader.url, `bytes=0-${MIB - 1}`)).status).toBe(429);
});

it("stops upstream consumption while the child applies backpressure", async () => {
  const sourceBytes = 64 * MIB;
  const reader = await createOwnedRangeReader({
    b2: await createRangeSource(makeRangeResponseFromSize(sourceBytes)),
    key: "source",
    sourceBytes,
    signal: new AbortController().signal,
  });
  const response = await fetch(reader.url);
  await new Promise((resolve) => {
    setTimeout(resolve, 500);
  });
  expect(reader.getBytesRead()).toBeGreaterThan(0);
  expect(reader.getBytesRead()).toBeLessThan(sourceBytes);
  await response.body!.cancel();
});
