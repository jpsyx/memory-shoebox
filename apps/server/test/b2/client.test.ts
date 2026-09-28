import { describe, expect, it } from "vitest";
import { createB2Client } from "../../src/b2/client.ts";
import { createTestConfig } from "../helpers/createTestConfig.ts";

function createClient() {
  return createB2Client(createTestConfig().b2);
}

describe("createB2Client", () => {
  it("signs a GET for one object", async () => {
    const url = await createClient().presignGet({ key: "media/one.jpg" });

    expect(url).toContain("/memory-shoebox-media/media/one.jpg");
    expect(url).toContain("X-Amz-Signature=");
    // The seven-day maximum the docstring promises, so a cached copy stays
    // usable for as long as the URL does.
    expect(url).toContain("X-Amz-Expires=604800");
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

  // Skipped: `presignMultipart` opens the upload against Backblaze before it
  // can sign a part, so it cannot run offline, and this repository holds no
  // Backblaze credentials. The operations that only sign a URL are exercised
  // above; the three that call the API (`presignMultipart`,
  // `completeMultipart`, `abortMultipart`) are covered by step 6a against a
  // real bucket, and `deleteObject` is exercised through the fake in Task 12.
  it.skip("signs one URL per part of a multipart upload", async () => {
    const started = await createClient().presignMultipart({
      key: "media/big.mov",
      contentType: "video/quicktime",
      partCount: 3,
    });

    expect(started.partUrls).toHaveLength(3);
    expect(started.partUrls[0]).toContain("partNumber=1");
    expect(started.partUrls[2]).toContain("partNumber=3");
  });
});
