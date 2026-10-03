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
    expect(
      parts.map((part) => {
        return part.url;
      }),
    ).toEqual([
      "https://b2.test/part/uploads%2Fs%2Ff%2Foriginal.mov/upload-1/3",
      "https://b2.test/part/uploads%2Fs%2Ff%2Foriginal.mov/upload-1/7",
    ]);
  });

  it("carries the upload id in every part URL, so a wrong one shows", async () => {
    const b2 = createFakeB2Client();

    const started = await b2.presignMultipart({
      key: "big.mov",
      contentType: "video/quicktime",
      partCount: 2,
    });
    const resigned = await b2.signParts({
      key: "big.mov",
      uploadId: started.uploadId,
      partNumbers: [2],
    });
    const wrong = await b2.signParts({
      key: "big.mov",
      uploadId: "another-upload",
      partNumbers: [2],
    });

    expect(started.partUrls).toEqual([
      `https://b2.test/part/big.mov/${started.uploadId}/1`,
      `https://b2.test/part/big.mov/${started.uploadId}/2`,
    ]);
    expect(resigned[0]?.url).toBe(started.partUrls[1]);
    expect(wrong[0]?.url).not.toBe(started.partUrls[1]);
  });

  it("binds the signed type into the PUT URL", async () => {
    const b2 = createFakeB2Client();

    const heic = await b2.presignPut({
      key: "a/b.heic",
      contentType: "image/heic",
    });
    const jpeg = await b2.presignPut({
      key: "a/b.heic",
      contentType: "image/jpeg",
    });

    expect(new URL(heic).searchParams.get("contentType")).toBe("image/heic");
    expect(new URL(jpeg).searchParams.get("contentType")).toBe("image/jpeg");
    expect(heic).not.toBe(jpeg);
  });

  it("gives every upload it opens an id of its own, even for one key", async () => {
    const b2 = createFakeB2Client();
    const options = {
      key: "uploads/s/f/original.mov",
      contentType: "video/quicktime",
      partCount: 1,
    };

    const first = await b2.presignMultipart(options);
    const second = await b2.presignMultipart(options);

    expect(first.uploadId).not.toBe(second.uploadId);
    expect(first.partUrls).not.toEqual(second.partUrls);
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

  it("keeps headObject and the object listing in step", async () => {
    const b2 = createFakeB2Client();

    await b2.putObject({
      key: "uploads/s/f/thumb.jpg",
      body: new Uint8Array(12),
      contentType: "image/jpeg",
    });

    expect(await b2.headObject({ key: "uploads/s/f/thumb.jpg" })).toEqual({
      sizeBytes: 12,
      contentType: "image/jpeg",
    });
    expect(b2.objects.get("uploads/s/f/thumb.jpg")?.sizeBytes).toBe(12);

    await b2.deleteObject({ key: "uploads/s/f/thumb.jpg" });

    expect(await b2.headObject({ key: "uploads/s/f/thumb.jpg" })).toBeNull();
    expect(b2.objects.has("uploads/s/f/thumb.jpg")).toBe(false);
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

  it("shares no array with the rules it was given or handed out", async () => {
    const b2 = createFakeB2Client();
    const given = {
      ...RULE,
      allowedMethods: [...RULE.allowedMethods],
      exposeHeaders: [...RULE.exposeHeaders],
    };

    await b2.putBucketCors({ rules: [given] });
    given.allowedMethods.push("DELETE");
    const [read] = await b2.getBucketCors();
    read?.exposeHeaders.push("X-Leaked");

    expect(b2.corsRules).toEqual([RULE]);
    expect(await b2.getBucketCors()).toEqual([RULE]);
  });
});
