import { describe, expect, it } from "vitest";
import {
  makeUploadFileFromPosition,
  makeUploadSurfaceDetail,
} from "@/upload/createUploadSessionController/__tests__/uploadSurfaceFixtureHelpers";
import { getUploadDateReviewFromDetail } from "./getUploadDateReviewFromDetail";

function _makeDetail(days: ReadonlyArray<string | null>) {
  const files = days.map((day, position) => {
    return {
      ...makeUploadFileFromPosition(position),
      capturedOn: day ?? "2026-10-10",
      captureSource: day ? ("exif" as const) : ("file_mtime" as const),
    };
  });
  return makeUploadSurfaceDetail({
    files,
    undated: {
      fileCount: days.filter((day) => {
        return day === null;
      }).length,
      captureSource: "file_mtime",
      files: files
        .filter((file) => {
          return file.captureSource === "file_mtime";
        })
        .map((file) => {
          return {
            fileId: file.fileId,
            originalFilename: file.originalFilename,
            capturedOn: file.capturedOn,
          };
        }),
    },
  });
}

describe("getUploadDateReviewFromDetail", () => {
  it.each([
    {
      days: [null, "2026-09-14"],
      expected: ["2026-09-14"],
      basis: "following",
    },
    {
      days: ["2026-09-14", null, "2026-09-14"],
      expected: ["2026-09-14"],
      basis: "surrounding",
    },
    {
      days: ["2026-09-14", null, "2026-09-16"],
      expected: ["2026-09-14"],
      basis: "previous",
    },
    { days: ["2026-09-14", null], expected: ["2026-09-14"], basis: "previous" },
    {
      days: [null, null, "2026-09-14"],
      expected: ["2026-09-14", "2026-09-14"],
      basis: "following",
    },
    {
      days: ["2026-09-14", null, null, "2026-09-16"],
      expected: ["2026-09-14", "2026-09-14"],
      basis: "previous",
    },
    {
      days: [null, null],
      expected: ["2026-10-10", "2026-10-10"],
      basis: "file_mtime",
    },
  ])(
    "suggests dates for $days without promoting guesses to evidence",
    ({ days, expected, basis }) => {
      const detail = _makeDetail(days);
      const before = structuredClone(detail);
      const rows = getUploadDateReviewFromDetail(detail);
      expect(
        rows.map((row) => {
          return row.capturedOn;
        }),
      ).toEqual(expected);
      expect(
        rows.map((row) => {
          return row.basis;
        }),
      ).toEqual(
        expected.map(() => {
          return basis;
        }),
      );
      expect(detail).toEqual(before);
    },
  );

  it("uses original positions rather than file names or response array order", () => {
    const detail = _makeDetail(["2026-09-14", null, "2026-09-16", null]);
    detail.files = [
      detail.files[3]!,
      detail.files[2]!,
      detail.files[1]!,
      detail.files[0]!,
    ];
    const rows = getUploadDateReviewFromDetail(detail);
    expect(
      rows.map((row) => {
        return [row.file.position, row.capturedOn];
      }),
    ).toEqual([
      [1, "2026-09-14"],
      [3, "2026-09-16"],
    ]);
  });

  it("ignores removed, refused and duplicate photos as neighbors or review targets", () => {
    const detail = _makeDetail([
      "2026-09-14",
      "2026-09-16",
      "2026-09-17",
      null,
      null,
      "2026-09-18",
    ]);
    detail.files[1]!.state = "refused";
    detail.files[2]!.state = "cancelled";
    detail.files[4]!.state = "cancelled";
    detail.files[5]!.duplicateReason = "archive";
    expect(
      getUploadDateReviewFromDetail(detail).map((row) => {
        return [row.file.position, row.capturedOn];
      }),
    ).toEqual([[3, "2026-09-14"]]);
  });

  it("uses an approved correction as evidence for the remaining photos", () => {
    const detail = _makeDetail([null, null]);
    detail.files[0]!.captureSource = "uploader_set";
    detail.files[0]!.capturedOn = "2026-09-12";
    detail.undated!.files.shift();
    expect(
      getUploadDateReviewFromDetail(detail).map((row) => {
        return row.capturedOn;
      }),
    ).toEqual(["2026-09-12"]);
  });
});
