import {
  type PutPartOptions,
  BUCKET,
  KEY_PREFIX,
  MIB,
  type PartListing,
  server,
  completeBodyAsTheSdkSendsIt,
} from "../../fakeS3Server/__tests__/completeBodyAsTheSdkSendsIt.ts";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createB2Client } from "../../../../apps/server/src/b2/createB2Client/createB2Client.ts";
import { makeDownloadDispositionFromFilename } from "../../../../apps/server/src/b2/createB2Client/makeDownloadDispositionFromFilename.ts";

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

describe("the single PUT", () => {
  it("stores the bytes and the type, and HEAD and GET read them back", async () => {
    const key = "uploads/s/f/original.jpg";
    const put = await fetch(
      _objectUrl({ key: key, query: "&x-id=PutObject" }),
      {
        method: "PUT",
        headers: { "Content-Type": "image/jpeg" },
        body: new Uint8Array([1, 2, 3, 4]),
      },
    );
    expect(put.status).toBe(200);
    expect(put.headers.get("ETag")).toMatch(/^"[0-9a-f]{32}"$/);

    const head = await fetch(_objectUrl({ key: key }), { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(head.headers.get("Content-Length")).toBe("4");
    expect(head.headers.get("Content-Type")).toBe("image/jpeg");
    // Range is not supported, so the stand-in does not claim it is.
    expect(head.headers.get("Accept-Ranges")).toBeNull();

    const get = await fetch(_objectUrl({ key: key, query: "&x-id=GetObject" }));
    expect(new Uint8Array(await get.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3, 4]),
    );
  });

  it("answers HEAD on a missing key with a bodiless 404", async () => {
    const head = await fetch(_objectUrl({ key: "uploads/none" }), {
      method: "HEAD",
    });
    expect(head.status).toBe(404);
    expect(await head.text()).toBe("");
  });
});

describe("a signed read, as the server's own B2 client makes it", () => {
  // A client of the server's own, pointed at this stand-in.
  const _makeB2Client = (): ReturnType<typeof createB2Client> => {
    return createB2Client({
      keyId: "key-id",
      applicationKey: "application-key",
      bucket: BUCKET,
      endpoint: baseUrl,
      region: "us-west-004",
      thumbnailPrefix: ".t",
      keyPrefix: KEY_PREFIX,
    });
  };

  it("answers a GET of a presignGet URL with the cache header it signed", async () => {
    const key = "uploads/s/read/thumb.jpg";
    // The client signs the prefixed key, so that is where the object must be.
    await fetch(_objectUrl({ key: `${KEY_PREFIX}/${key}` }), {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
      body: new Uint8Array([5, 6, 7]),
    });

    const url = await _makeB2Client().presignGet({ key });
    const response = await fetch(url);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      "private, max-age=604800",
    );
    expect(response.headers.get("Content-Disposition")).toBeNull();
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([5, 6, 7]),
    );
  });

  it("adds the download name when one is signed in", async () => {
    const key = "uploads/s/read/original.jpg";
    await fetch(_objectUrl({ key: `${KEY_PREFIX}/${key}` }), {
      method: "PUT",
      body: new Uint8Array([1]),
    });

    const filename = 'Caf\u00e9 "beach", day 1.jpg';
    const url = await _makeB2Client().presignGet({
      key,
      downloadFilename: filename,
    });
    const response = await fetch(url);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      "private, max-age=604800",
    );
    expect(response.headers.get("Content-Disposition")).toBe(
      makeDownloadDispositionFromFilename(filename),
    );
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

    const head = await fetch(_objectUrl({ key: key }), { method: "HEAD" });
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
    expect(complete.status).toBe(400);
    expect(await complete.text()).toContain("<Code>EntityTooSmall</Code>");
  });

  it("refuses parts out of order or repeated, and stays open for a corrected list", async () => {
    const key = "uploads/s/order/original.mp4";
    const uploadId = await _openUpload(key);
    const first = {
      partNumber: 1,
      etag: await _putPart({
        key,
        uploadId,
        partNumber: 1,
        body: new Uint8Array(5 * MIB),
      }),
    };
    const second = {
      partNumber: 2,
      etag: await _putPart({
        key,
        uploadId,
        partNumber: 2,
        body: new Uint8Array([1]),
      }),
    };

    for (const parts of [
      [second, first],
      [first, first],
    ]) {
      const refused = await _complete({ key, uploadId, parts });
      expect(refused.status).toBe(400);
      expect(await refused.text()).toContain("<Code>InvalidPartOrder</Code>");
    }
    const corrected = await _complete({
      key,
      uploadId,
      parts: [first, second],
    });
    expect(corrected.status).toBe(200);
  });

  it("answers NoSuchUpload for a completion or a part once it is completed", async () => {
    const key = "uploads/s/done/original.mp4";
    const { uploadId, parts } = await _openUploadWithOnePart(key);
    expect((await _complete({ key, uploadId, parts })).status).toBe(200);

    const again = await _complete({ key, uploadId, parts });
    expect(again.status).toBe(404);
    expect(await again.text()).toContain("<Code>NoSuchUpload</Code>");

    const late = await fetch(
      _objectUrl({
        key: key,
        query: `&partNumber=2&uploadId=${uploadId}&x-id=UploadPart`,
      }),
      { method: "PUT", body: new Uint8Array([1]) },
    );
    expect(late.status).toBe(404);
    expect(await late.text()).toContain("<Code>NoSuchUpload</Code>");
  });

  it("answers NoSuchUpload for a part, and a completion, once it is aborted", async () => {
    const key = "uploads/s/aborted/original.mp4";
    const { uploadId, parts } = await _openUploadWithOnePart(key);
    const abort = await fetch(
      `${baseUrl}/${BUCKET}/${key}?uploadId=${uploadId}&x-id=AbortMultipartUpload`,
      { method: "DELETE" },
    );
    expect(abort.status).toBe(204);

    const late = await fetch(
      _objectUrl({
        key: key,
        query: `&partNumber=2&uploadId=${uploadId}&x-id=UploadPart`,
      }),
      { method: "PUT", body: new Uint8Array([1]) },
    );
    expect(late.status).toBe(404);
    expect(await late.text()).toContain("<Code>NoSuchUpload</Code>");
    expect((await _complete({ key, uploadId, parts })).status).toBe(404);
  });

  it("aborts an open upload once, and 404s the second time", async () => {
    const key = "uploads/s/abort/original.mp4";
    const uploadId = await _openUpload(key);
    const url = `${baseUrl}/${BUCKET}/${key}?uploadId=${uploadId}&x-id=AbortMultipartUpload`;
    expect((await fetch(url, { method: "DELETE" })).status).toBe(204);
    expect((await fetch(url, { method: "DELETE" })).status).toBe(404);
  });
});
