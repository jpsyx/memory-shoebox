import { describe, expect, it } from "vitest";
import { createFakeB2Client } from "./createFakeB2Client.ts";

const RULE = {
  allowedOrigins: ["https://shoebox.example"],
  allowedMethods: ["PUT", "GET", "HEAD"],
  allowedHeaders: ["content-type"],
  exposeHeaders: ["ETag"],
  maxAgeSeconds: 3600,
};

describe("createFakeB2Client", () => {
  it("records every operation by name, in order", async () => {
    const b2 = createFakeB2Client();

    await b2.presignPut({ key: "a", contentType: "image/jpeg" });
    await b2.headObject({ key: "a" });
    await b2.signParts({ key: "b", uploadId: "u", partNumbers: [2] });

    expect(b2.calls).toEqual(["presignPut", "headObject", "signParts"]);
  });

  it("answers headObject from storedObjects, and null for anything else", async () => {
    const b2 = createFakeB2Client();
    b2.storedObjects.set("uploads/s/f/original.jpg", {
      sizeBytes: 2_400_000,
      contentType: "image/jpeg",
    });

    expect(await b2.headObject({ key: "uploads/s/f/original.jpg" })).toEqual({
      sizeBytes: 2_400_000,
      contentType: "image/jpeg",
    });
    expect(await b2.headObject({ key: "uploads/s/f/thumb.jpg" })).toBeNull();
  });

  it("signs only the parts asked for, under the same upload", async () => {
    const b2 = createFakeB2Client();

    const parts = await b2.signParts({
      key: "uploads/s/f/original.mov",
      uploadId: "upload-1",
      partNumbers: [3, 7],
    });

    expect(
      parts.map((part) => {
        return part.partNumber;
      }),
    ).toEqual([3, 7]);
  });

  it("rejects every network call while unavailable, and still signs", async () => {
    const b2 = createFakeB2Client();
    b2.isUnavailable = true;

    await expect(b2.headObject({ key: "a" })).rejects.toThrow(/unavailable/u);
    await expect(
      b2.completeMultipart({ key: "a", uploadId: "u", parts: [] }),
    ).rejects.toThrow(/unavailable/u);
    await expect(
      b2.presignPut({ key: "a", contentType: "image/jpeg" }),
    ).resolves.toContain("https://b2.test/put/");
  });

  it("lets a test refuse a call through onCall, as a rejection", async () => {
    const b2 = createFakeB2Client();
    b2.onCall = (operation) => {
      throw new Error(`no ${operation} inside a transaction`);
    };

    await expect(b2.headObject({ key: "a" })).rejects.toThrow(
      "no headObject inside a transaction",
    );
  });

  it("keeps the CORS rules it was given, as copies", async () => {
    const b2 = createFakeB2Client();

    await b2.putBucketCors({ rules: [RULE] });
    const rules = await b2.getBucketCors();

    expect(rules).toEqual([RULE]);
    expect(rules[0]).not.toBe(RULE);
    expect(b2.corsRules).toEqual([RULE]);
  });
});
