import { createServer, type RequestListener } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { expect, it, onTestFinished } from "vitest";
import { createMediaRangeReader } from "../../src/mediaProcessing/input/createMediaRangeReader.ts";
import { createFakeB2Client } from "../helpers/createFakeB2Client/createFakeB2Client.ts";

const MIB = 1024 ** 2;
async function _source(listener: RequestListener) {
  const server = createServer(listener);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  onTestFinished(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  });
  const b2 = createFakeB2Client();
  b2.presignGet = async () => {
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}/original?secret=credential`;
  };
  return b2;
}
async function _reader(options: Parameters<typeof createMediaRangeReader>[0]) {
  const reader = await createMediaRangeReader(options);
  onTestFinished(reader.close);
  expect(new URL(reader.url).port, "must bind a real loopback server").not.toBe(
    "1",
  );
  return reader;
}
function _range(value: string | undefined) {
  const [, start, end] = /^bytes=(\d+)-(\d+)$/.exec(value ?? "")!;
  return { start: Number(start), end: Number(end) };
}
function _answer(size: number, record: number[] = []): RequestListener {
  return (request, response) => {
    const { start, end } = _range(request.headers.range);
    const length = end - start + 1;
    record.push(length);
    response.writeHead(206, {
      "content-range": `bytes ${start}-${end}/${size}`,
      "content-length": length,
      etag: '"original"',
    });
    response.end(Buffer.alloc(length, 7));
  };
}
function _holdRange(size: number): RequestListener {
  return (request, response) => {
    const { start, end } = _range(request.headers.range);
    response.writeHead(206, {
      "content-range": `bytes ${start}-${end}/${size}`,
      "content-length": end - start + 1,
      etag: '"original"',
    });
    response.write(Buffer.alloc(64 * 1024));
  };
}
async function _read(url: string, range: string) {
  const response = await fetch(url, { headers: { range } });
  const body = await response.arrayBuffer();
  return { status: response.status, body };
}

it("counts repeated and aborted ranges against one budget", async () => {
  const sourceBytes = MIB;
  const b2 = await _source(_answer(sourceBytes));
  const reader = await _reader({
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
  expect((await _read(reader.url, `bytes=0-${sourceBytes - 1}`)).status).toBe(
    429,
  );
});

it("segments reads at eight MiB and preserves byte order", async () => {
  const lengths: number[] = [];
  const sourceBytes = 17 * MIB;
  const reader = await _reader({
    b2: await _source(_answer(sourceBytes, lengths)),
    key: "source",
    sourceBytes,
    signal: new AbortController().signal,
  });
  const result = await _read(reader.url, `bytes=0-${sourceBytes - 1}`);
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
    const b2 = await _source((_request, response) => {
      response.writeHead(status, {
        "content-range": contentRange,
        "content-length": contentLength,
      });
      response.end("oops!");
    });
    const reader = await _reader({
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
  const b2 = await _source((_request, response) => {
    response.writeHead(206, {
      "content-range": "bytes 0-999/1000",
      "content-length": "1000",
    });
    response.write(Buffer.alloc(250));
    setTimeout(() => {
      response.destroy();
    }, 20);
  });
  const reader = await _reader({
    b2,
    key: "source",
    sourceBytes: 1000,
    signal: new AbortController().signal,
  });
  await expect(_read(reader.url, "bytes=0-999")).rejects.toThrow();
  expect(reader.getBytesRead()).toBe(250);
  await expect(_read(reader.url, "bytes=0-999")).rejects.toThrow();
  expect(reader.getBytesRead()).toBe(500);
  expect(reader.getFailure()).toBe("source_truncated");
});

it("rejects the 1,025th request without contacting storage", async () => {
  const lengths: number[] = [];
  const reader = await _reader({
    b2: await _source(_answer(1, lengths)),
    key: "source",
    sourceBytes: 1,
    signal: new AbortController().signal,
    phaseByteLimit: 2048,
  });
  for (let index = 0; index < 1024; index++) {
    if (index === 512) {
      reader.setPhaseByteLimit(undefined);
    }
    expect((await _read(reader.url, "bytes=0-0")).status).toBe(206);
  }
  expect((await _read(reader.url, "bytes=0-0")).status).toBe(429);
  expect(lengths).toHaveLength(1024);
  expect(reader.getFailure()).toBe("input_request_limit");
}, 15_000);

it("limits concurrent reads to two and refuses phase changes until idle", async () => {
  const started = Promise.withResolvers<void>();
  const finish = Promise.withResolvers<void>();
  let active = 0;
  const b2 = await _source((request, response) => {
    active += 1;
    if (active === 2) {
      started.resolve();
    }
    void finish.promise.then(() => {
      _answer(8)(request, response);
    });
  });
  const reader = await _reader({
    b2,
    key: "source",
    sourceBytes: 8,
    signal: new AbortController().signal,
    phaseByteLimit: 16 * MIB,
  });
  const reads = [
    _read(reader.url, "bytes=0-7"),
    _read(reader.url, "bytes=0-7"),
  ];
  await started.promise;
  expect(() => {
    reader.setPhaseByteLimit(undefined);
  }).toThrow(/active/i);
  expect((await _read(reader.url, "bytes=0-7")).status).toBe(429);
  finish.resolve();
  expect(
    (await Promise.all(reads)).map((read) => {
      return read.status;
    }),
  ).toEqual([206, 206]);
});

it("preserves aggregate bytes and request count when probe phase ends", async () => {
  const reader = await _reader({
    b2: await _source(_answer(MIB)),
    key: "source",
    sourceBytes: MIB,
    signal: new AbortController().signal,
    phaseByteLimit: 16 * MIB,
  });
  for (let index = 0; index < 16; index++) {
    await _read(reader.url, `bytes=0-${MIB - 1}`);
  }
  expect((await _read(reader.url, `bytes=0-${MIB - 1}`)).status).toBe(429);
  expect(reader.getFailure()).toBe("phase_byte_limit");
  reader.setPhaseByteLimit(undefined);
  expect(reader.getFailure()).toBeUndefined();
  for (let index = 0; index < 2; index++) {
    expect((await _read(reader.url, `bytes=0-${MIB - 1}`)).status).toBe(206);
  }
  expect(reader.getBytesRead()).toBe(18 * MIB);
  expect((await _read(reader.url, "bytes=0-0")).status).toBe(429);
  expect(reader.getFailure()).toBe("input_byte_limit");
});

it("closes on cancellation without exposing credentials or other object paths", async () => {
  const controller = new AbortController();
  const reader = await _reader({
    b2: await _source(_answer(4)),
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
  const reader = await _reader({
    b2: await _source(() => {}),
    key: "source",
    sourceBytes: 4,
    signal: new AbortController().signal,
  });
  const start = Date.now();
  expect((await _read(reader.url, "bytes=0-3")).status).toBe(502);
  expect(Date.now() - start).toBeGreaterThanOrEqual(14_900);
  expect(reader.getFailure()).toBe("upstream_timeout");
  const pending = _read(reader.url, "bytes=0-3");
  const rejected = expect(pending).rejects.toThrow();
  await new Promise((resolve) => {
    setTimeout(resolve, 20);
  });
  await reader.close();
  await rejected;
}, 20_000);

it("charges consumed partial bytes when a child aborts and never resets a probe cap", async () => {
  const lengths: number[] = [];
  const b2 = await _source((request, response) => {
    if (lengths.length > 0) {
      _answer(MIB, lengths)(request, response);
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
  const reader = await _reader({
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
  await expect(_read(reader.url, `bytes=0-${MIB - 1}`)).rejects.toThrow();
  expect(lengths).toEqual([MIB, MIB - bytesRead]);
  expect(reader.getBytesRead()).toBe(MIB);
  expect(reader.getFailure()).toBe("phase_byte_limit");
  expect((await _read(reader.url, `bytes=0-${MIB - 1}`)).status).toBe(429);
});

it("rejects a changed validator even when source size stays the same", async () => {
  let revision = 0;
  const b2 = await _source((_request, response) => {
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
  const reader = await _reader({
    b2,
    key: "source",
    sourceBytes: 4,
    signal: new AbortController().signal,
  });
  expect((await _read(reader.url, "bytes=0-3")).status).toBe(206);
  expect((await _read(reader.url, "bytes=0-3")).status).toBe(502);
  expect(reader.getBytesRead()).toBe(4);
  expect(reader.getFailure()).toBe("source_changed");
  expect((await _read(reader.url, "bytes=0-3")).status).toBe(502);
  reader.setPhaseByteLimit(undefined);
  expect(reader.getFailure()).toBe("source_changed");
});

it("exposes transient provider failures independently of decoder stderr", async () => {
  const b2 = await _source((_request, response) => {
    response.writeHead(503).end("secret=credential");
  });
  const reader = await _reader({
    b2,
    key: "source",
    sourceBytes: 4,
    signal: new AbortController().signal,
  });
  expect((await _read(reader.url, "bytes=0-3")).status).toBe(502);
  expect(reader.getFailure()).toBe("upstream_unavailable");
});

it("stops upstream consumption while the child applies backpressure", async () => {
  const sourceBytes = 64 * MIB;
  const reader = await _reader({
    b2: await _source(_answer(sourceBytes)),
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

it.each([undefined, "bytes=0-"])(
  "admits a large-original probe and cancels below its cap: %s",
  async (range) => {
    const sourceBytes = 32 * MIB;
    const requestedLengths: number[] = [];
    const upstreamClosed = Promise.withResolvers<void>();
    const b2 = await _source((request, response) => {
      const { start, end } = _range(request.headers.range);
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
    const reader = await _reader({
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
    const reader = await _reader({
      b2: await _source(_answer(sourceBytes, lengths)),
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
    expect((await _read(reader.url, "bytes=0-0")).status).toBe(429);
    reader.setPhaseByteLimit(undefined);
    expect((await _read(reader.url, "bytes=0-0")).status).toBe(206);
    expect(reader.getBytesRead()).toBe(phaseByteLimit + 1);
    expect(reader.getFailure()).toBeUndefined();
  },
);

it("waits for reserved probe capacity and proceeds when the competing read cancels", async () => {
  const sourceBytes = 32 * MIB;
  const lengths: number[] = [];
  const b2 = await _source((request, response) => {
    const { start, end } = _range(request.headers.range);
    lengths.push(end - start + 1);
    if (lengths.length === 2) {
      _holdRange(sourceBytes)(request, response);
      return;
    }
    _answer(sourceBytes)(request, response);
  });
  const reader = await _reader({
    b2,
    key: "source",
    sourceBytes,
    phaseByteLimit: 16 * MIB,
    signal: new AbortController().signal,
  });
  await _read(reader.url, `bytes=0-${8 * MIB - 1}`);
  const first = await fetch(reader.url, {
    headers: { range: `bytes=0-${8 * MIB - 1}` },
  });
  const body = first.body!.getReader();
  await body.read();
  let hasSecondFinished = false;
  const second = _read(reader.url, `bytes=${16 * MIB}-${18 * MIB - 1}`).then(
    (result) => {
      hasSecondFinished = true;
      return result;
    },
  );
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
  const b2 = await _source((request, response) => {
    upstreamRequests += 1;
    if (upstreamRequests === 1) {
      _holdRange(sourceBytes)(request, response);
      return;
    }
    _answer(sourceBytes)(request, response);
  });
  const reader = await _reader({
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
  const replacement = _read(reader.url, "bytes=0-7");
  await body.cancel();
  expect((await replacement).status).toBe(206);
  expect(upstreamRequests).toBe(2);
  expect(reader.getBytesRead()).toBe(64 * 1024 + 8);
  expect(reader.getFailure()).toBeUndefined();
});

it("shuts down a capacity waiter without initiating an extra upstream request", async () => {
  const sourceBytes = 32 * MIB;
  let upstreamRequests = 0;
  const b2 = await _source((request, response) => {
    upstreamRequests += 1;
    _holdRange(sourceBytes)(request, response);
  });
  const reader = await _reader({
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
