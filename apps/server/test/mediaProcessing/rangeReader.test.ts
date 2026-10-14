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
    const result = await _read(reader.url, `bytes=0-${sourceBytes - 1}`);
    if (result.status !== 206) {
      break;
    }
  }
  expect(reader.getBytesRead()).toBeGreaterThan(17 * MIB);
  expect(reader.getBytesRead()).toBeLessThanOrEqual(2 * sourceBytes + 16 * MIB);
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
  const b2 = await _source((_request, response) => {
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
  expect((await _read(reader.url, `bytes=0-${MIB - 1}`)).status).toBe(429);
  expect(reader.getBytesRead()).toBe(bytesRead);
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
