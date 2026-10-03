import { createClient, startStubBucket } from "./clientTestHelpers.ts";

import { describe, expect, it } from "vitest";
import { appConfig } from "../../../../../../app.config.ts";

describe("createB2Client", () => {
  it("signs a GET for one object", async () => {
    const url = await createClient().presignGet({ key: "media/one.jpg" });

    expect(url).toContain("/memory-shoebox-media/test/media/one.jpg");
    expect(url).toContain("X-Amz-Signature=");
    // The seven-day maximum the docstring promises, so a cached copy stays
    // usable for as long as the URL does.
    expect(url).toContain("X-Amz-Expires=604800");
  });

  it("signs no Content-Disposition when the caller wants none", async () => {
    const url = await createClient().presignGet({ key: "media/one.jpg" });

    expect(new URL(url).searchParams.has("response-content-disposition")).toBe(
      false,
    );
  });

  it("carries a plain filename as both Content-Disposition parameters", async () => {
    const url = await createClient().presignGet({
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
    const url = await createClient().presignGet({
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

    const url = await createClient().presignGet({
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
    const url = await createClient().presignPut({
      key: "media/one.jpg",
      contentType: "image/jpeg",
      expiresInSeconds: 900,
    });

    expect(url).toContain("X-Amz-Signature=");
    expect(url).toContain("X-Amz-Expires=900");
  });

  it("gives an upload URL the configured life when the caller names none", async () => {
    const url = await createClient().presignPut({
      key: "media/one.jpg",
      contentType: "image/jpeg",
    });

    expect(new URL(url).searchParams.get("X-Amz-Expires")).toBe(
      String(appConfig.upload.presignTtlSeconds),
    );
  });

  it("signs the content type, so the browser cannot change it", async () => {
    const url = await createClient().presignPut({
      key: "media/one.jpg",
      contentType: "image/jpeg",
    });

    const signedHeaders = new URL(url).searchParams.get("X-Amz-SignedHeaders");
    expect(signedHeaders?.split(";")).toContain("content-type");
  });

  it("asserts no checksum, because the server never sees the bytes", async () => {
    const url = await createClient().presignPut({
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
    const bucket = await startStubBucket({
      answer: () => {
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
      },
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
      /^\/memory-shoebox-media\/test\/media\/big\.mov\?uploads/u,
    );
    await bucket.close();
  });
});

describe("headObject", () => {
  it("reads the size and type Backblaze stored, without the bytes", async () => {
    const bucket = await startStubBucket({
      answer: () => {
        return {
          status: 200,
          headers: {
            "content-length": "2400000",
            "content-type": "image/jpeg",
          },
        };
      },
    });

    const head = await bucket.client.headObject({
      key: "uploads/s/f/original.jpg",
    });

    expect(head).toEqual({ sizeBytes: 2_400_000, contentType: "image/jpeg" });
    expect(bucket.requests[0]?.method).toBe("HEAD");
    expect(bucket.requests[0]?.url).toBe(
      "/memory-shoebox-media/test/uploads/s/f/original.jpg",
    );
    await bucket.close();
  });

  it("answers null for an object that is not there", async () => {
    const bucket = await startStubBucket({
      answer: () => {
        return { status: 404 };
      },
    });

    expect(
      await bucket.client.headObject({ key: "missing.jpg" }),
    ).toBeUndefined();
    await bucket.close();
  });

  it("rethrows anything that is not a 404, so the route can say 503", async () => {
    const bucket = await startStubBucket({
      answer: () => {
        return { status: 403 };
      },
    });

    await expect(
      bucket.client.headObject({ key: "uploads/s/f/original.jpg" }),
    ).rejects.toThrow();
    await bucket.close();
  });
});

describe("signParts", () => {
  it("signs only the parts asked for, under the upload already open", async () => {
    const parts = await createClient().signParts({
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
    parts.forEach((part) => {
      const parameters = [...new URL(part.url).searchParams.keys()];
      expect(
        parameters.filter((name) => {
          return name.toLowerCase().startsWith("x-amz-checksum");
        }),
      ).toEqual([]);
      expect(parameters).not.toContain("x-amz-sdk-checksum-algorithm");
    });
  });
});
