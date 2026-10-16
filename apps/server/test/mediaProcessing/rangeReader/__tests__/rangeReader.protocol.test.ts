import { expect, it } from "vitest";

import {
  MIB,
  createOwnedRangeReader,
  createRangeSource,
  makeRangeResponseFromSize,
  readRange,
} from "./rangeReaderTestHelpers.ts";

it("segments reads at eight MiB and preserves byte order", async () => {
  const lengths: number[] = [];
  const sourceBytes = 17 * MIB;
  const reader = await createOwnedRangeReader({
    b2: await createRangeSource(
      makeRangeResponseFromSize({
        size: sourceBytes,
        onRange: (length) => {
          lengths.push(length);
        },
      }),
    ),
    key: "source",
    sourceBytes,
    signal: new AbortController().signal,
  });
  const result = await readRange({
    url: reader.url,
    range: `bytes=0-${sourceBytes - 1}`,
  });
  expect(result.status).toBe(206);
  expect(result.body.byteLength).toBe(sourceBytes);
  expect(
    new Uint8Array(result.body).every((value) => {
      return value === 7;
    }),
  ).toBe(true);
  expect(lengths).toEqual([8 * MIB, 8 * MIB, MIB]);
  expect(reader.getBytesRead()).toBe(sourceBytes);
});

it.each([
  [200, "bytes 0-3/4", "4"],
  [206, "invalid", "4"],
  [206, "bytes 1-3/4", "3"],
  [206, "bytes 0-2/4", "3"],
  [206, "bytes 0-3/5", "4"],
  [206, "bytes 0-3/4", "5"],
])(
  "rejects invalid source response %s %s %s",
  async (status, contentRange, contentLength) => {
    const b2 = await createRangeSource((_request, response) => {
      response.writeHead(status, {
        "content-range": contentRange,
        "content-length": contentLength,
      });
      response.end("oops!");
    });
    const reader = await createOwnedRangeReader({
      b2,
      key: "source",
      sourceBytes: 4,
      signal: new AbortController().signal,
    });
    const response = await fetch(reader.url, {
      headers: { range: "bytes=0-3" },
    });
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("credential");
  },
);

it("meters truncated source bodies before rejecting and keeps their charge", async () => {
  const b2 = await createRangeSource((_request, response) => {
    response.writeHead(206, {
      "content-range": "bytes 0-999/1000",
      "content-length": "1000",
    });
    response.write(Buffer.alloc(250));
    setTimeout(() => {
      response.destroy();
    }, 20);
  });
  const reader = await createOwnedRangeReader({
    b2,
    key: "source",
    sourceBytes: 1000,
    signal: new AbortController().signal,
  });
  await expect(
    readRange({ url: reader.url, range: "bytes=0-999" }),
  ).rejects.toThrow();
  expect(reader.getBytesRead()).toBe(250);
  await expect(
    readRange({ url: reader.url, range: "bytes=0-999" }),
  ).rejects.toThrow();
  expect(reader.getBytesRead()).toBe(500);
  expect(reader.getFailure()).toBe("source_truncated");
});

it("rejects a changed validator even when source size stays the same", async () => {
  let revision = 0;
  const b2 = await createRangeSource((_request, response) => {
    revision += 1;
    if (revision > 2) {
      response.writeHead(500).end();
      return;
    }
    response.writeHead(206, {
      "content-range": "bytes 0-3/4",
      "content-length": 4,
      etag: `"${revision}"`,
    });
    response.end("data");
  });
  const reader = await createOwnedRangeReader({
    b2,
    key: "source",
    sourceBytes: 4,
    signal: new AbortController().signal,
  });
  expect(
    (await readRange({ url: reader.url, range: "bytes=0-3" })).status,
  ).toBe(206);
  expect(
    (await readRange({ url: reader.url, range: "bytes=0-3" })).status,
  ).toBe(502);
  expect(reader.getBytesRead()).toBe(4);
  expect(reader.getFailure()).toBe("source_changed");
  expect(
    (await readRange({ url: reader.url, range: "bytes=0-3" })).status,
  ).toBe(502);
  reader.setPhaseByteLimit(undefined);
  expect(reader.getFailure()).toBe("source_changed");
});

it("exposes transient provider failures independently of decoder stderr", async () => {
  const b2 = await createRangeSource((_request, response) => {
    response.writeHead(503).end("secret=credential");
  });
  const reader = await createOwnedRangeReader({
    b2,
    key: "source",
    sourceBytes: 4,
    signal: new AbortController().signal,
  });
  expect(
    (await readRange({ url: reader.url, range: "bytes=0-3" })).status,
  ).toBe(502);
  expect(reader.getFailure()).toBe("upstream_unavailable");
});
