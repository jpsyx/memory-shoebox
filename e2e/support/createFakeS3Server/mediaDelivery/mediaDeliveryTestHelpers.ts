import { request } from "node:http";

import type { AddressInfo } from "node:net";

import { afterEach } from "vitest";

import { createFakeS3Server } from "../createFakeS3Server.ts";

import type { FakeS3ServerOptions } from "../createFakeS3Server.types.ts";
/** Shared scenario fixture. */
export const BODY: Buffer = Buffer.alloc(4096, 7);
/** Shared scenario fixture. */
export const servers: Array<ReturnType<typeof createFakeS3Server>> = [];
/** Shared scenario fixture. */
export async function startBucket(
  options: Omit<FakeS3ServerOptions, "bucketName" | "allowedOrigins"> = {},
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
/** Shared scenario fixture. */
export async function send(
  options: Readonly<{
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: Buffer;
  }>,
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
/** Registers the owned scenario setup and cleanup. */
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
