import { describe, expect, it } from "vitest";
import { apiErrorDetailsSchema } from "../src/errors.ts";
import {
  commitUploadSessionRequestSchema,
  completeUploadFileRequestSchema,
  createUploadEditRequestSchema,
  manifestEntrySchema,
  openUploadSessionRequestSchema,
  presignUploadFileRequestSchema,
  presignUploadFileResponseSchema,
  putUploadManifestRequestSchema,
  setUploadVisibilityRequestSchema,
  uploadFileDtoSchema,
  uploadSessionDetailQuerySchema,
  uploadSessionDetailSchema,
} from "../src/upload.ts";

const SESSION_ID = "0199c0a0-0000-7000-8000-000000000001";
const FILE_ID = "0199c0a0-0000-7000-8000-000000000002";
const MEMBER_ID = "0199c0a0-0000-7000-8000-000000000003";
const TAG_ID = "0199c0a0-0000-7000-8000-000000000004";
const MILESTONE_ID = "0199c0a0-0000-7000-8000-000000000005";
const HASH = "a".repeat(64);

const FILE = {
  fileId: FILE_ID,
  position: 0,
  originalFilename: "IMG_20260914_064132.jpg",
  declaredContentType: "image/jpeg",
  declaredBytes: 2_400_000,
  contentHash: null,
  state: "waiting",
  attemptCount: 0,
  problemCode: null,
  problemDetail: null,
  capturedAt: "2026-09-14T04:41:32.000Z",
  capturedOn: "2026-09-14",
  captureOffsetMinutes: null,
  captureSource: "filename",
  itemId: null,
  media: null,
};

const DRAFT_DETAIL = {
  sessionId: SESSION_ID,
  state: "draft",
  uploadedBy: { memberId: MEMBER_ID, displayName: "Papá" },
  visibility: {
    visibilityRuleId: "visibility-rule-everyone",
    mode: "everyone",
    label: null,
    subjects: [],
  },
  clientTimezone: "Europe/Madrid",
  fileCount: 0,
  totalBytes: 0,
  createdAt: "2026-09-27T10:00:00.000Z",
  committedAt: null,
  settledAt: null,
  lastActivityAt: "2026-09-27T10:00:00.000Z",
  notifiedAt: null,
  notifiedMemberCount: null,
  progress: {
    waitingCount: 1,
    sendingCount: 0,
    doneCount: 0,
    failedCount: 0,
    refusedCount: 0,
    cancelledCount: 0,
    doneBytes: 0,
  },
  days: [{ capturedOn: "2026-09-14", fileCount: 1, milestones: [] }],
  edits: [],
  mismatches: [],
  undated: null,
  pendingFiles: [
    { fileId: FILE_ID, originalFilename: "IMG_0001.jpg", declaredBytes: 10 },
  ],
  summary: null,
  files: [FILE],
  nextCursor: null,
};

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

const ENTRY = {
  clientRef: "picked-1",
  originalFilename: "IMG_0001.jpg",
  declaredContentType: "image/jpeg",
  declaredBytes: 2_400_000,
};

describe("manifestEntrySchema", () => {
  it("takes evidence the ladder will reject rather than refusing the file", () => {
    const parsed = manifestEntrySchema.parse({
      ...ENTRY,
      capture: { exifCapturedAtLocal: "0000:00:00 00:00:00" },
    });

    expect(parsed.capture?.exifCapturedAtLocal).toBe("0000:00:00 00:00:00");
  });

  it("bounds each evidence string at sixty-four characters", () => {
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
  it("presigns the original unless told otherwise", () => {
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

describe("createUploadEditRequestSchema", () => {
  const targetFileIds = [FILE_ID];

  it("takes a new tag by the name as typed", () => {
    expect(
      createUploadEditRequestSchema.parse({
        kind: "tag",
        targetFileIds,
        labelSnapshot: "  Hospital ",
      }).labelSnapshot,
    ).toBe("Hospital");
  });

  it("refuses a tag that names neither an id nor a label", () => {
    expect(
      createUploadEditRequestSchema.safeParse({ kind: "tag", targetFileIds })
        .success,
    ).toBe(false);
  });

  it("refuses a tag that names both an id and a label", () => {
    expect(
      createUploadEditRequestSchema.safeParse({
        kind: "tag",
        targetFileIds,
        tagId: TAG_ID,
        labelSnapshot: "Hospital",
      }).success,
    ).toBe(false);
  });

  it("refuses a milestone carrying a label, or no id", () => {
    expect(
      createUploadEditRequestSchema.safeParse({
        kind: "milestone",
        targetFileIds,
        milestoneId: MILESTONE_ID,
        labelSnapshot: "Birthday",
      }).success,
    ).toBe(false);
    expect(
      createUploadEditRequestSchema.safeParse({
        kind: "milestone",
        targetFileIds,
      }).success,
    ).toBe(false);
  });

  it("refuses a reference that belongs to another kind", () => {
    expect(
      createUploadEditRequestSchema.safeParse({
        kind: "tag",
        targetFileIds,
        labelSnapshot: "Hospital",
        personId: MEMBER_ID,
      }).success,
    ).toBe(false);
  });

  it("refuses a blank label", () => {
    expect(
      createUploadEditRequestSchema.safeParse({
        kind: "person",
        targetFileIds,
        labelSnapshot: "   ",
      }).success,
    ).toBe(false);
  });

  it("caps a new tag's name and leaves a new person's alone", () => {
    const longLabel = "x".repeat(101);

    expect(
      createUploadEditRequestSchema.safeParse({
        kind: "tag",
        targetFileIds,
        labelSnapshot: longLabel,
      }).success,
    ).toBe(false);
    expect(
      createUploadEditRequestSchema.safeParse({
        kind: "person",
        targetFileIds,
        labelSnapshot: longLabel,
      }).success,
    ).toBe(true);
  });

  it("refuses no targets, and more than a thousand", () => {
    expect(
      createUploadEditRequestSchema.safeParse({
        kind: "tag",
        targetFileIds: [],
        tagId: TAG_ID,
      }).success,
    ).toBe(false);
    expect(
      createUploadEditRequestSchema.safeParse({
        kind: "tag",
        targetFileIds: Array.from({ length: 1001 }, () => {
          return FILE_ID;
        }),
        tagId: TAG_ID,
      }).success,
    ).toBe(false);
  });
});

describe("openUploadSessionRequestSchema", () => {
  it("refuses a zone Intl cannot resolve", () => {
    expect(
      openUploadSessionRequestSchema.safeParse({ clientTimezone: "Mars/Base" })
        .success,
    ).toBe(false);
  });
});

describe("commitUploadSessionRequestSchema", () => {
  it("takes exactly one of the two intents", () => {
    expect(commitUploadSessionRequestSchema.parse({ intent: "arm" })).toEqual({
      intent: "arm",
    });
    expect(commitUploadSessionRequestSchema.parse({ intent: "close" })).toEqual(
      { intent: "close" },
    );
  });

  it("refuses a missing, unknown or non-string intent, and no body", () => {
    expect(commitUploadSessionRequestSchema.safeParse({}).success).toBe(false);
    expect(
      commitUploadSessionRequestSchema.safeParse({ intent: "commit" }).success,
    ).toBe(false);
    expect(
      commitUploadSessionRequestSchema.safeParse({ intent: 1 }).success,
    ).toBe(false);
    expect(commitUploadSessionRequestSchema.safeParse(undefined).success).toBe(
      false,
    );
  });
});

describe("apiErrorDetailsSchema", () => {
  it("carries the four fields the upload contract names", () => {
    const details = {
      sessionId: SESSION_ID,
      fileId: FILE_ID,
      state: "done",
      clientRefs: ["picked-1", "picked-2"],
    };

    expect(apiErrorDetailsSchema.parse(details)).toEqual(details);
  });
});
