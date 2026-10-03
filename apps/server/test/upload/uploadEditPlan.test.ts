import { describe, expect, it } from "vitest";
import type { CreateUploadEditRequest } from "@memory-shoebox/shared";
import { createId } from "../../src/db/createId.ts";
import { ApiError } from "../../src/http/ApiError.ts";
import { makeUploadEditSubjectFromRequest } from "../../src/upload/uploadEditPlanHelpers.ts";

const TARGETS = [createId()];

function _getRefusal(request: CreateUploadEditRequest): ApiError {
  try {
    makeUploadEditSubjectFromRequest(request);
  } catch (error) {
    if (error instanceof ApiError) {
      return error;
    }
    throw error;
  }
  throw new Error("expected the request to be refused");
}

describe("makeUploadEditSubjectFromRequest", () => {
  it("takes a tag from the picker, or a new one as typed and trimmed", () => {
    const tagId = createId();

    expect(
      makeUploadEditSubjectFromRequest({
        kind: "tag",
        targetFileIds: TARGETS,
        tagId,
      }),
    ).toEqual({ kind: "tag", tagId, labelSnapshot: undefined });
    expect(
      makeUploadEditSubjectFromRequest({
        kind: "tag",
        targetFileIds: TARGETS,
        labelSnapshot: "  Hospital ",
      }),
    ).toEqual({ kind: "tag", tagId: undefined, labelSnapshot: "Hospital" });
  });

  it("takes a person exactly the way it takes a tag", () => {
    const personId = createId();

    expect(
      makeUploadEditSubjectFromRequest({
        kind: "person",
        targetFileIds: TARGETS,
        personId,
      }),
    ).toEqual({ kind: "person", personId, labelSnapshot: undefined });
    expect(
      makeUploadEditSubjectFromRequest({
        kind: "person",
        targetFileIds: TARGETS,
        labelSnapshot: "Mateo",
      }),
    ).toEqual({ kind: "person", personId: undefined, labelSnapshot: "Mateo" });
  });

  it("refuses both, neither, and a blank name", () => {
    const refusals = [
      _getRefusal({
        kind: "tag",
        targetFileIds: TARGETS,
        tagId: createId(),
        labelSnapshot: "Hospital",
      }),
      _getRefusal({ kind: "person", targetFileIds: TARGETS }),
      _getRefusal({
        kind: "tag",
        targetFileIds: TARGETS,
        labelSnapshot: "   ",
      }),
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
      _getRefusal({
        kind: "milestone",
        targetFileIds: TARGETS,
        milestoneId,
        labelSnapshot: "Home from the hospital",
      }).details?.fieldErrors,
    ).toHaveProperty("labelSnapshot");
    expect(
      _getRefusal({ kind: "milestone", targetFileIds: TARGETS }).details
        ?.fieldErrors,
    ).toHaveProperty("milestoneId");
  });
});
