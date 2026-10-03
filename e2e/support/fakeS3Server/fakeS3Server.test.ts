import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFakeS3Server, type FakeS3Request } from "./fakeS3Server.ts";

const BUCKET = "memory-shoebox-media";
const PAGE_ORIGIN = "http://localhost:8099";
const MIB = 1024 * 1024;

/** One part as a completion lists it. */
type PartListing = { partNumber: number; etag: string };

const server = createFakeS3Server({
  bucketName: BUCKET,
  allowedOrigins: [PAGE_ORIGIN],
});
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
function _objectUrl(key: string, query = ""): string {
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
async function _putPart(options: {
  key: string;
  uploadId: string;
  partNumber: number;
  body: Uint8Array<ArrayBuffer>;
}): Promise<string> {
  const query = `&partNumber=${options.partNumber}&uploadId=${options.uploadId}&x-id=UploadPart`;
  const response = await fetch(_objectUrl(options.key, query), {
    method: "PUT",
    body: options.body,
  });
  return response.headers.get("ETag") ?? "";
}

/**
 * The body `@aws-sdk/client-s3` sends for `CompleteMultipartUpload`, byte for
 * byte: captured from the SDK the server uses, against a logging server. ETag
 * comes before PartNumber, and its quotes are `&quot;` entities.
 */
function _completeBodyAsTheSdkSendsIt(parts: readonly PartListing[]): string {
  const partXml = parts
    .map((part) => {
      const etag = part.etag.replaceAll('"', "&quot;");
      return `<Part><ETag>${etag}</ETag><PartNumber>${part.partNumber}</PartNumber></Part>`;
    })
    .join("");
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<CompleteMultipartUpload xmlns="http://s3.amazonaws.com/doc/2006-03-01/">' +
    `${partXml}</CompleteMultipartUpload>`
  );
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
      body: _completeBodyAsTheSdkSendsIt(options.parts),
    },
  );
}

/** Everything the stand-in has answered so far. */
async function _requestLog(): Promise<FakeS3Request[]> {
  const response = await fetch(`${baseUrl}/__fake-s3/requests`);
  return ((await response.json()) as { requests: FakeS3Request[] }).requests;
}

describe("the single PUT", () => {
  it("stores the bytes and the type, and HEAD and GET read them back", async () => {
    const key = "uploads/s/f/original.jpg";
    const put = await fetch(_objectUrl(key, "&x-id=PutObject"), {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
      body: new Uint8Array([1, 2, 3, 4]),
    });
    expect(put.status).toBe(200);
    expect(put.headers.get("ETag")).toMatch(/^"[0-9a-f]{32}"$/);

    const head = await fetch(_objectUrl(key), { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(head.headers.get("Content-Length")).toBe("4");
    expect(head.headers.get("Content-Type")).toBe("image/jpeg");

    const get = await fetch(_objectUrl(key, "&x-id=GetObject"));
    expect(new Uint8Array(await get.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3, 4]),
    );
  });

  it("answers HEAD on a missing key with a bodiless 404", async () => {
    const head = await fetch(_objectUrl("uploads/none"), { method: "HEAD" });
    expect(head.status).toBe(404);
    expect(await head.text()).toBe("");
  });
});

describe("the multipart upload", () => {
  it("joins the parts the SDK's own XML lists, in that order", async () => {
    const key = "uploads/s/big/original.mp4";
    const uploadId = await _openUpload(key);
    const first = new Uint8Array(5 * MIB).fill(7);
    const second = new Uint8Array([9, 9, 9]);
    const parts = [
      {
        partNumber: 1,
        etag: await _putPart({ key, uploadId, partNumber: 1, body: first }),
      },
      {
        partNumber: 2,
        etag: await _putPart({ key, uploadId, partNumber: 2, body: second }),
      },
    ];

    const complete = await _complete({ key, uploadId, parts });
    expect(complete.status).toBe(200);
    expect(await complete.text()).toContain("<CompleteMultipartUploadResult");

    const head = await fetch(_objectUrl(key), { method: "HEAD" });
    expect(head.headers.get("Content-Length")).toBe(String(5 * MIB + 3));
    expect(head.headers.get("Content-Type")).toBe("video/mp4");
    expect(head.headers.get("ETag")).toMatch(/-2"$/);
  });

  it("refuses an ETag that names no part, as S3 does", async () => {
    const key = "uploads/s/wrong/original.mp4";
    const uploadId = await _openUpload(key);
    await _putPart({ key, uploadId, partNumber: 1, body: new Uint8Array([1]) });

    const complete = await _complete({
      key,
      uploadId,
      parts: [{ partNumber: 1, etag: '"00000000000000000000000000000000"' }],
    });
    expect(complete.status).toBe(400);
    expect(await complete.text()).toContain("<Code>InvalidPart</Code>");
  });

  it("refuses a part under 5 MiB that is not the last", async () => {
    const key = "uploads/s/small/original.mp4";
    const uploadId = await _openUpload(key);
    const small = new Uint8Array([1]);
    const parts = [
      {
        partNumber: 1,
        etag: await _putPart({ key, uploadId, partNumber: 1, body: small }),
      },
      {
        partNumber: 2,
        etag: await _putPart({ key, uploadId, partNumber: 2, body: small }),
      },
    ];

    const complete = await _complete({ key, uploadId, parts });
    expect(await complete.text()).toContain("<Code>EntityTooSmall</Code>");
  });

  it("aborts an open upload once, and 404s the second time", async () => {
    const key = "uploads/s/abort/original.mp4";
    const uploadId = await _openUpload(key);
    const url = `${baseUrl}/${BUCKET}/${key}?uploadId=${uploadId}&x-id=AbortMultipartUpload`;
    expect((await fetch(url, { method: "DELETE" })).status).toBe(204);
    expect((await fetch(url, { method: "DELETE" })).status).toBe(404);
  });
});

describe("CORS, as the bucket's rule allows it", () => {
  it("answers a preflight from an allowed origin with what it asked for", async () => {
    const preflight = await fetch(_objectUrl("uploads/s/f/original.jpg"), {
      method: "OPTIONS",
      headers: {
        Origin: PAGE_ORIGIN,
        "Access-Control-Request-Method": "PUT",
        "Access-Control-Request-Headers": "content-type",
      },
    });
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
    const strangeOrigin = await fetch(_objectUrl("k"), {
      method: "OPTIONS",
      headers: {
        Origin: "http://example.invalid",
        "Access-Control-Request-Method": "PUT",
      },
    });
    const strangeHeader = await fetch(_objectUrl("k"), {
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

  it("exposes ETag on the PUT itself, so a browser can read a part's", async () => {
    const put = await fetch(_objectUrl("uploads/s/cors/original.jpg"), {
      method: "PUT",
      headers: { Origin: PAGE_ORIGIN, "Content-Type": "image/jpeg" },
      body: new Uint8Array([1]),
    });
    expect(put.headers.get("Access-Control-Allow-Origin")).toBe(PAGE_ORIGIN);
    expect(put.headers.get("Access-Control-Expose-Headers")).toBe("ETag");
  });
});

describe("the request log", () => {
  it("names each S3 operation it answered, with the key and the part", async () => {
    const operations = (await _requestLog()).map((request) => {
      const part = request.partNumber === null ? "" : ` ${request.partNumber}`;
      return `${request.operation} ${request.key}${part}`;
    });
    const key = "uploads/s/big/original.mp4";
    expect(operations).toContain(`CreateMultipartUpload ${key}`);
    expect(operations).toContain(`UploadPart ${key} 2`);
    expect(operations).toContain(`CompleteMultipartUpload ${key}`);
    expect(operations).toContain("PutObject uploads/s/f/original.jpg");
  });

  it("answers what the upload flow never makes with a 501", async () => {
    const list = await fetch(`${baseUrl}/${BUCKET}?list-type=2`);
    const cors = await fetch(`${baseUrl}/${BUCKET}?cors=`, { method: "PUT" });
    expect(list.status).toBe(501);
    expect(cors.status).toBe(501);
  });
});
