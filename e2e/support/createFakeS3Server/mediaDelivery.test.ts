import { request } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, test } from "vitest";
import { createFakeS3Server } from "./createFakeS3Server.ts";
import type {
  FakeS3Request,
  FakeS3ServerOptions,
  FakeS3Transfer,
} from "./createFakeS3Server.types.ts";

const BODY: Buffer = Buffer.alloc(4096, 7);
const servers: Array<ReturnType<typeof createFakeS3Server>> = [];

async function _startBucket(
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

async function _send(
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

describe("fake media delivery", () => {
  test("serves validators and ranges without excess bytes", async () => {
    const origin = await _startBucket();
    const url = `${origin}/media/photo.jpg`;
    const uploaded = await _send({ url, method: "PUT", body: BODY });
    const range = await _send({ url, headers: { Range: "bytes=0-1023" } });
    expect(range.status).toBe(206);
    expect(range.body.byteLength).toBe(1024);
    expect(range.headers["content-range"]).toBe("bytes 0-1023/4096");
    expect(range.headers["accept-ranges"]).toBe("bytes");
    expect(range.headers.etag).toBe(uploaded.headers.etag);
    const invalid = await _send({ url, headers: { Range: "bytes=4096-" } });
    expect(invalid.status).toBe(416);
    expect(invalid.body.byteLength).toBe(0);
    expect(invalid.headers["content-range"]).toBe("bytes */4096");
    const conditional = await _send({
      url,
      headers: { "If-None-Match": String(uploaded.headers.etag) },
    });
    expect(conditional.status).toBe(304);
    expect(conditional.body.byteLength).toBe(0);
    const log = await _send({ url: `${origin}/__fake-s3/requests` });
    const { requests } = JSON.parse(log.body.toString()) as {
      requests: FakeS3Request[];
    };
    expect(
      requests.slice(1).map((entry) => {
        return [entry.status, entry.bodyBytes];
      }),
    ).toEqual([
      [206, 1024],
      [416, 0],
      [304, 0],
    ]);
  });

  test("serves suffix and open ranges, clamps ends, and leaves HEAD bodiless", async () => {
    const origin = await _startBucket();
    const url = `${origin}/media/photo.jpg`;
    await _send({ url, method: "PUT", body: BODY });
    const suffix = await _send({ url, headers: { Range: "bytes=-32" } });
    expect(suffix.status).toBe(206);
    expect(suffix.body).toEqual(BODY.subarray(-32));
    expect(suffix.headers["content-range"]).toBe("bytes 4064-4095/4096");
    const open = await _send({ url, headers: { Range: "bytes=3072-" } });
    expect(open.body.byteLength).toBe(1024);
    const clamped = await _send({ url, headers: { Range: "bytes=4000-9000" } });
    expect(clamped.body.byteLength).toBe(96);
    const head = await _send({
      url,
      method: "HEAD",
      headers: { Range: "bytes=0-10" },
    });
    expect(head.status).toBe(200);
    expect(head.body.byteLength).toBe(0);
    expect(head.headers["content-length"]).toBe("4096");
    const empty = `${origin}/media/empty`;
    await _send({ url: empty, method: "PUT" });
    expect(
      (await _send({ url: empty, headers: { Range: "bytes=0-" } })).status,
    ).toBe(416);
  });

  test("honors conditional precedence, weak validators and strong If-Range", async () => {
    const origin = await _startBucket();
    const url = `${origin}/media/photo.jpg`;
    await _send({ url, method: "PUT", body: BODY });
    const initial = await _send({ url, method: "HEAD" });
    const etag = String(initial.headers.etag);
    const modified = String(initial.headers["last-modified"]);
    expect(
      (
        await _send({
          url,
          headers: {
            "If-None-Match": `"other", W/${etag}`,
            Range: "bytes=0-15",
          },
        })
      ).status,
    ).toBe(304);
    expect(
      (await _send({ url, headers: { "If-Modified-Since": modified } })).status,
    ).toBe(304);
    expect(
      (
        await _send({
          url,
          headers: {
            "If-None-Match": '"other"',
            "If-Modified-Since": modified,
          },
        })
      ).status,
    ).toBe(200);
    expect(
      (await _send({ url, headers: { Range: "bytes=0-15", "If-Range": etag } }))
        .body.byteLength,
    ).toBe(16);
    expect(
      (
        await _send({
          url,
          headers: { Range: "bytes=0-15", "If-Range": modified },
        })
      ).status,
    ).toBe(206);
    expect(
      (
        await _send({
          url,
          headers: { Range: "bytes=0-15", "If-Range": `W/${etag}` },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await _send({
          url,
          headers: { Range: "bytes=0-15", "If-Range": '"stale"' },
        })
      ).body.byteLength,
    ).toBe(4096);
    await _send({ url, method: "PUT", body: Buffer.from("new content") });
    expect((await _send({ url, method: "HEAD" })).headers.etag).not.toBe(etag);
  });

  test("enforces injected signature dates and expiry only when configured", async () => {
    let now = new Date("2026-10-14T12:00:00Z");
    const origin = await _startBucket({
      clock: () => {
        return now;
      },
      enforceSignatureExpiry: true,
    });
    const url = `${origin}/media/photo.jpg`;
    await _send({ url, method: "PUT", body: BODY });
    const signed = `${url}?X-Amz-Date=20261014T120000Z&X-Amz-Expires=3600`;
    expect((await _send({ url: signed })).status).toBe(200);
    now = new Date("2026-10-14T13:00:00Z");
    expect((await _send({ url: signed })).status).toBe(403);
    expect((await _send({ url })).status).toBe(403);
    expect(
      (await _send({ url: `${url}?X-Amz-Date=garbage&X-Amz-Expires=3600` }))
        .status,
    ).toBe(403);
    expect(
      (
        await _send({
          url: `${url}?X-Amz-Date=20261015T120000Z&X-Amz-Expires=3600`,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await _send({
          url: `${url}?X-Amz-Date=20261014T120000Z&X-Amz-Expires=-1`,
        })
      ).status,
    ).toBe(403);
    const permissive = await _startBucket();
    await _send({
      url: `${permissive}/media/photo.jpg`,
      method: "PUT",
      body: BODY,
    });
    expect(
      (
        await _send({
          url: `${permissive}/media/photo.jpg?X-Amz-Date=20200101T000000Z&X-Amz-Expires=1`,
        })
      ).status,
    ).toBe(200);
  });

  test("refuses impossible calendar dates in signed reads", async () => {
    const origin = await _startBucket({
      clock: () => {
        return new Date("2026-03-02T12:00:00Z");
      },
      enforceSignatureExpiry: true,
    });
    await _send({
      url: `${origin}/media/photo.jpg`,
      method: "PUT",
      body: BODY,
    });
    const invalid = await _send({
      url: `${origin}/media/photo.jpg?X-Amz-Date=20260230T120000Z&X-Amz-Expires=3600`,
    });
    expect(invalid.status).toBe(403);
  });

  test("counts bounded response bytes when a throttled reader disconnects", async () => {
    let fulfillTransfer: (transfer: FakeS3Transfer) => void = () => {};
    const transferred = new Promise<FakeS3Transfer>((fulfill) => {
      fulfillTransfer = fulfill;
    });
    const origin = await _startBucket({
      bytesPerSecond: 1024,
      onTransfer: fulfillTransfer,
    });
    const url = `${origin}/media/photo.jpg`;
    await _send({ url, method: "PUT", body: BODY });
    const received = await new Promise<number>((fulfill, reject) => {
      const outgoing = request(url, (response) => {
        response.once("data", (chunk: Buffer) => {
          fulfill(chunk.length);
          response.destroy();
        });
      });
      outgoing.on("error", reject);
      outgoing.end();
    });
    const transfer = await transferred;
    expect(transfer.status).toBe(200);
    expect(transfer.bodyBytes).toBeGreaterThanOrEqual(received);
    expect(transfer.bodyBytes).toBeLessThan(4096);
    expect(transfer.objectId).toBe("photo.jpg");
  });

  test("retains signed response cache overrides on full, partial and conditional responses", async () => {
    const origin = await _startBucket();
    const url = `${origin}/media/photo.jpg?response-cache-control=private%2C%20max-age%3D604800&response-content-disposition=inline`;
    await _send({ url, method: "PUT", body: BODY });
    const full = await _send({ url });
    const partial = await _send({ url, headers: { Range: "bytes=0-15" } });
    const conditional = await _send({
      url,
      headers: { "If-None-Match": String(full.headers.etag) },
    });
    expect(conditional.status).toBe(304);
    [full, partial, conditional].forEach((response) => {
      expect(response.headers["cache-control"]).toBe("private, max-age=604800");
      expect(response.headers["content-disposition"]).toBe("inline");
    });
  });

  test("lists multipart parts and isolates aborts by key and upload ID", async () => {
    const origin = await _startBucket();
    const url = `${origin}/media/video.mp4`;
    const initiated = await _send({ url: `${url}?uploads`, method: "POST" });
    const uploadId = /<UploadId>([^<]+)<\/UploadId>/.exec(
      initiated.body.toString(),
    )?.[1];
    expect(uploadId).toBeDefined();
    const multipart = `${url}?uploadId=${uploadId}`;
    const otherInitiated = await _send({
      url: `${url}?uploads`,
      method: "POST",
    });
    const otherUploadId = /<UploadId>([^<]+)<\/UploadId>/.exec(
      otherInitiated.body.toString(),
    )?.[1];
    const otherMultipart = `${url}?uploadId=${otherUploadId}`;
    await _send({
      url: `${otherMultipart}&partNumber=1`,
      method: "PUT",
      body: Buffer.from("another upload"),
    });
    await _send({
      url: `${multipart}&partNumber=2`,
      method: "PUT",
      body: BODY,
    });
    await _send({
      url: `${multipart}&partNumber=1`,
      method: "PUT",
      body: BODY,
    });
    const parts = await _send({ url: multipart });
    expect(parts.status).toBe(200);
    expect(parts.body.toString()).toMatch(
      /<PartNumber>1<\/PartNumber>[\s\S]*<PartNumber>2<\/PartNumber>/,
    );
    expect(parts.body.toString()).toContain("<Size>4096</Size>");
    const wrong = `${origin}/media/other.mp4?uploadId=${uploadId}`;
    expect((await _send({ url: wrong })).status).toBe(404);
    expect((await _send({ url: wrong, method: "DELETE" })).status).toBe(404);
    expect((await _send({ url: multipart })).status).toBe(200);
    expect((await _send({ url: multipart, method: "DELETE" })).status).toBe(
      204,
    );
    expect((await _send({ url: multipart })).status).toBe(404);
    const otherParts = await _send({ url: otherMultipart });
    expect(otherParts.status).toBe(200);
    expect(otherParts.body.toString()).toContain("<Size>14</Size>");
  });
});
