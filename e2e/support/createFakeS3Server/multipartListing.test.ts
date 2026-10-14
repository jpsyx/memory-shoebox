import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { expect, it, onTestFinished } from "vitest";
import { createFakeS3Server } from "./createFakeS3Server.ts";

it("paginates pending uploads by key and upload ID without leaking another prefix", async () => {
  const server = createFakeS3Server({
    bucketName: "bucket",
    allowedOrigins: [],
  });
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
  const endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/bucket`;
  for (const key of [
    "test/output",
    "test/output",
    "test/output-extra",
    "production/output",
  ]) {
    expect(
      (await fetch(`${endpoint}/${key}?uploads`, { method: "POST" })).status,
    ).toBe(200);
  }
  const ids: string[] = [];
  const keys: string[] = [];
  let query = new URLSearchParams({
    uploads: "",
    prefix: "test/output",
    "max-uploads": "1",
  });
  for (let page = 0; page < 3; page++) {
    const response = await fetch(`${endpoint}?${query}`);
    expect(response.status).toBe(200);
    const xml = await response.text();
    const uploadId = /<UploadId>([^<]+)<\/UploadId>/.exec(xml)![1]!;
    const key = /<Key>([^<]+)<\/Key>/.exec(xml)![1]!;
    ids.push(uploadId);
    keys.push(key);
    expect(xml).not.toContain("production/output");
    expect(xml).toContain(`<IsTruncated>${page < 2}</IsTruncated>`);
    query = new URLSearchParams({
      uploads: "",
      prefix: "test/output",
      "max-uploads": "1",
      "key-marker": key,
      "upload-id-marker": uploadId,
    });
  }
  expect(new Set(ids).size).toBe(3);
  expect(keys).toEqual(["test/output", "test/output", "test/output-extra"]);
  expect(await (await fetch(`${endpoint}?${query}`)).text()).not.toContain(
    "<Upload>",
  );
});
