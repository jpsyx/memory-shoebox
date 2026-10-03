import { describe, expect, it } from "vitest";
import { appConfig } from "../../../app.config.ts";

/** S3's floor for every multipart part but the last. Backblaze's is the same. */
const S3_MINIMUM_PART_BYTES = 5 * 1024 ** 2;

/** S3's ceiling on the parts of one multipart upload. */
const S3_MAXIMUM_PART_COUNT = 10_000;

/** S3's ceiling on a presigned URL's life: seven days. */
const S3_MAXIMUM_PRESIGN_SECONDS = 604_800;

/**
 * A slow phone connection's upstream, in bytes a second: 256 kbit/s. The
 * floor rate `upload.md` sizes the presign lifetime against.
 */
const FLOOR_UPLOAD_BYTES_PER_SECOND = 32_000;

describe("appConfig.upload", () => {
  const upload = appConfig.upload;

  it("sizes a part at or above S3's minimum", () => {
    expect(upload.multipartPartSizeBytes).toBeGreaterThanOrEqual(
      S3_MINIMUM_PART_BYTES,
    );
  });

  it("only sends multipart a file bigger than one part", () => {
    expect(upload.multipartThresholdBytes).toBeGreaterThan(
      upload.multipartPartSizeBytes,
    );
  });

  it("fits the largest accepted file inside S3's part ceiling", () => {
    expect(
      Math.ceil(upload.maxFileBytes / upload.multipartPartSizeBytes),
    ).toBeLessThanOrEqual(S3_MAXIMUM_PART_COUNT);
  });

  it("gives one part time to cross a slow connection before its URL dies", () => {
    expect(
      upload.multipartPartSizeBytes / FLOOR_UPLOAD_BYTES_PER_SECOND,
    ).toBeLessThan(upload.presignTtlSeconds);
    expect(upload.presignTtlSeconds).toBeLessThanOrEqual(
      S3_MAXIMUM_PRESIGN_SECONDS,
    );
  });

  it("does not call a batch abandoned while its URLs could still be live", () => {
    expect(upload.abandonGraceMinutes * 60).toBeGreaterThanOrEqual(
      upload.presignTtlSeconds,
    );
  });

  it("lists each accepted type once, lowercase, as a media type", () => {
    const types = [...upload.acceptedContentTypes];

    expect(new Set(types).size).toBe(types.length);
    types.forEach((type) => {
      expect(type).toMatch(/^(image|video)\/[a-z0-9.+-]+$/u);
    });
  });

  it("never upscales a thumbnail past the display copy", () => {
    expect(upload.derivatives.thumbLongEdgePx).toBeLessThan(
      upload.derivatives.displayLongEdgePx,
    );
  });
});
