import {
  type PutPartOptions,
  BUCKET,
  PAGE_ORIGIN,
  type PartListing,
  server,
  completeBodyAsTheSdkSendsIt,
} from "../../fakeS3Server/__tests__/completeBodyAsTheSdkSendsIt.ts";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type FakeS3Request } from "../createFakeS3Server.types.ts";

let baseUrl = "";

beforeAll(async () => {
  await new Promise<void>((resolvePromise) => {
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolvePromise) => {
    server.close(() => {
      resolvePromise();
    });
  });
});

/** A path-style object URL, with the query a presigned URL would carry. */
function _objectUrl(
  functionOptions: Readonly<{ key: string; query?: string }>,
): string {
  const { key, query = "" } = functionOptions;

  return `${baseUrl}/${BUCKET}/${key}?X-Amz-Signature=ignored${query}`;
}

/** Opens a multipart upload the way the SDK does, and returns its id. */
async function _openUpload(key: string): Promise<string> {
  const response = await fetch(`${baseUrl}/${BUCKET}/${key}?uploads=`, {
    method: "POST",
    headers: { "Content-Type": "video/mp4" },
  });
  const xml = await response.text();
  return /<UploadId>(.+)<\/UploadId>/.exec(xml)?.[1] ?? "";
}

/** Puts one part at its presigned URL and returns the ETag header, quoted. */
async function _putPart(options: PutPartOptions): Promise<string> {
  const query = `&partNumber=${options.partNumber}&uploadId=${options.uploadId}&x-id=UploadPart`;
  const response = await fetch(_objectUrl({ key: options.key, query: query }), {
    method: "PUT",
    body: options.body,
  });
  return response.headers.get("ETag") ?? "";
}

/** Posts a completion for one upload. */
function _complete(options: {
  key: string;
  uploadId: string;
  parts: readonly PartListing[];
}): Promise<Response> {
  return fetch(
    `${baseUrl}/${BUCKET}/${options.key}?uploadId=${options.uploadId}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/xml" },
      body: completeBodyAsTheSdkSendsIt(options.parts),
    },
  );
}

/** Opens an upload and puts one small part, which is its only and last. */
async function _openUploadWithOnePart(key: string): Promise<{
  uploadId: string;
  parts: PartListing[];
}> {
  const uploadId = await _openUpload(key);
  const etag = await _putPart({
    key,
    uploadId,
    partNumber: 1,
    body: new Uint8Array([1, 2, 3]),
  });
  return { uploadId, parts: [{ partNumber: 1, etag }] };
}

/** Everything the stand-in has answered so far. */
async function _requestLog(): Promise<FakeS3Request[]> {
  const response = await fetch(`${baseUrl}/__fake-s3/requests`);
  return ((await response.json()) as { requests: FakeS3Request[] }).requests;
}

describe("CORS, as the bucket's rule allows it", () => {
  it("answers a preflight from an allowed origin with what it asked for", async () => {
    const preflight = await fetch(
      _objectUrl({ key: "uploads/s/f/original.jpg" }),
      {
        method: "OPTIONS",
        headers: {
          Origin: PAGE_ORIGIN,
          "Access-Control-Request-Method": "PUT",
          "Access-Control-Request-Headers": "content-type",
        },
      },
    );
    expect(preflight.status).toBe(200);
    expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe(
      PAGE_ORIGIN,
    );
    expect(preflight.headers.get("Access-Control-Allow-Methods")).toBe("PUT");
    expect(preflight.headers.get("Access-Control-Allow-Headers")).toBe(
      "content-type",
    );
  });

  it("refuses another origin, and a header the rule does not allow", async () => {
    const strangeOrigin = await fetch(_objectUrl({ key: "k" }), {
      method: "OPTIONS",
      headers: {
        Origin: "http://example.invalid",
        "Access-Control-Request-Method": "PUT",
      },
    });
    const strangeHeader = await fetch(_objectUrl({ key: "k" }), {
      method: "OPTIONS",
      headers: {
        Origin: PAGE_ORIGIN,
        "Access-Control-Request-Method": "PUT",
        "Access-Control-Request-Headers": "content-type, x-amz-checksum-crc32",
      },
    });
    expect(strangeOrigin.status).toBe(403);
    expect(strangeOrigin.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(strangeHeader.status).toBe(403);
  });

  it("refuses a method the rule does not allow", async () => {
    const preflight = await fetch(_objectUrl({ key: "k" }), {
      method: "OPTIONS",
      headers: {
        Origin: PAGE_ORIGIN,
        "Access-Control-Request-Method": "DELETE",
      },
    });
    expect(preflight.status).toBe(403);
  });

  it("exposes ETag on the PUT itself, so a browser can read a part's", async () => {
    const put = await fetch(
      _objectUrl({ key: "uploads/s/cors/original.jpg" }),
      {
        method: "PUT",
        headers: { Origin: PAGE_ORIGIN, "Content-Type": "image/jpeg" },
        body: new Uint8Array([1]),
      },
    );
    expect(put.headers.get("Access-Control-Allow-Origin")).toBe(PAGE_ORIGIN);
    expect(put.headers.get("Access-Control-Expose-Headers")).toBe("ETag");
  });
});

describe("the request log", () => {
  it("names each operation it answered, with the key, the part and the status", async () => {
    const multipartKey = "uploads/s/logged/original.mp4";
    const putKey = "uploads/s/logged/original.jpg";
    const { uploadId, parts } = await _openUploadWithOnePart(multipartKey);
    await _complete({
      key: multipartKey,
      uploadId,
      parts: [{ partNumber: 1, etag: '"00000000000000000000000000000000"' }],
    });
    await _complete({ key: multipartKey, uploadId, parts });
    await fetch(_objectUrl({ key: putKey, query: "&x-id=PutObject" }), {
      method: "PUT",
      body: new Uint8Array([1]),
    });

    const lines = (await _requestLog())
      .filter((request) => {
        return request.key === multipartKey || request.key === putKey;
      })
      .map((request) => {
        const part =
          request.partNumber === null ? "" : ` part ${request.partNumber}`;
        return `${request.operation} ${request.key}${part} ${request.status}`;
      });
    expect(lines).toEqual([
      `CreateMultipartUpload ${multipartKey} 200`,
      `UploadPart ${multipartKey} part 1 200`,
      `CompleteMultipartUpload ${multipartKey} 400`,
      `CompleteMultipartUpload ${multipartKey} 200`,
      `PutObject ${putKey} 200`,
    ]);
  });

  it("answers what the upload flow never makes with a 501", async () => {
    const list = await fetch(`${baseUrl}/${BUCKET}?list-type=2`);
    const cors = await fetch(`${baseUrl}/${BUCKET}?cors=`, { method: "PUT" });
    expect(list.status).toBe(501);
    expect(cors.status).toBe(501);
  });

  it("answers a parameter the flow never sends, and a copy, with a 501", async () => {
    const key = "uploads/s/unsupported/original.jpg";
    const tagging = await fetch(_objectUrl({ key: key, query: "&tagging=" }), {
      method: "PUT",
      body: new Uint8Array([1]),
    });
    const version = await fetch(
      _objectUrl({ key: key, query: "&versionId=abc" }),
    );
    const copy = await fetch(_objectUrl({ key: key }), {
      method: "PUT",
      headers: { "x-amz-copy-source": `/${BUCKET}/uploads/s/f/original.jpg` },
    });
    expect([tagging.status, version.status, copy.status]).toEqual([
      501, 501, 501,
    ]);

    const stored = await fetch(_objectUrl({ key: key }), { method: "HEAD" });
    expect(stored.status).toBe(404);
    const logged = (await _requestLog()).filter((request) => {
      return request.key === key && request.operation !== "HeadObject";
    });
    expect(
      logged.map((request) => {
        return `${request.operation} ${request.status}`;
      }),
    ).toEqual(["Unsupported 501", "Unsupported 501", "Unsupported 501"]);
  });
});
