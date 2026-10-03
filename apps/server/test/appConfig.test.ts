import { describe, expect, it } from "vitest";
import { appConfig } from "../../../app.config.ts";

/**
 * S3's floor for every multipart part but the last. Backblaze's is the
 * same.
 */
const S3_MINIMUM_PART_BYTES = 5 * 1024 ** 2;

/** S3's ceiling on the parts of one multipart upload. */
const S3_MAXIMUM_PART_COUNT = 10_000;

/** S3's ceiling on the size of one single-PUT object: 5 GiB. */
const S3_MAXIMUM_SINGLE_PUT_BYTES = 5 * 1024 ** 3;

/** S3's ceiling on a presigned URL's life: seven days. */
const S3_MAXIMUM_PRESIGN_SECONDS = 604_800;

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

  it("keeps a single PUT inside S3's single-object ceiling", () => {
    expect(upload.multipartThresholdBytes).toBeLessThanOrEqual(
      S3_MAXIMUM_SINGLE_PUT_BYTES,
    );
  });

  it("fits the largest accepted file inside S3's part ceiling", () => {
    expect(
      Math.ceil(upload.maxFileBytes / upload.multipartPartSizeBytes),
    ).toBeLessThanOrEqual(S3_MAXIMUM_PART_COUNT);
  });

  it("gives one part time to cross a slow connection before its URL dies", () => {
    expect(
      upload.multipartPartSizeBytes / upload.transferFloorBytesPerSecond,
    ).toBeLessThan(upload.presignTtlSeconds);
    expect(upload.presignTtlSeconds).toBeLessThanOrEqual(
      S3_MAXIMUM_PRESIGN_SECONDS,
    );
  });

  it("lets a single PUT land before the abandon sweep would fail it", () => {
    expect(
      upload.multipartThresholdBytes / upload.transferFloorBytesPerSecond,
    ).toBeLessThan(upload.abandonGraceMinutes * 60);
  });

  it("does not call a batch abandoned while its URLs could still be live", () => {
    expect(upload.abandonGraceMinutes * 60).toBeGreaterThanOrEqual(
      upload.presignTtlSeconds,
    );
  });

  it("stops waiting out an offline browser well inside the abandon grace", () => {
    expect(upload.offlineWaitCeilingMinutes).toBeGreaterThan(0);
    expect(upload.offlineWaitCeilingMinutes * 2).toBeLessThanOrEqual(
      upload.abandonGraceMinutes,
    );
  });

  it("lists each accepted type once, lowercase, as a media type", () => {
    const types = [...upload.acceptedContentTypes];

    expect(new Set(types).size).toBe(types.length);
    types.forEach((type) => {
      expect(type).toMatch(/^(image|video)\/[a-z0-9.+-]+$/u);
    });
  });

  it("caps a derivative well above what a 2048 px JPEG needs, and below a multipart file", () => {
    // The spike's largest derivative was under 2 MB.
    expect(upload.derivatives.maxBytes).toBeGreaterThanOrEqual(4 * 1024 ** 2);
    expect(upload.derivatives.maxBytes).toBeLessThan(
      upload.multipartThresholdBytes,
    );
  });

  it("makes the thumbnail smaller than the display copy", () => {
    expect(upload.derivatives.thumbLongEdgePx).toBeLessThan(
      upload.derivatives.displayLongEdgePx,
    );
  });
});
