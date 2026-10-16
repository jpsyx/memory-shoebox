import { request } from "node:http";

import { describe, expect, test } from "vitest";

import type {
  FakeS3Request,
  FakeS3Transfer,
} from "../../createFakeS3Server.types.ts";
import {
  BODY,
  installMediaDeliveryTestLifecycle,
  send,
  servers,
  startBucket,
} from "./mediaDeliveryTestHelpers.ts";
installMediaDeliveryTestLifecycle();
describe("fake media delivery", () => {
  test("records started and active media before delayed completion and preserves immutable checkpoints", async () => {
    const origin = await startBucket({ latencyMs: 100 });
    const url = `${origin}/media/checkpoint.jpg`;
    await send({ url, method: "PUT", body: BODY });
    const server = servers.at(-1)!;
    const before = server.getLedger();
    const pending = send({ url });
    await expect
      .poll(() => {
        return server.getLedger().activeRequests;
      })
      .toBe(1);
    const started = server.getLedger();
    const entry = started.requests.at(-1)!;
    expect(entry.requestId).toBe(before.nextRequestId);
    expect(entry.terminal).toBeUndefined();
    expect(entry.bodyBytes).toBe(0);
    await pending;
    await expect
      .poll(() => {
        return server.getLedger().activeRequests;
      })
      .toBe(0);
    const finished = server.getLedger().requests.at(-1)!;
    expect(finished.terminal).toBe("finished");
    expect(finished.bodyBytes).toBe(BODY.length);
    expect(finished.terminalSequence).toBeGreaterThan(finished.startSequence);
    expect(finished.closedAtMs).toBeGreaterThanOrEqual(
      finished.terminatedAtMs!,
    );
    expect(
      finished.chunks.reduce((total, chunk) => {
        return total + chunk.bodyBytes;
      }, 0),
    ).toBe(BODY.length);
    expect(entry.terminal).toBeUndefined();
    expect(entry.bodyBytes).toBe(0);
  });
});
describe("fake media delivery", () => {
  test("serves validators and ranges without excess bytes", async () => {
    const origin = await startBucket();
    const url = `${origin}/media/photo.jpg`;
    const uploaded = await send({ url, method: "PUT", body: BODY });
    const range = await send({ url, headers: { Range: "bytes=0-1023" } });
    expect(range.status).toBe(206);
    expect(range.body.byteLength).toBe(1024);
    expect(range.headers["content-range"]).toBe("bytes 0-1023/4096");
    expect(range.headers["accept-ranges"]).toBe("bytes");
    expect(range.headers.etag).toBe(uploaded.headers.etag);
    const invalid = await send({ url, headers: { Range: "bytes=4096-" } });
    expect(invalid.status).toBe(416);
    expect(invalid.body.byteLength).toBe(0);
    expect(invalid.headers["content-range"]).toBe("bytes */4096");
    const conditional = await send({
      url,
      headers: { "If-None-Match": String(uploaded.headers.etag) },
    });
    expect(conditional.status).toBe(304);
    expect(conditional.body.byteLength).toBe(0);
    const log = await send({ url: `${origin}/__fake-s3/requests` });
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
});
describe("fake media delivery", () => {
  test("serves suffix and open ranges, clamps ends, and leaves HEAD bodiless", async () => {
    const origin = await startBucket();
    const url = `${origin}/media/photo.jpg`;
    await send({ url, method: "PUT", body: BODY });
    const suffix = await send({ url, headers: { Range: "bytes=-32" } });
    expect(suffix.status).toBe(206);
    expect(suffix.body).toEqual(BODY.subarray(-32));
    expect(suffix.headers["content-range"]).toBe("bytes 4064-4095/4096");
    const open = await send({ url, headers: { Range: "bytes=3072-" } });
    expect(open.body.byteLength).toBe(1024);
    const clamped = await send({ url, headers: { Range: "bytes=4000-9000" } });
    expect(clamped.body.byteLength).toBe(96);
    const head = await send({
      url,
      method: "HEAD",
      headers: { Range: "bytes=0-10" },
    });
    expect(head.status).toBe(200);
    expect(head.body.byteLength).toBe(0);
    expect(head.headers["content-length"]).toBe("4096");
    const empty = `${origin}/media/empty`;
    await send({ url: empty, method: "PUT" });
    expect(
      (await send({ url: empty, headers: { Range: "bytes=0-" } })).status,
    ).toBe(416);
  });
});
describe("fake media delivery", () => {
  test("honors conditional precedence, weak validators and strong If-Range", async () => {
    const origin = await startBucket();
    const url = `${origin}/media/photo.jpg`;
    await send({ url, method: "PUT", body: BODY });
    const initial = await send({ url, method: "HEAD" });
    const etag = String(initial.headers.etag);
    const modified = String(initial.headers["last-modified"]);
    expect(
      (
        await send({
          url,
          headers: {
            "If-None-Match": `"other", W/${etag}`,
            Range: "bytes=0-15",
          },
        })
      ).status,
    ).toBe(304);
    expect(
      (await send({ url, headers: { "If-Modified-Since": modified } })).status,
    ).toBe(304);
    expect(
      (
        await send({
          url,
          headers: {
            "If-None-Match": '"other"',
            "If-Modified-Since": modified,
          },
        })
      ).status,
    ).toBe(200);
    expect(
      (await send({ url, headers: { Range: "bytes=0-15", "If-Range": etag } }))
        .body.byteLength,
    ).toBe(16);
    expect(
      (
        await send({
          url,
          headers: { Range: "bytes=0-15", "If-Range": modified },
        })
      ).status,
    ).toBe(206);
    const newerDate = new Date(Date.parse(modified) + 86_400_000).toUTCString();
    const nonmatchingDate = await send({
      url,
      headers: { Range: "bytes=0-15", "If-Range": newerDate },
    });
    expect(nonmatchingDate.status).toBe(200);
    expect(nonmatchingDate.body.byteLength).toBe(4096);
    expect(
      (
        await send({
          url,
          headers: { Range: "bytes=0-15", "If-Range": `W/${etag}` },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await send({
          url,
          headers: { Range: "bytes=0-15", "If-Range": '"stale"' },
        })
      ).body.byteLength,
    ).toBe(4096);
    await send({ url, method: "PUT", body: Buffer.from("new content") });
    expect((await send({ url, method: "HEAD" })).headers.etag).not.toBe(etag);
  });
});
describe("fake media delivery", () => {
  test("counts bounded response bytes when a throttled reader disconnects", async () => {
    let fulfillTransfer: (transfer: FakeS3Transfer) => void = () => {};
    const transferred = new Promise<FakeS3Transfer>((fulfill) => {
      fulfillTransfer = fulfill;
    });
    const origin = await startBucket({
      bytesPerSecond: 1024,
      onTransfer: fulfillTransfer,
    });
    const url = `${origin}/media/photo.jpg`;
    await send({ url, method: "PUT", body: BODY });
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
    const ledger = servers.at(-1)!.getLedger();
    expect(ledger.activeRequests).toBe(0);
    expect(ledger.requests.at(-1)).toMatchObject({
      terminal: "closed-before-finish",
      bodyBytes: transfer.bodyBytes,
    });
  });
});
describe("fake media delivery", () => {
  test("records pre-body disconnect and zero-body HEAD/304 separately", async () => {
    const origin = await startBucket({ latencyMs: 100 });
    const url = `${origin}/media/aborted.jpg`;
    const uploaded = await send({ url, method: "PUT", body: BODY });
    const server = servers.at(-1)!;
    const outgoing = request(url);
    outgoing.on("error", () => {});
    outgoing.end();
    await expect
      .poll(() => {
        return server.getLedger().activeRequests;
      })
      .toBe(1);
    outgoing.destroy();
    await expect
      .poll(() => {
        return server.getLedger().activeRequests;
      })
      .toBe(0);
    expect(server.getLedger().requests.at(-1)).toMatchObject({
      terminal: "closed-before-finish",
      bodyBytes: 0,
    });
    await send({ url, method: "HEAD" });
    await send({
      url,
      headers: { "If-None-Match": String(uploaded.headers.etag) },
    });
    expect(
      server
        .getLedger()
        .requests.slice(-2)
        .map(({ terminal, status, bodyBytes }) => {
          return {
            terminal,
            status,
            bodyBytes,
          };
        }),
    ).toEqual([
      { terminal: "finished", status: 200, bodyBytes: 0 },
      { terminal: "finished", status: 304, bodyBytes: 0 },
    ]);
  });
});
