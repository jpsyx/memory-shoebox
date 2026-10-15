import { createServer, type RequestListener } from "node:http";

import { once } from "node:events";

import type { AddressInfo } from "node:net";

import { expect, onTestFinished } from "vitest";

import { createMediaRangeReader } from "../../../src/mediaProcessing/input/createMediaRangeReader/createMediaRangeReader.ts";

import { createFakeB2Client } from "../../helpers/createFakeB2Client/createFakeB2Client.ts";
/** Shared scenario fixture. */
export const MIB = 1024 ** 2;
/** Shared scenario fixture. */
export async function createRangeSource(
  listener: RequestListener,
): Promise<ReturnType<typeof createFakeB2Client>> {
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
/** Shared scenario fixture. */
export async function createOwnedRangeReader(
  options: Parameters<typeof createMediaRangeReader>[0],
): ReturnType<typeof createMediaRangeReader> {
  const reader = await createMediaRangeReader(options);
  onTestFinished(reader.close);
  expect(new URL(reader.url).port, "must bind a real loopback server").not.toBe(
    "1",
  );
  return reader;
}
/** Shared scenario fixture. */
export function getRangeFromHeader(value: string | undefined): {
  start: number;
  end: number;
} {
  const [, start, end] = /^bytes=(\d+)-(\d+)$/.exec(value ?? "")!;
  return { start: Number(start), end: Number(end) };
}
/** Shared scenario fixture. */
export function makeRangeResponseFromSize(
  size: number,
  record: number[] = [],
): RequestListener {
  return (request, response) => {
    const { start, end } = getRangeFromHeader(request.headers.range);
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
/** Shared scenario fixture. */
export function makeHeldRangeResponseFromSize(size: number): RequestListener {
  return (request, response) => {
    const { start, end } = getRangeFromHeader(request.headers.range);
    response.writeHead(206, {
      "content-range": `bytes ${start}-${end}/${size}`,
      "content-length": end - start + 1,
      etag: '"original"',
    });
    response.write(Buffer.alloc(64 * 1024));
  };
}
/** Shared scenario fixture. */
export async function readRange(
  url: string,
  range: string,
): Promise<{ status: number; body: ArrayBuffer }> {
  const response = await fetch(url, { headers: { range } });
  const body = await response.arrayBuffer();
  return { status: response.status, body };
}
