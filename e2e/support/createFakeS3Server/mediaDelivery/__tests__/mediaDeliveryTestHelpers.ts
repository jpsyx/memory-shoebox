import { request } from "node:http";

import type { AddressInfo } from "node:net";

import { afterEach } from "vitest";

import { createFakeS3Server } from "../../createFakeS3Server.ts";

import type { FakeS3ServerOptions } from "../../createFakeS3Server.types.ts";
type MediaDeliveryRequestOptions = {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: Buffer;
};

/**
 * Deterministic 4 KiB object body used to verify range and transfer accounting.
 */
export const BODY: Buffer = Buffer.alloc(4096, 7);
/**
 * Owned loopback bucket servers closed by the installed delivery-test
 * lifecycle.
 */
export const servers: Array<ReturnType<typeof createFakeS3Server>> = [];
/**
 * Starts an owned fake media bucket on an ephemeral loopback port and returns
 * its origin.
 */
export async function startBucket(
  options: Readonly<
    Omit<FakeS3ServerOptions, "bucketName" | "allowedOrigins">
  > = {},
): Promise<string> {
  const server = createFakeS3Server({
    bucketName: "media",
    allowedOrigins: [],
    ...options,
  });
  servers.push(server);
  await new Promise<void>((fulfill) => {
    server.listen(0, "127.0.0.1", fulfill);
  });
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
/**
 * Sends a Node HTTP request and returns the complete raw response body, status
 * and headers without browser cache behavior.
 */
export async function send(
  options: Readonly<MediaDeliveryRequestOptions>,
): Promise<{
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
}> {
  return new Promise((fulfill, reject) => {
    const outgoing = request(
      options.url,
      { method: options.method ?? "GET", headers: options.headers },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => {
          chunks.push(chunk);
        });
        response.on("end", () => {
          fulfill({
            status: response.statusCode ?? 0,
            headers: response.headers,
            body: Buffer.concat(chunks),
          });
        });
        response.on("error", reject);
      },
    );
    outgoing.on("error", reject);
    outgoing.end(options.body);
  });
}
/**
 * Registers afterEach closure of every loopback bucket created by this fixture
 * and propagates server shutdown failures.
 */
export function installMediaDeliveryTestLifecycle(): void {
  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map((server) => {
        return new Promise<void>((fulfill, reject) => {
          server.close((failure) => {
            if (failure !== undefined) {
              reject(failure);
            } else {
              fulfill();
            }
          });
        });
      }),
    );
  });
}
