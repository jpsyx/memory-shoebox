import { createServer, type RequestListener } from "node:http";

import { once } from "node:events";

import type { AddressInfo } from "node:net";

import { expect, onTestFinished } from "vitest";

import { createMediaRangeReader } from "../../../../src/mediaProcessing/input/createMediaRangeReader/createMediaRangeReader.ts";

import { createFakeB2Client } from "../../../helpers/createFakeB2Client/createFakeB2Client.ts";
/** One mebibyte in bytes for source and transfer-budget fixtures. */
export const MIB = 1024 ** 2;
/**
 * Starts an owned loopback source with the supplied response handler and
 * returns a fake signer pointing at it; registers server cleanup.
 */
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
/**
 * Creates the actual loopback reader, verifies it bound a real port and
 * registers reader shutdown for test completion.
 */
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
/**
 * Extracts inclusive numeric bounds from the explicit byte-range header emitted
 * by the reader under test.
 */
export function getRangeFromHeader(value = ""): {
  start: number;
  end: number;
} {
  const [, start, end] = /^bytes=(\d+)-(\d+)$/.exec(value)!;
  return { start: Number(start), end: Number(end) };
}
/**
 * Returns a stable-ETag 206 source that reports each requested length and sends
 * the exact deterministic range body.
 */
export function makeRangeResponseFromSize({
  size,
  onRange,
}: Readonly<{
  size: number;
  onRange?: (length: number) => void;
}>): RequestListener {
  return (request, response) => {
    const { start, end } = getRangeFromHeader(request.headers.range);
    const length = end - start + 1;
    onRange?.(length);
    response.writeHead(206, {
      "content-range": `bytes ${start}-${end}/${size}`,
      "content-length": length,
      etag: '"original"',
    });
    response.end(Buffer.alloc(length, 7));
  };
}
/**
 * Returns a 206 source that writes an initial chunk without ending, allowing
 * cancellation, idle-timeout and concurrency tests.
 */
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
/**
 * Fetches one range and consumes its full body before returning status and
 * bytes.
 */
export async function readRange({
  url,
  range,
}: Readonly<{ url: string; range: string }>): Promise<{
  status: number;
  body: ArrayBuffer;
}> {
  const response = await fetch(url, { headers: { range } });
  const body = await response.arrayBuffer();
  return { status: response.status, body };
}
