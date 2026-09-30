import { describe, expect, it } from "vitest";
import { createB2Client } from "../../src/b2/client/client.ts";
import { createTestConfig } from "../helpers/createTestConfig.ts";

function _createClient() {
  return createB2Client(createTestConfig().b2);
}

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

  // Skipped: `presignMultipart` opens the upload against Backblaze before it
  // can sign a part, so it cannot run offline, and this repository holds no
  // Backblaze credentials. The operations that only sign a URL are exercised
  // above; the three that call the API (`presignMultipart`,
  // `completeMultipart`, `abortMultipart`) need a real bucket to cover, and
  // `deleteObject` is exercised through the fake in the drain's own tests.
  it.skip("signs one URL per part of a multipart upload", async () => {
    const started = await _createClient().presignMultipart({
      key: "media/big.mov",
      contentType: "video/quicktime",
      partCount: 3,
    });

    expect(started.partUrls).toHaveLength(3);
    expect(started.partUrls[0]).toContain("partNumber=1");
    expect(started.partUrls[2]).toContain("partNumber=3");
  });
});
