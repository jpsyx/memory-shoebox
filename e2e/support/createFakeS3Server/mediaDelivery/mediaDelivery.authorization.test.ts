import { describe, expect, test } from "vitest";

import {
  BODY,
  installMediaDeliveryTestLifecycle,
  send,
  startBucket,
} from "./mediaDeliveryTestHelpers.ts";
installMediaDeliveryTestLifecycle();
describe("fake media delivery", () => {
  test("enforces injected signature dates and expiry only when configured", async () => {
    let now = new Date("2026-10-14T12:00:00Z");
    const origin = await startBucket({
      clock: () => {
        return now;
      },
      enforceSignatureExpiry: true,
    });
    const url = `${origin}/media/photo.jpg`;
    await send({ url, method: "PUT", body: BODY });
    const signed = `${url}?X-Amz-Date=20261014T120000Z&X-Amz-Expires=3600`;
    expect((await send({ url: signed })).status).toBe(200);
    now = new Date("2026-10-14T13:00:00Z");
    expect((await send({ url: signed })).status).toBe(403);
    expect((await send({ url })).status).toBe(403);
    expect(
      (await send({ url: `${url}?X-Amz-Date=garbage&X-Amz-Expires=3600` }))
        .status,
    ).toBe(403);
    expect(
      (
        await send({
          url: `${url}?X-Amz-Date=20261015T120000Z&X-Amz-Expires=3600`,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await send({
          url: `${url}?X-Amz-Date=20261014T120000Z&X-Amz-Expires=-1`,
        })
      ).status,
    ).toBe(403);
    const permissive = await startBucket();
    await send({
      url: `${permissive}/media/photo.jpg`,
      method: "PUT",
      body: BODY,
    });
    expect(
      (
        await send({
          url: `${permissive}/media/photo.jpg?X-Amz-Date=20200101T000000Z&X-Amz-Expires=1`,
        })
      ).status,
    ).toBe(200);
  });
});
describe("fake media delivery", () => {
  test("refuses impossible calendar dates in signed reads", async () => {
    const origin = await startBucket({
      clock: () => {
        return new Date("2026-03-02T12:00:00Z");
      },
      enforceSignatureExpiry: true,
    });
    await send({
      url: `${origin}/media/photo.jpg`,
      method: "PUT",
      body: BODY,
    });
    const invalid = await send({
      url: `${origin}/media/photo.jpg?X-Amz-Date=20260230T120000Z&X-Amz-Expires=3600`,
    });
    expect(invalid.status).toBe(403);
  });
});
describe("fake media delivery", () => {
  test("retains signed response cache overrides on full, partial and conditional responses", async () => {
    const origin = await startBucket();
    const url = `${origin}/media/photo.jpg?response-cache-control=private%2C%20max-age%3D604800&response-content-disposition=inline`;
    await send({ url, method: "PUT", body: BODY });
    const full = await send({ url });
    const partial = await send({ url, headers: { Range: "bytes=0-15" } });
    const conditional = await send({
      url,
      headers: { "If-None-Match": String(full.headers.etag) },
    });
    expect(conditional.status).toBe(304);
    [full, partial, conditional].forEach((response) => {
      expect(response.headers["cache-control"]).toBe("private, max-age=604800");
      expect(response.headers["content-disposition"]).toBe("inline");
    });
  });
});
describe("fake media delivery", () => {
  test("lists multipart parts and isolates aborts by key and upload ID", async () => {
    const origin = await startBucket();
    const url = `${origin}/media/video.mp4`;
    const initiated = await send({ url: `${url}?uploads`, method: "POST" });
    const uploadId = /<UploadId>([^<]+)<\/UploadId>/.exec(
      initiated.body.toString(),
    )?.[1];
    expect(uploadId).toBeDefined();
    const multipart = `${url}?uploadId=${uploadId}`;
    const otherInitiated = await send({
      url: `${url}?uploads`,
      method: "POST",
    });
    const otherUploadId = /<UploadId>([^<]+)<\/UploadId>/.exec(
      otherInitiated.body.toString(),
    )?.[1];
    const otherMultipart = `${url}?uploadId=${otherUploadId}`;
    await send({
      url: `${otherMultipart}&partNumber=1`,
      method: "PUT",
      body: Buffer.from("another upload"),
    });
    await send({
      url: `${multipart}&partNumber=2`,
      method: "PUT",
      body: BODY,
    });
    await send({
      url: `${multipart}&partNumber=1`,
      method: "PUT",
      body: BODY,
    });
    const parts = await send({ url: multipart });
    expect(parts.status).toBe(200);
    expect(parts.body.toString()).toMatch(
      /<PartNumber>1<\/PartNumber>[\s\S]*<PartNumber>2<\/PartNumber>/,
    );
    expect(parts.body.toString()).toContain("<Size>4096</Size>");
    const wrong = `${origin}/media/other.mp4?uploadId=${uploadId}`;
    expect((await send({ url: wrong })).status).toBe(404);
    expect((await send({ url: wrong, method: "DELETE" })).status).toBe(404);
    expect((await send({ url: multipart })).status).toBe(200);
    expect((await send({ url: multipart, method: "DELETE" })).status).toBe(204);
    expect((await send({ url: multipart })).status).toBe(404);
    const otherParts = await send({ url: otherMultipart });
    expect(otherParts.status).toBe(200);
    expect(otherParts.body.toString()).toContain("<Size>14</Size>");
  });
});
