import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { appConfig } from "../../../../app.config.ts";
import { createB2Client, type B2Client } from "../../src/b2/client/client.ts";
import { createTestConfig } from "../helpers/createTestConfig.ts";

function _createClient() {
  return createB2Client(createTestConfig().b2);
}

/** One request the stand-in bucket received. */
type StubRequest = { method: string; url: string; body: string };

/** What the stand-in bucket answers one request with. */
type StubAnswer = {
  status: number;
  headers?: Record<string, string>;
  body?: string;
};

/** A local stand-in for Backblaze, and the real client aimed at it. */
type StubBucket = {
  client: B2Client;
  requests: StubRequest[];
  close: () => Promise<void>;
};

/**
 * Starts an HTTP server on a free local port that answers as Backblaze would,
 * and builds the real client with that server as its endpoint.
 *
 * This is how the operations that call the API are covered offline: the
 * client, its SDK and its XML parsing are all real, and only the far end of
 * the socket is not. The path-style addressing the client already uses is
 * what lets a bare `127.0.0.1` stand in for the bucket's host.
 */
async function _startStubBucket(
  answer: (request: StubRequest) => StubAnswer,
): Promise<StubBucket> {
  const requests: StubRequest[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    request.on("end", () => {
      const received = {
        method: request.method ?? "",
        url: request.url ?? "",
        body: Buffer.concat(chunks).toString("utf8"),
      };
      requests.push(received);
      const reply = answer(received);
      response.writeHead(reply.status, reply.headers);
      response.end(reply.body);
    });
  });
  await new Promise<void>((onListening) => {
    server.listen(0, "127.0.0.1", onListening);
  });
  const { port } = server.address() as AddressInfo;
  const config = createTestConfig({ B2_ENDPOINT: `http://127.0.0.1:${port}` });

  return {
    client: createB2Client(config.b2),
    requests,
    close: () => {
      // The SDK keeps its sockets alive, and `close` waits on them otherwise.
      server.closeAllConnections();
      return new Promise<void>((onClosed) => {
        server.close(() => {
          onClosed();
        });
      });
    },
  };
}

/** A bucket's CORS configuration, as S3 serialises it. */
const CORS_XML = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<CORSConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">',
  "<CORSRule>",
  "<AllowedHeader>content-type</AllowedHeader>",
  "<AllowedMethod>PUT</AllowedMethod>",
  "<AllowedMethod>GET</AllowedMethod>",
  "<AllowedOrigin>https://shoebox.example</AllowedOrigin>",
  "<ExposeHeader>ETag</ExposeHeader>",
  "<MaxAgeSeconds>3600</MaxAgeSeconds>",
  "</CORSRule>",
  "<CORSRule>",
  "<AllowedMethod>GET</AllowedMethod>",
  "<AllowedOrigin>*</AllowedOrigin>",
  "</CORSRule>",
  "</CORSConfiguration>",
].join("");

/** What S3 answers for a bucket that has never had a CORS rule. */
const NO_CORS_XML = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  "<Error><Code>NoSuchCORSConfiguration</Code>",
  "<Message>The CORS configuration does not exist</Message></Error>",
].join("");

describe("createB2Client", () => {
  it("signs a GET for one object", async () => {
    const url = await _createClient().presignGet({ key: "media/one.jpg" });

    expect(url).toContain("/memory-shoebox-media/media/one.jpg");
    expect(url).toContain("X-Amz-Signature=");
    // The seven-day maximum the docstring promises, so a cached copy stays
    // usable for as long as the URL does.
    expect(url).toContain("X-Amz-Expires=604800");
  });

  it("signs no Content-Disposition when the caller wants none", async () => {
    const url = await _createClient().presignGet({ key: "media/one.jpg" });

    expect(new URL(url).searchParams.has("response-content-disposition")).toBe(
      false,
    );
  });

  it("carries a plain filename as both Content-Disposition parameters", async () => {
    const url = await _createClient().presignGet({
      key: "media/one.jpg",
      downloadFilename: "beach-day.jpg",
    });

    const disposition = new URL(url).searchParams.get(
      "response-content-disposition",
    );
    expect(disposition).toBe(
      "attachment; filename=\"beach-day.jpg\"; filename*=UTF-8''beach-day.jpg",
    );
  });

  it("keeps a family member's own filename on filename*, accents and all", async () => {
    const url = await _createClient().presignGet({
      key: "media/one.jpg",
      downloadFilename: "Cumpleaños.jpg",
    });

    const disposition = new URL(url).searchParams.get(
      "response-content-disposition",
    );
    // The plain `filename` is ASCII-only fallback for a client old enough to
    // ignore `filename*`, so the accent is replaced rather than carried raw.
    expect(disposition).toContain('filename="Cumplea_os.jpg"');
    // `filename*` carries the real name, percent-encoded per RFC 5987/8187,
    // which is what every modern client actually shows.
    expect(disposition).toContain("filename*=UTF-8''Cumplea%C3%B1os.jpg");
  });

  it("cannot be used to inject a header into Backblaze's own response", async () => {
    // Whoever uploaded a file chooses its filename, and this server never
    // emits `Content-Disposition` itself: Backblaze does, when it serves the
    // signed URL below, by decoding this exact query parameter and writing it
    // straight back as a response header. A raw quote, backslash, or control
    // character here would either escape the quoted `filename` value or
    // (CR/LF) split Backblaze's response into a header nobody asked for.
    const maliciousFilename =
      'evil".jpg\\; filename="x"\r\nSet-Cookie: pwned=1';

    const url = await _createClient().presignGet({
      key: "media/one.jpg",
      downloadFilename: maliciousFilename,
    });

    const disposition = new URL(url).searchParams.get(
      "response-content-disposition",
    );
    expect(disposition).not.toBeNull();
    // No raw control character (a real CR or LF) anywhere in the value that
    // reaches Backblaze as a header, wherever it came from. The regex names
    // the very characters this test exists to rule out.
    // eslint-disable-next-line no-control-regex
    expect(disposition).not.toMatch(/[\x00-\x1f\x7f]/u);
    // The plain `filename=""` value itself, once unquoted, holds neither an
    // unescaped quote nor a backslash: both would let the attacker's text
    // step outside the quoted string.
    const plainMatch = disposition?.match(/filename="([^"]*)"/u);
    expect(plainMatch).not.toBeNull();
    expect(plainMatch?.[1]).not.toMatch(/["\\]/u);
    // The extended value is still fully recoverable: nothing was silently
    // dropped, it is simply confined to a percent-encoded query value.
    const extMatch = disposition?.match(/filename\*=UTF-8''(.*)$/u);
    expect(extMatch).not.toBeNull();
    expect(decodeURIComponent(extMatch?.[1] ?? "")).toBe(maliciousFilename);
  });

  it("signs a PUT the browser uploads to directly", async () => {
    const url = await _createClient().presignPut({
      key: "media/one.jpg",
      contentType: "image/jpeg",
      expiresInSeconds: 900,
    });

    expect(url).toContain("X-Amz-Signature=");
    expect(url).toContain("X-Amz-Expires=900");
  });

  it("gives an upload URL the configured life when the caller names none", async () => {
    const url = await _createClient().presignPut({
      key: "media/one.jpg",
      contentType: "image/jpeg",
    });

    expect(new URL(url).searchParams.get("X-Amz-Expires")).toBe(
      String(appConfig.upload.presignTtlSeconds),
    );
  });

  it("signs the content type, so the browser cannot change it", async () => {
    const url = await _createClient().presignPut({
      key: "media/one.jpg",
      contentType: "image/jpeg",
    });

    const signedHeaders = new URL(url).searchParams.get("X-Amz-SignedHeaders");
    expect(signedHeaders?.split(";")).toContain("content-type");
  });

  it("asserts no checksum, because the server never sees the bytes", async () => {
    const url = await _createClient().presignPut({
      key: "media/one.jpg",
      contentType: "image/jpeg",
    });

    // The SDK would otherwise compute a checksum at signing time, over the
    // empty body it has in hand, and bake `x-amz-checksum-crc32=AAAAAA==`
    // into a URL the browser then uploads megabytes at.
    const parameters = [...new URL(url).searchParams.keys()];
    expect(
      parameters.filter((name) => {
        return name.toLowerCase().startsWith("x-amz-checksum");
      }),
    ).toEqual([]);
    expect(parameters).not.toContain("x-amz-sdk-checksum-algorithm");
  });

  it("opens one upload and signs one URL per part of it", async () => {
    const bucket = await _startStubBucket(() => {
      return {
        status: 200,
        headers: { "content-type": "application/xml" },
        body: [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<InitiateMultipartUploadResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">',
          "<Bucket>memory-shoebox-media</Bucket>",
          "<Key>media/big.mov</Key>",
          "<UploadId>upload-1</UploadId>",
          "</InitiateMultipartUploadResult>",
        ].join(""),
      };
    });

    const started = await bucket.client.presignMultipart({
      key: "media/big.mov",
      contentType: "video/quicktime",
      partCount: 3,
    });

    expect(started.uploadId).toBe("upload-1");
    expect(started.partUrls).toHaveLength(3);
    expect(started.partUrls[0]).toContain("partNumber=1");
    expect(started.partUrls[2]).toContain("partNumber=3");
    // Opening the upload is the one request that reaches the far end: the
    // part URLs are signed locally.
    expect(bucket.requests).toHaveLength(1);
    expect(bucket.requests[0]?.method).toBe("POST");
    expect(bucket.requests[0]?.url).toMatch(
      /^\/memory-shoebox-media\/media\/big\.mov\?uploads/u,
    );
    await bucket.close();
  });
});

describe("headObject", () => {
  it("reads the size and type Backblaze stored, without the bytes", async () => {
    const bucket = await _startStubBucket(() => {
      return {
        status: 200,
        headers: { "content-length": "2400000", "content-type": "image/jpeg" },
      };
    });

    const head = await bucket.client.headObject({
      key: "uploads/s/f/original.jpg",
    });

    expect(head).toEqual({ sizeBytes: 2_400_000, contentType: "image/jpeg" });
    expect(bucket.requests[0]?.method).toBe("HEAD");
    expect(bucket.requests[0]?.url).toBe(
      "/memory-shoebox-media/uploads/s/f/original.jpg",
    );
    await bucket.close();
  });

  it("answers null for an object that is not there", async () => {
    const bucket = await _startStubBucket(() => {
      return { status: 404 };
    });

    expect(await bucket.client.headObject({ key: "missing.jpg" })).toBeNull();
    await bucket.close();
  });

  it("rethrows anything that is not a 404, so the route can say 503", async () => {
    const bucket = await _startStubBucket(() => {
      return { status: 403 };
    });

    await expect(
      bucket.client.headObject({ key: "uploads/s/f/original.jpg" }),
    ).rejects.toThrow();
    await bucket.close();
  });
});

describe("signParts", () => {
  it("signs only the parts asked for, under the upload already open", async () => {
    const parts = await _createClient().signParts({
      key: "uploads/s/f/original.mov",
      uploadId: "upload-1",
      partNumbers: [3, 7],
    });

    expect(
      parts.map((part) => {
        return part.partNumber;
      }),
    ).toEqual([3, 7]);
    const third = new URL(parts[0]?.url ?? "");
    expect(third.searchParams.get("uploadId")).toBe("upload-1");
    expect(third.searchParams.get("partNumber")).toBe("3");
    expect(third.searchParams.get("X-Amz-Expires")).toBe(
      String(appConfig.upload.presignTtlSeconds),
    );
    // The same rule as `presignPut`: a part URL must not assert a checksum
    // for bytes the server never saw.
    for (const part of parts) {
      const parameters = [...new URL(part.url).searchParams.keys()];
      expect(
        parameters.filter((name) => {
          return name.toLowerCase().startsWith("x-amz-checksum");
        }),
      ).toEqual([]);
      expect(parameters).not.toContain("x-amz-sdk-checksum-algorithm");
    }
  });
});

describe("getBucketCors", () => {
  it("maps S3's rules onto this codebase's spelling", async () => {
    const bucket = await _startStubBucket(() => {
      return {
        status: 200,
        headers: { "content-type": "application/xml" },
        body: CORS_XML,
      };
    });

    expect(await bucket.client.getBucketCors()).toEqual([
      {
        allowedOrigins: ["https://shoebox.example"],
        allowedMethods: ["PUT", "GET"],
        allowedHeaders: ["content-type"],
        exposeHeaders: ["ETag"],
        maxAgeSeconds: 3600,
      },
      {
        allowedOrigins: ["*"],
        allowedMethods: ["GET"],
        allowedHeaders: [],
        exposeHeaders: [],
        maxAgeSeconds: 0,
      },
    ]);
    await bucket.close();
  });

  it("answers no rules for a bucket that has none", async () => {
    const bucket = await _startStubBucket(() => {
      return {
        status: 404,
        headers: { "content-type": "application/xml" },
        body: NO_CORS_XML,
      };
    });

    expect(await bucket.client.getBucketCors()).toEqual([]);
    await bucket.close();
  });
});

describe("putBucketCors", () => {
  it("sends every field of every rule to the bucket's cors resource", async () => {
    const bucket = await _startStubBucket(() => {
      return { status: 200 };
    });

    await bucket.client.putBucketCors({
      rules: [
        {
          allowedOrigins: ["https://shoebox.example"],
          allowedMethods: ["PUT", "GET", "HEAD"],
          allowedHeaders: ["content-type"],
          exposeHeaders: ["ETag"],
          maxAgeSeconds: 3600,
        },
      ],
    });

    const sent = bucket.requests[0];
    expect(sent?.method).toBe("PUT");
    expect(sent?.url).toMatch(/^\/memory-shoebox-media\/\?cors/u);
    expect(sent?.body).toContain(
      "<AllowedOrigin>https://shoebox.example</AllowedOrigin>",
    );
    expect(sent?.body).toContain("<AllowedMethod>HEAD</AllowedMethod>");
    expect(sent?.body).toContain("<AllowedHeader>content-type</AllowedHeader>");
    expect(sent?.body).toContain("<ExposeHeader>ETag</ExposeHeader>");
    expect(sent?.body).toContain("<MaxAgeSeconds>3600</MaxAgeSeconds>");
    await bucket.close();
  });
});
