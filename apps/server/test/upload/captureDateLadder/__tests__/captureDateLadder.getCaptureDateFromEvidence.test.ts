import {
  MADRID,
  NEW_YORK,
  DECLARED_AT,
  FILENAME_RESULT,
  OFFSETLESS_EXIF_RESULT,
  UPLOAD_TIME_RESULT,
  FILE_MTIME_RESULT,
} from "./captureDateLadderTestHelpers/captureDateLadderTestHelpers.constants.ts";
import { LADDER_CASES } from "./captureDateLadderTestHelpers/captureDateLadderCases.constants.ts";

import { describe, expect, it } from "vitest";
import {
  getCaptureDateFromEvidence,
  getCaptureDateFromUploaderDate,
} from "../../../../src/upload/captureDateLadderHelpers/captureDateLadderHelpers.ts";
import { type CaptureDateResult } from "../../../../src/upload/captureDateLadderHelpers/captureDateLadderHelpers.types.ts";

describe("getCaptureDateFromEvidence", () => {
  it.each(LADDER_CASES)("$name", (ladderCase) => {
    expect(
      getCaptureDateFromEvidence({
        evidence: ladderCase.evidence,
        originalFilename: ladderCase.originalFilename ?? "photo.jpg",
        timezone: ladderCase.timezone ?? MADRID,
        declaredAt: ladderCase.declaredAt ?? DECLARED_AT,
      }),
    ).toEqual(ladderCase.expected);
  });
});

describe("getCaptureDateFromUploaderDate", () => {
  it("keeps an EXIF photograph's clock and offset, and moves only its day", () => {
    expect(
      getCaptureDateFromUploaderDate({
        capturedAt: "2026-09-16T00:00:00.000Z",
        previous: {
          capturedAt: "2026-09-14T04:41:32.000Z",
          captureDate: "2026-09-14",
          captureOffsetMinutes: 120,
          captureSource: "exif",
        },
        timezone: MADRID,
      }),
    ).toEqual({
      capturedAt: "2026-09-16T04:41:32.000Z",
      captureDate: "2026-09-16",
      captureOffsetMinutes: 120,
      captureSource: "uploader_set",
    });
  });

  it("keeps another country's offset, and the clock that goes with it", () => {
    // A 23:30 New York photograph amended inside a Madrid Shoebox: moving the
    // day does not move the camera to Spain.
    expect(
      getCaptureDateFromUploaderDate({
        capturedAt: "2026-09-20T00:00:00.000Z",
        previous: {
          capturedAt: "2026-09-15T03:30:00.000Z",
          captureDate: "2026-09-14",
          captureOffsetMinutes: -240,
          captureSource: "exif",
        },
        timezone: MADRID,
      }),
    ).toEqual({
      capturedAt: "2026-09-21T03:30:00.000Z",
      captureDate: "2026-09-20",
      captureOffsetMinutes: -240,
      captureSource: "uploader_set",
    });
  });

  it("keeps a late-night clock and still lands on the day asked for", () => {
    expect(
      getCaptureDateFromUploaderDate({
        capturedAt: "2026-09-20T00:00:00.000Z",
        previous: {
          capturedAt: "2026-09-15T03:30:00.000Z",
          captureDate: "2026-09-14",
          captureOffsetMinutes: undefined,
          captureSource: "exif",
        },
        timezone: NEW_YORK,
      }),
    ).toEqual({
      capturedAt: "2026-09-21T03:30:00.000Z",
      captureDate: "2026-09-20",
      captureOffsetMinutes: undefined,
      captureSource: "uploader_set",
    });
  });

  it("reads the day as written, never through the amendment's offset", () => {
    const moved = getCaptureDateFromUploaderDate({
      capturedAt: "2026-09-16T23:00:00-05:00",
      previous: OFFSETLESS_EXIF_RESULT,
      timezone: MADRID,
    });

    expect(moved.captureDate).toBe("2026-09-16");
    expect(moved.capturedAt).toBe("2026-09-16T04:41:32.000Z");
  });

  it.each([
    { name: "the ladder never ran", previous: undefined },
    {
      name: "the ladder fell to the declaration",
      // Not UPLOAD_TIME_RESULT, whose 12:00 Madrid is noon by coincidence.
      previous: {
        ...UPLOAD_TIME_RESULT,
        capturedAt: "2026-09-27T21:15:00.000Z",
      },
    },
    { name: "the ladder fell to lastModified", previous: FILE_MTIME_RESULT },
  ])("invents no clock when $name: noon", ({ previous }) => {
    // These clocks record when the file was saved or declared, not when the
    // photograph was taken, and keeping one would give every amended file the
    // same instant.
    expect(
      getCaptureDateFromUploaderDate({
        capturedAt: "2026-09-16T08:15:00.000Z",
        previous,
        timezone: MADRID,
      }),
    ).toEqual({
      capturedAt: "2026-09-16T10:00:00.000Z",
      captureDate: "2026-09-16",
      captureOffsetMinutes: undefined,
      captureSource: "uploader_set",
    });
  });

  it.each([
    {
      name: "a filename",
      previous: FILENAME_RESULT,
    },
    {
      name: "a video's creation_time",
      previous: {
        capturedAt: "2026-09-14T04:41:32.000Z",
        captureDate: "2026-09-14",
        captureOffsetMinutes: undefined,
        captureSource: "video_metadata",
      } satisfies CaptureDateResult,
    },
    {
      name: "an earlier amendment",
      previous: {
        capturedAt: "2026-09-14T04:41:32.000Z",
        captureDate: "2026-09-14",
        captureOffsetMinutes: undefined,
        captureSource: "uploader_set",
      } satisfies CaptureDateResult,
    },
  ])("keeps the clock that came from $name", ({ previous }) => {
    expect(
      getCaptureDateFromUploaderDate({
        capturedAt: "2026-09-16T00:00:00.000Z",
        previous,
        timezone: MADRID,
      }),
    ).toEqual({
      capturedAt: "2026-09-16T04:41:32.000Z",
      captureDate: "2026-09-16",
      captureOffsetMinutes: undefined,
      captureSource: "uploader_set",
    });
  });

  it("moves a clock the new day skips forward, and keeps the day", () => {
    // 29 March 2026 is when Madrid's clocks go from 02:00 to 03:00, so the
    // 02:30 this photograph was taken at never happens that day.
    expect(
      getCaptureDateFromUploaderDate({
        capturedAt: "2026-03-29T00:00:00.000Z",
        previous: {
          capturedAt: "2026-03-20T01:30:00.000Z",
          captureDate: "2026-03-20",
          captureOffsetMinutes: undefined,
          captureSource: "filename",
        },
        timezone: MADRID,
      }),
    ).toEqual({
      capturedAt: "2026-03-29T01:30:00.000Z",
      captureDate: "2026-03-29",
      captureOffsetMinutes: undefined,
      captureSource: "uploader_set",
    });
  });
});
