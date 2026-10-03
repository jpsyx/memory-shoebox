import type { ManifestCaptureEvidence } from "@memory-shoebox/shared";
import { describe, expect, it } from "vitest";
import {
  getCaptureDateFromEvidence,
  getCaptureDateFromUploaderDate,
  type CaptureDateResult,
} from "../../src/upload/captureDateLadder.ts";

/** Madrid is two hours ahead of UTC in September and one in December. */
const MADRID = "Europe/Madrid";
/** New York is four hours behind UTC in September. */
const NEW_YORK = "America/New_York";
/** When the manifest declared the file, and rung 6's answer. */
const DECLARED_AT = "2026-09-27T10:00:00.000Z";

/** The ladder's answer for an Android camera file shot at 06:41:32 Madrid. */
const FILENAME_RESULT: CaptureDateResult = {
  capturedAt: "2026-09-14T04:41:32.000Z",
  captureDate: "2026-09-14",
  captureOffsetMinutes: null,
  captureSource: "filename",
};

/** The ladder's answer for an offset-less EXIF date of 06:41:32 Madrid. */
const OFFSETLESS_EXIF_RESULT: CaptureDateResult = {
  ...FILENAME_RESULT,
  captureSource: "exif",
};

/** The ladder's answer for a file that said nothing, declared at NOW. */
const UPLOAD_TIME_RESULT: CaptureDateResult = {
  capturedAt: DECLARED_AT,
  captureDate: "2026-09-27",
  captureOffsetMinutes: null,
  captureSource: "upload_time",
};

/** A `lastModified` of 18:00 UTC, 20:00 in Madrid. */
const FILE_MTIME_RESULT: CaptureDateResult = {
  capturedAt: "2026-09-20T18:00:00.000Z",
  captureDate: "2026-09-20",
  captureOffsetMinutes: null,
  captureSource: "file_mtime",
};

type LadderCase = {
  name: string;
  evidence?: ManifestCaptureEvidence;
  originalFilename?: string;
  timezone?: string;
  declaredAt?: string;
  expected: CaptureDateResult;
};

const LADDER_CASES: readonly LadderCase[] = [
  {
    name: "rung 1: EXIF with the offset it carried",
    evidence: {
      exifCapturedAtLocal: "2026-09-14T06:41:32",
      exifOffsetMinutes: 120,
    },
    expected: {
      capturedAt: "2026-09-14T04:41:32.000Z",
      captureDate: "2026-09-14",
      captureOffsetMinutes: 120,
      captureSource: "exif",
    },
  },
  {
    name: "rung 1: an offset keeps the file's own evening, whatever the zone",
    evidence: {
      exifCapturedAtLocal: "2026-09-14T23:30:00",
      exifOffsetMinutes: -240,
    },
    expected: {
      capturedAt: "2026-09-15T03:30:00.000Z",
      captureDate: "2026-09-14",
      captureOffsetMinutes: -240,
      captureSource: "exif",
    },
  },
  {
    name: "rung 1: offset-less EXIF resolves in shoebox.timezone, offset null",
    evidence: { exifCapturedAtLocal: "2026-09-14T06:41:32" },
    expected: OFFSETLESS_EXIF_RESULT,
  },
  {
    name: "rung 1: a 23:30 local photograph lands on its local day",
    evidence: { exifCapturedAtLocal: "2026-09-14T23:30:00" },
    timezone: NEW_YORK,
    expected: {
      capturedAt: "2026-09-15T03:30:00.000Z",
      captureDate: "2026-09-14",
      captureOffsetMinutes: null,
      captureSource: "exif",
    },
  },
  {
    name: "rung 1: EXIF in the tag's own spelling",
    evidence: { exifCapturedAtLocal: "2026:09:14 06:41:32" },
    expected: OFFSETLESS_EXIF_RESULT,
  },
  {
    name: "rung 1: an offset no zone uses is dropped, the clock kept",
    evidence: {
      exifCapturedAtLocal: "2026-09-14T06:41:32",
      exifOffsetMinutes: 2000,
    },
    expected: OFFSETLESS_EXIF_RESULT,
  },
  {
    name: "rung 1: an unset camera clock falls to the filename",
    evidence: { exifCapturedAtLocal: "0000:00:00 00:00:00" },
    originalFilename: "IMG_20260914_064132.jpg",
    expected: FILENAME_RESULT,
  },
  {
    name: "rung 1 outranks every other rung",
    evidence: {
      exifCapturedAtLocal: "2026-09-14T06:41:32",
      videoCreationTime: "2026-09-01T00:00:00.000Z",
      lastModifiedAt: "2026-09-20T18:00:00.000Z",
    },
    originalFilename: "IMG_20260101_120000.jpg",
    expected: OFFSETLESS_EXIF_RESULT,
  },
  {
    name: "rung 2: creation_time is an instant, so the offset is null",
    evidence: { videoCreationTime: "2026-09-14T04:41:32.000Z" },
    originalFilename: "clip.mov",
    expected: {
      capturedAt: "2026-09-14T04:41:32.000Z",
      captureDate: "2026-09-14",
      captureOffsetMinutes: null,
      captureSource: "video_metadata",
    },
  },
  {
    name: "rung 2: a 00:30 Madrid video lands on its local day, not UTC's",
    evidence: { videoCreationTime: "2026-09-13T22:30:00.000Z" },
    originalFilename: "clip.mov",
    expected: {
      capturedAt: "2026-09-13T22:30:00.000Z",
      captureDate: "2026-09-14",
      captureOffsetMinutes: null,
      captureSource: "video_metadata",
    },
  },
  {
    name: "rung 2: the QuickTime 1904 epoch falls through to the filename",
    evidence: { videoCreationTime: "1904-01-01T00:00:00.000Z" },
    originalFilename: "VID_20260914_064132.mp4",
    expected: FILENAME_RESULT,
  },
  {
    name: "rung 2: Unix zero falls through",
    evidence: {
      videoCreationTime: "1970-01-01T00:00:00.000Z",
      lastModifiedAt: "2026-09-20T18:00:00.000Z",
    },
    originalFilename: "clip.mov",
    expected: FILE_MTIME_RESULT,
  },
  {
    name: "rung 2: a week past the declaration falls through",
    evidence: { videoCreationTime: "2026-10-04T10:00:00.000Z" },
    originalFilename: "clip.mov",
    expected: UPLOAD_TIME_RESULT,
  },
  {
    name: "rung 2: ten hours ahead is inside the skew and still counts",
    evidence: { videoCreationTime: "2026-09-27T20:00:00.000Z" },
    originalFilename: "clip.mov",
    expected: {
      capturedAt: "2026-09-27T20:00:00.000Z",
      captureDate: "2026-09-27",
      captureOffsetMinutes: null,
      captureSource: "video_metadata",
    },
  },
  {
    name: "rung 3: an Android camera name",
    originalFilename: "IMG_20260914_064132.jpg",
    expected: FILENAME_RESULT,
  },
  {
    name: "rung 3: a Pixel name, milliseconds and all",
    originalFilename: "PXL_20260914_064132123.jpg",
    expected: FILENAME_RESULT,
  },
  {
    name: "rung 3: a Samsung name, with no prefix",
    originalFilename: "20260914_064132.jpg",
    expected: FILENAME_RESULT,
  },
  {
    name: "rung 3: a WhatsApp name says the day, so the clock is noon",
    originalFilename: "IMG-20260914-WA0001.jpg",
    expected: {
      capturedAt: "2026-09-14T10:00:00.000Z",
      captureDate: "2026-09-14",
      captureOffsetMinutes: null,
      captureSource: "filename",
    },
  },
  {
    name: "rung 3: a Dropbox export, in winter time",
    originalFilename: "2026-01-17 19.23.33.jpg",
    expected: {
      capturedAt: "2026-01-17T18:23:33.000Z",
      captureDate: "2026-01-17",
      captureOffsetMinutes: null,
      captureSource: "filename",
    },
  },
  {
    name: "rung 3: a name with an impossible date falls through",
    evidence: { lastModifiedAt: "2026-09-20T18:00:00.000Z" },
    originalFilename: "IMG_20261340_250000.jpg",
    expected: FILE_MTIME_RESULT,
  },
  {
    name: "rung 4: lastModified's day is the zone's, not UTC's",
    evidence: { lastModifiedAt: "2026-09-20T22:30:00.000Z" },
    expected: {
      capturedAt: "2026-09-20T22:30:00.000Z",
      captureDate: "2026-09-21",
      captureOffsetMinutes: null,
      captureSource: "file_mtime",
    },
  },
  {
    name: "rung 4: a lastModified of Unix zero falls to the declaration",
    evidence: { lastModifiedAt: "1970-01-01T00:00:00.000Z" },
    expected: UPLOAD_TIME_RESULT,
  },
  {
    name: "rung 6: a file that said nothing gets its declaration time",
    expected: UPLOAD_TIME_RESULT,
  },
  {
    name: "rung 6: declared at 22:30 UTC is the next day in Madrid",
    declaredAt: "2026-09-27T22:30:00.000Z",
    expected: {
      capturedAt: "2026-09-27T22:30:00.000Z",
      captureDate: "2026-09-28",
      captureOffsetMinutes: null,
      captureSource: "upload_time",
    },
  },
];

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
  it("keeps an EXIF photograph's clock and moves only its day", () => {
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
      captureOffsetMinutes: null,
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
          captureOffsetMinutes: null,
          captureSource: "exif",
        },
        timezone: NEW_YORK,
      }),
    ).toEqual({
      capturedAt: "2026-09-21T03:30:00.000Z",
      captureDate: "2026-09-20",
      captureOffsetMinutes: null,
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

  it("takes the amendment's own clock when the ladder never ran", () => {
    expect(
      getCaptureDateFromUploaderDate({
        capturedAt: "2026-09-16T08:15:00.000Z",
        previous: null,
        timezone: MADRID,
      }),
    ).toEqual({
      capturedAt: "2026-09-16T06:15:00.000Z",
      captureDate: "2026-09-16",
      captureOffsetMinutes: null,
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
          captureOffsetMinutes: null,
          captureSource: "filename",
        },
        timezone: MADRID,
      }),
    ).toEqual({
      capturedAt: "2026-03-29T01:30:00.000Z",
      captureDate: "2026-03-29",
      captureOffsetMinutes: null,
      captureSource: "uploader_set",
    });
  });
});
