import { describe, expect, it } from "vitest";
import type { CreateUploadEditRequest } from "@memory-shoebox/shared";
import { createId } from "../../src/db/createId.ts";
import { ApiError } from "../../src/http/ApiError.ts";
import { makeUploadEditSubjectFromRequest } from "../../src/upload/uploadEditPlan.ts";

const TARGETS = [createId()];

const getRefusal = (request: CreateUploadEditRequest): ApiError => {
  try {
    makeUploadEditSubjectFromRequest(request);
  } catch (error) {
    if (error instanceof ApiError) {
      return error;
    }
    throw error;
  }
  throw new Error("expected the request to be refused");
};

describe("makeUploadEditSubjectFromRequest", () => {
  it("takes a tag from the picker, or a new one as typed and trimmed", () => {
    const tagId = createId();

    expect(
      makeUploadEditSubjectFromRequest({
        kind: "tag",
        targetFileIds: TARGETS,
        tagId,
      }),
    ).toEqual({ kind: "tag", tagId, labelSnapshot: null });
    expect(
      makeUploadEditSubjectFromRequest({
        kind: "tag",
        targetFileIds: TARGETS,
        labelSnapshot: "  Hospital ",
      }),
    ).toEqual({ kind: "tag", tagId: null, labelSnapshot: "Hospital" });
  });

  it("takes a person exactly the way it takes a tag", () => {
    const personId = createId();

    expect(
      makeUploadEditSubjectFromRequest({
        kind: "person",
        targetFileIds: TARGETS,
        personId,
      }),
    ).toEqual({ kind: "person", personId, labelSnapshot: null });
    expect(
      makeUploadEditSubjectFromRequest({
        kind: "person",
        targetFileIds: TARGETS,
        labelSnapshot: "Mateo",
      }),
    ).toEqual({ kind: "person", personId: null, labelSnapshot: "Mateo" });
  });

  it("refuses both, neither, and a blank name", () => {
    const refusals = [
      getRefusal({
        kind: "tag",
        targetFileIds: TARGETS,
        tagId: createId(),
        labelSnapshot: "Hospital",
      }),
      getRefusal({ kind: "person", targetFileIds: TARGETS }),
      getRefusal({ kind: "tag", targetFileIds: TARGETS, labelSnapshot: "   " }),
    ];

    expect(
      refusals.map((refusal) => {
        return [refusal.statusCode, refusal.code];
      }),
    ).toEqual([
      [400, "invalid_request"],
      [400, "invalid_request"],
      [400, "invalid_request"],
    ]);
  });

  it("never takes a typed milestone, and needs the one chosen", () => {
    const milestoneId = createId();

    expect(
      makeUploadEditSubjectFromRequest({
        kind: "milestone",
        targetFileIds: TARGETS,
        milestoneId,
      }),
    ).toEqual({ kind: "milestone", milestoneId });
    expect(
      getRefusal({
        kind: "milestone",
        targetFileIds: TARGETS,
        milestoneId,
        labelSnapshot: "Home from the hospital",
      }).details?.fieldErrors,
    ).toHaveProperty("labelSnapshot");
    expect(
      getRefusal({ kind: "milestone", targetFileIds: TARGETS }).details
        ?.fieldErrors,
    ).toHaveProperty("milestoneId");
  });
});
