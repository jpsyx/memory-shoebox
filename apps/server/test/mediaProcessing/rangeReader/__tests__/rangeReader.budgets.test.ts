import { expect, it } from "vitest";

import {
  MIB,
  createOwnedRangeReader,
  createRangeSource,
  getRangeFromHeader,
  makeRangeResponseFromSize,
  readRange,
} from "./rangeReaderTestHelpers.ts";

it("counts repeated and aborted ranges against one budget", async () => {
  const sourceBytes = MIB;
  const b2 = await createRangeSource(makeRangeResponseFromSize(sourceBytes));
  const reader = await createOwnedRangeReader({
    b2,
    key: "original",
    sourceBytes,
    signal: new AbortController().signal,
  });
  const first = await fetch(reader.url, {
    headers: { range: `bytes=0-${sourceBytes - 1}` },
  });
  const body = first.body!.getReader();
  await body.read();
  await body.cancel();
  for (let index = 0; index < 18; index++) {
    const result = await fetch(reader.url, {
      headers: { range: `bytes=0-${sourceBytes - 1}` },
    });
    const didFinish = await result.arrayBuffer().then(
      () => {
        return true;
      },
      () => {
        return false;
      },
    );
    if (result.status !== 206 || !didFinish) {
      break;
    }
  }
  expect(reader.getBytesRead()).toBe(2 * sourceBytes + 16 * MIB);
  expect(reader.getFailure()).toBe("input_byte_limit");
  expect(
    (await readRange(reader.url, `bytes=0-${sourceBytes - 1}`)).status,
  ).toBe(429);
});

it("rejects the 1,025th request without contacting storage", async () => {
  const lengths: number[] = [];
  const reader = await createOwnedRangeReader({
    b2: await createRangeSource(makeRangeResponseFromSize(1, lengths)),
    key: "source",
    sourceBytes: 1,
    signal: new AbortController().signal,
    phaseByteLimit: 2048,
  });
  for (let index = 0; index < 1024; index++) {
    if (index === 512) {
      reader.setPhaseByteLimit(undefined);
    }
    expect((await readRange(reader.url, "bytes=0-0")).status).toBe(206);
  }
  expect((await readRange(reader.url, "bytes=0-0")).status).toBe(429);
  expect(lengths).toHaveLength(1024);
  expect(reader.getFailure()).toBe("input_request_limit");
}, 15_000);

it("preserves aggregate bytes and request count when probe phase ends", async () => {
  const reader = await createOwnedRangeReader({
    b2: await createRangeSource(makeRangeResponseFromSize(MIB)),
    key: "source",
    sourceBytes: MIB,
    signal: new AbortController().signal,
    phaseByteLimit: 16 * MIB,
  });
  for (let index = 0; index < 16; index++) {
    await readRange(reader.url, `bytes=0-${MIB - 1}`);
  }
  expect((await readRange(reader.url, `bytes=0-${MIB - 1}`)).status).toBe(429);
  expect(reader.getFailure()).toBe("phase_byte_limit");
  reader.setPhaseByteLimit(undefined);
  expect(reader.getFailure()).toBeUndefined();
  for (let index = 0; index < 2; index++) {
    expect((await readRange(reader.url, `bytes=0-${MIB - 1}`)).status).toBe(
      206,
    );
  }
  expect(reader.getBytesRead()).toBe(18 * MIB);
  expect((await readRange(reader.url, "bytes=0-0")).status).toBe(429);
  expect(reader.getFailure()).toBe("input_byte_limit");
});

it.each([undefined, "bytes=0-"])(
  "admits a large-original probe and cancels below its cap: %s",
  async (range) => {
    const sourceBytes = 32 * MIB;
    const requestedLengths: number[] = [];
    const upstreamClosed = Promise.withResolvers<void>();
    const b2 = await createRangeSource((request, response) => {
      const { start, end } = getRangeFromHeader(request.headers.range);
      requestedLengths.push(end - start + 1);
      response.writeHead(206, {
        "content-range": `bytes ${start}-${end}/${sourceBytes}`,
        "content-length": end - start + 1,
      });
      response.write(Buffer.alloc(64 * 1024));
      response.once("close", () => {
        upstreamClosed.resolve();
      });
    });
    const reader = await createOwnedRangeReader({
      b2,
      key: "source",
      sourceBytes,
      phaseByteLimit: 16 * MIB,
      signal: new AbortController().signal,
    });
    const response = await fetch(
      reader.url,
      range === undefined ? {} : { headers: { range } },
    );
    expect(response.status).toBe(range === undefined ? 200 : 206);
    const body = response.body!.getReader();
    expect((await body.read()).value!.byteLength).toBeGreaterThan(0);
    await body.cancel();
    await upstreamClosed.promise;
    await reader.close();
    expect(requestedLengths).toEqual([8 * MIB]);
    expect(reader.getBytesRead()).toBe(64 * 1024);
    expect(reader.getFailure()).toBeUndefined();
  },
);

it.each([
  [undefined, 16 * MIB],
  ["bytes=0-", 16 * MIB],
  [undefined, 16 * MIB + 123],
  ["bytes=0-", 16 * MIB + 123],
] as const)(
  "meters an oversized probe exactly to its cap: %s, %s",
  async (range, phaseByteLimit) => {
    const sourceBytes = 32 * MIB;
    const lengths: number[] = [];
    const reader = await createOwnedRangeReader({
      b2: await createRangeSource(
        makeRangeResponseFromSize(sourceBytes, lengths),
      ),
      key: "source",
      sourceBytes,
      phaseByteLimit,
      signal: new AbortController().signal,
    });
    const response = await fetch(
      reader.url,
      range === undefined ? {} : { headers: { range } },
    );
    expect(response.status).toBe(range === undefined ? 200 : 206);
    await expect(response.arrayBuffer()).rejects.toThrow();
    expect(reader.getBytesRead()).toBe(phaseByteLimit);
    expect(lengths).toEqual(
      phaseByteLimit === 16 * MIB
        ? [8 * MIB, 8 * MIB]
        : [8 * MIB, 8 * MIB, 123],
    );
    expect(reader.getFailure()).toBe("phase_byte_limit");
    expect((await readRange(reader.url, "bytes=0-0")).status).toBe(429);
    reader.setPhaseByteLimit(undefined);
    expect((await readRange(reader.url, "bytes=0-0")).status).toBe(206);
    expect(reader.getBytesRead()).toBe(phaseByteLimit + 1);
    expect(reader.getFailure()).toBeUndefined();
  },
);
