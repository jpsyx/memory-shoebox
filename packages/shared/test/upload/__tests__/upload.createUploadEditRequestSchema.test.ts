import {
  SESSION_ID,
  FILE_ID,
  MEMBER_ID,
  TAG_ID,
  MILESTONE_ID,
} from "./uploadTestFixtures.constants.ts";
import { describe, expect, it } from "vitest";
import { apiErrorDetailsSchema } from "../../../src/errors.ts";
import {
  commitUploadSessionRequestSchema,
  openUploadSessionRequestSchema,
} from "../../../src/upload/uploadSessionRequestSchemas.constants.ts";

import { createUploadEditRequestSchema } from "../../../src/upload/uploadEditSchemas.constants.ts";

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
