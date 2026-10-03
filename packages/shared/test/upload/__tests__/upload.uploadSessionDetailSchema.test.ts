import {
  FILE_ID,
  MEMBER_ID,
  HASH,
  FILE,
  DRAFT_DETAIL,
  ENTRY,
} from "./uploadTestFixtures.constants.ts";
import { describe, expect, it } from "vitest";

import {
  putUploadManifestRequestSchema,
  uploadSessionDetailQuerySchema,
} from "../../../src/upload/uploadSessionRequestSchemas.constants.ts";
import { completeUploadFileRequestSchema } from "../../../src/upload/uploadCompletionSchemas.constants.ts";
import { setUploadVisibilityRequestSchema } from "../../../src/upload/uploadEditSchemas.constants.ts";
import { manifestEntrySchema } from "../../../src/upload/uploadManifestSchemas.constants.ts";
import {
  presignUploadFileRequestSchema,
  presignUploadFileResponseSchema,
} from "../../../src/upload/uploadPresignSchemas.constants.ts";
import {
  uploadFileDtoSchema,
  uploadSessionDetailSchema,
} from "../../../src/upload/uploadDetailSchemas.constants.ts";

describe("uploadSessionDetailSchema", () => {
  it("accepts a draft with one file and no plan yet", () => {
    expect(uploadSessionDetailSchema.parse(DRAFT_DETAIL).files).toHaveLength(1);
  });

  it("accepts a settled batch with its outcome", () => {
    const parsed = uploadSessionDetailSchema.parse({
      ...DRAFT_DETAIL,
      state: "settled",
      committedAt: "2026-09-27T10:05:00.000Z",
      settledAt: "2026-09-27T10:30:00.000Z",
      summary: {
        itemCount: 262,
        dayCount: 3,
        milestoneCount: 1,
        burstCount: 1,
        burstFrameCount: 45,
        notifiedMemberCount: 7,
      },
    });

    expect(parsed.summary?.burstFrameCount).toBe(45);
  });

  it("refuses a state the session table cannot hold", () => {
    expect(
      uploadSessionDetailSchema.safeParse({ ...DRAFT_DETAIL, state: "open" })
        .success,
    ).toBe(false);
  });
});

describe("uploadFileDtoSchema", () => {
  it("refuses a hash that is not lowercase hex", () => {
    expect(
      uploadFileDtoSchema.safeParse({ ...FILE, contentHash: "A".repeat(64) })
        .success,
    ).toBe(false);
  });

  it("refuses a problem code that is not in the enum", () => {
    expect(
      uploadFileDtoSchema.safeParse({ ...FILE, problemCode: "network" })
        .success,
    ).toBe(false);
  });
});

describe("manifestEntrySchema", () => {
  it("takes evidence the ladder will reject rather than refusing the file", () => {
    const parsed = manifestEntrySchema.parse({
      ...ENTRY,
      capture: { exifCapturedAtLocal: "0000:00:00 00:00:00" },
    });

    expect(parsed.capture?.exifCapturedAtLocal).toBe("0000:00:00 00:00:00");
  });

  it("bounds lastModifiedAt at sixty-four characters", () => {
    const evidenceAt = (length: number) => {
      return { ...ENTRY, capture: { lastModifiedAt: "x".repeat(length) } };
    };

    expect(manifestEntrySchema.safeParse(evidenceAt(64)).success).toBe(true);
    expect(manifestEntrySchema.safeParse(evidenceAt(65)).success).toBe(false);
  });

  it("takes an empty content type, which is refused later as a row", () => {
    expect(
      manifestEntrySchema.safeParse({ ...ENTRY, declaredContentType: "" })
        .success,
    ).toBe(true);
  });

  it("refuses a negative byte count", () => {
    expect(
      manifestEntrySchema.safeParse({ ...ENTRY, declaredBytes: -1 }).success,
    ).toBe(false);
  });

  it("refuses an amendment that is not ISO-8601", () => {
    expect(
      manifestEntrySchema.safeParse({ ...ENTRY, capturedAt: "15 Sept 2026" })
        .success,
    ).toBe(false);
  });
});

describe("putUploadManifestRequestSchema", () => {
  it("refuses more than five hundred entries in one call", () => {
    const files = Array.from({ length: 501 }, (_unused, index) => {
      return { ...ENTRY, clientRef: `picked-${index}` };
    });

    expect(putUploadManifestRequestSchema.safeParse({ files }).success).toBe(
      false,
    );
  });
});

describe("uploadSessionDetailQuerySchema", () => {
  it("defaults to a hundred files of every state", () => {
    expect(uploadSessionDetailQuerySchema.parse({})).toEqual({
      limit: 100,
      states: null,
    });
  });

  it("coerces the limit, which arrives as a string", () => {
    expect(uploadSessionDetailQuerySchema.parse({ limit: "25" }).limit).toBe(
      25,
    );
  });

  it("refuses a limit over the cap", () => {
    expect(
      uploadSessionDetailQuerySchema.safeParse({ limit: "501" }).success,
    ).toBe(false);
  });

  it("splits states on commas, dropping blanks and repeats", () => {
    expect(
      uploadSessionDetailQuerySchema.parse({
        states: "failed, refused,,failed",
      }).states,
    ).toEqual(["failed", "refused"]);
  });

  it("refuses a state that does not exist", () => {
    expect(
      uploadSessionDetailQuerySchema.safeParse({ states: "failed,lost" })
        .success,
    ).toBe(false);
  });
});

describe("presignUploadFileRequestSchema", () => {
  it("defaults an omitted rendition purpose to original", () => {
    expect(
      presignUploadFileRequestSchema.parse({ contentHash: HASH, byteSize: 10 })
        .purpose,
    ).toBe("original");
  });

  it("refuses a malformed hash", () => {
    expect(
      presignUploadFileRequestSchema.safeParse({
        contentHash: "abc",
        byteSize: 10,
      }).success,
    ).toBe(false);
  });
});

describe("presignUploadFileResponseSchema", () => {
  it("tells single from multipart by mode", () => {
    const parsed = presignUploadFileResponseSchema.parse({
      mode: "multipart",
      fileId: FILE_ID,
      multipartUploadId: "upload-1",
      partSizeBytes: 16_777_216,
      partCount: 2,
      parts: [
        {
          partNumber: 2,
          url: "https://b2.test/part/2",
          expiresAt: "2026-09-27T11:00:00.000Z",
        },
      ],
      method: "PUT",
      headers: { "content-type": "video/quicktime" },
      expiresAt: "2026-09-27T11:00:00.000Z",
    });

    expect(parsed.mode === "multipart" ? parsed.parts[0]?.partNumber : 0).toBe(
      2,
    );
  });

  it("refuses a multipart body with no parts", () => {
    expect(
      presignUploadFileResponseSchema.safeParse({
        mode: "multipart",
        fileId: FILE_ID,
        multipartUploadId: "upload-1",
        partSizeBytes: 16_777_216,
        partCount: 2,
        method: "PUT",
        headers: {},
        expiresAt: "2026-09-27T11:00:00.000Z",
      }).success,
    ).toBe(false);
  });
});

describe("completeUploadFileRequestSchema", () => {
  it("refuses a finished transfer that names no hash", () => {
    const result = completeUploadFileRequestSchema.safeParse({
      outcome: "done",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["contentHash"]);
  });

  it("takes a failure with only its problem code", () => {
    expect(
      completeUploadFileRequestSchema.safeParse({
        outcome: "failed",
        problemCode: "connection_lost",
      }).success,
    ).toBe(true);
  });

  it("refuses a problem code outside the enum", () => {
    expect(
      completeUploadFileRequestSchema.safeParse({
        outcome: "failed",
        problemCode: "gremlins",
      }).success,
    ).toBe(false);
  });
});

describe("setUploadVisibilityRequestSchema", () => {
  it("takes everyone with no subjects, defaulting the list", () => {
    expect(
      setUploadVisibilityRequestSchema.parse({ mode: "everyone" }).subjects,
    ).toEqual([]);
  });

  it("refuses only with nobody named", () => {
    expect(
      setUploadVisibilityRequestSchema.safeParse({ mode: "only", subjects: [] })
        .success,
    ).toBe(false);
  });

  it("refuses except with nobody named", () => {
    expect(
      setUploadVisibilityRequestSchema.safeParse({
        mode: "except",
        subjects: [],
      }).success,
    ).toBe(false);
  });

  it("refuses everyone with somebody named", () => {
    expect(
      setUploadVisibilityRequestSchema.safeParse({
        mode: "everyone",
        subjects: [{ kind: "member", id: MEMBER_ID }],
      }).success,
    ).toBe(false);
  });
});
