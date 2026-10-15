import { expect, it } from "vitest";

import {
  MIB,
  createOwnedRangeReader,
  createRangeSource,
  getRangeFromHeader,
  makeHeldRangeResponseFromSize,
  makeRangeResponseFromSize,
  readRange,
} from "./rangeReaderTestHelpers.ts";

it("waits for reserved probe capacity and proceeds when the competing read cancels", async () => {
  const sourceBytes = 32 * MIB;
  const lengths: number[] = [];
  const b2 = await createRangeSource((request, response) => {
    const { start, end } = getRangeFromHeader(request.headers.range);
    lengths.push(end - start + 1);
    if (lengths.length === 2) {
      makeHeldRangeResponseFromSize(sourceBytes)(request, response);
      return;
    }
    makeRangeResponseFromSize(sourceBytes)(request, response);
  });
  const reader = await createOwnedRangeReader({
    b2,
    key: "source",
    sourceBytes,
    phaseByteLimit: 16 * MIB,
    signal: new AbortController().signal,
  });
  await readRange(reader.url, `bytes=0-${8 * MIB - 1}`);
  const first = await fetch(reader.url, {
    headers: { range: `bytes=0-${8 * MIB - 1}` },
  });
  const body = first.body!.getReader();
  await body.read();
  let hasSecondFinished = false;
  const second = readRange(
    reader.url,
    `bytes=${16 * MIB}-${18 * MIB - 1}`,
  ).then((result) => {
    hasSecondFinished = true;
    return result;
  });
  await new Promise((resolve) => {
    setTimeout(resolve, 40);
  });
  expect(hasSecondFinished).toBe(false);
  expect(reader.getFailure()).toBeUndefined();
  expect(lengths).toEqual([8 * MIB, 8 * MIB]);
  expect(() => {
    reader.setPhaseByteLimit(undefined);
  }).toThrow(/active/i);
  await body.cancel();
  expect((await second).body.byteLength).toBe(2 * MIB);
  expect(lengths).toEqual([8 * MIB, 8 * MIB, 2 * MIB]);
  expect(reader.getBytesRead()).toBe(10 * MIB + 64 * 1024);
  expect(reader.getFailure()).toBeUndefined();
});

it("cancels a capacity waiter and releases its active slot before another request", async () => {
  const sourceBytes = 32 * MIB;
  let upstreamRequests = 0;
  const b2 = await createRangeSource((request, response) => {
    upstreamRequests += 1;
    if (upstreamRequests === 1) {
      makeHeldRangeResponseFromSize(sourceBytes)(request, response);
      return;
    }
    makeRangeResponseFromSize(sourceBytes)(request, response);
  });
  const reader = await createOwnedRangeReader({
    b2,
    key: "source",
    sourceBytes,
    phaseByteLimit: MIB,
    signal: new AbortController().signal,
  });
  const first = await fetch(reader.url, {
    headers: { range: `bytes=0-${MIB - 1}` },
  });
  const body = first.body!.getReader();
  await body.read();
  const controller = new AbortController();
  const waiting = fetch(reader.url, {
    headers: { range: "bytes=0-7" },
    signal: controller.signal,
  });
  await new Promise((resolve) => {
    setTimeout(resolve, 40);
  });
  expect(reader.getFailure()).toBeUndefined();
  controller.abort();
  await expect(waiting).rejects.toThrow();
  await new Promise((resolve) => {
    setTimeout(resolve, 40);
  });
  const replacement = readRange(reader.url, "bytes=0-7");
  await body.cancel();
  expect((await replacement).status).toBe(206);
  expect(upstreamRequests).toBe(2);
  expect(reader.getBytesRead()).toBe(64 * 1024 + 8);
  expect(reader.getFailure()).toBeUndefined();
});

it("shuts down a capacity waiter without initiating an extra upstream request", async () => {
  const sourceBytes = 32 * MIB;
  let upstreamRequests = 0;
  const b2 = await createRangeSource((request, response) => {
    upstreamRequests += 1;
    makeHeldRangeResponseFromSize(sourceBytes)(request, response);
  });
  const reader = await createOwnedRangeReader({
    b2,
    key: "source",
    sourceBytes,
    phaseByteLimit: MIB,
    signal: new AbortController().signal,
  });
  const first = await fetch(reader.url, {
    headers: { range: `bytes=0-${MIB - 1}` },
  });
  const firstResult = first.arrayBuffer().then(
    () => {
      return false;
    },
    () => {
      return true;
    },
  );
  const second = fetch(reader.url, { headers: { range: "bytes=0-7" } });
  const secondResult = second.then(
    () => {
      return false;
    },
    () => {
      return true;
    },
  );
  await new Promise((resolve) => {
    setTimeout(resolve, 40);
  });
  expect(reader.getFailure()).toBeUndefined();
  await reader.close();
  expect(await Promise.all([firstResult, secondResult])).toEqual([true, true]);
  expect(upstreamRequests).toBe(1);
  expect(reader.getFailure()).toBeUndefined();
});
