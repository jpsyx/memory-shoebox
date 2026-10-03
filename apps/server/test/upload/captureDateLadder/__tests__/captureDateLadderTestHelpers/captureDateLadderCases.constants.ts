import type { LadderCase } from "./captureDateLadderTestHelpers.types.ts";

import {
  OFFSETLESS_EXIF_RESULT,
  NEW_YORK,
  FILENAME_RESULT,
  UPLOAD_TIME_RESULT,
  FILE_MTIME_RESULT,
  IMPOSSIBLE_FILENAMES,
} from "./captureDateLadderTestHelpers.constants.ts";

/**
 * Capture-evidence cases and the results each ladder rung must produce.
 */
export const LADDER_CASES: readonly LadderCase[] = [
  {
    name: "rung 1: converts the EXIF clock to UTC and preserves its recorded offset",
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
      captureOffsetMinutes: undefined,
      captureSource: "exif",
    },
  },
  {
    name: "rung 1: interprets colon-separated EXIF clocks in the Shoebox zone with a null offset",
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
    name: "rung 1: a week past the declaration falls to the filename",
    evidence: { exifCapturedAtLocal: "2026-10-04T06:41:32" },
    originalFilename: "IMG_20260914_064132.jpg",
    expected: FILENAME_RESULT,
  },
  {
    name: "rung 1: exactly a day past the declaration still counts",
    evidence: { exifCapturedAtLocal: "2026-09-28T12:00:00" },
    expected: {
      capturedAt: "2026-09-28T10:00:00.000Z",
      captureDate: "2026-09-28",
      captureOffsetMinutes: undefined,
      captureSource: "exif",
    },
  },
  {
    name: "rung 1: a second past that day falls through",
    evidence: { exifCapturedAtLocal: "2026-09-28T12:00:01" },
    expected: UPLOAD_TIME_RESULT,
  },
  {
    name: "rung 1: a repeated wall-clock hour resolves to the later Madrid one",
    evidence: { exifCapturedAtLocal: "2026-10-25T02:30:00" },
    declaredAt: "2026-11-01T00:00:00.000Z",
    expected: {
      capturedAt: "2026-10-25T01:30:00.000Z",
      captureDate: "2026-10-25",
      captureOffsetMinutes: undefined,
      captureSource: "exif",
    },
  },
  {
    name: "rung 1: a skipped wall-clock hour moves forward by the gap",
    evidence: { exifCapturedAtLocal: "2026-03-29T02:30:00" },
    declaredAt: "2026-04-01T00:00:00.000Z",
    expected: {
      capturedAt: "2026-03-29T01:30:00.000Z",
      captureDate: "2026-03-29",
      captureOffsetMinutes: undefined,
      captureSource: "exif",
    },
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
      captureOffsetMinutes: undefined,
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
      captureOffsetMinutes: undefined,
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
      captureOffsetMinutes: undefined,
      captureSource: "video_metadata",
    },
  },
  {
    name: "rung 2: exactly a day past the declaration still counts",
    evidence: { videoCreationTime: "2026-09-28T10:00:00.000Z" },
    originalFilename: "clip.mov",
    expected: {
      capturedAt: "2026-09-28T10:00:00.000Z",
      captureDate: "2026-09-28",
      captureOffsetMinutes: undefined,
      captureSource: "video_metadata",
    },
  },
  {
    name: "rung 2: a millisecond past that day falls through",
    evidence: { videoCreationTime: "2026-09-28T10:00:00.001Z" },
    originalFilename: "clip.mov",
    expected: UPLOAD_TIME_RESULT,
  },
  {
    name: "rung 2: an instant written at an offset is the same instant",
    evidence: { videoCreationTime: "2026-09-14T06:41:32+02:00" },
    originalFilename: "clip.mov",
    expected: {
      capturedAt: "2026-09-14T04:41:32.000Z",
      captureDate: "2026-09-14",
      captureOffsetMinutes: undefined,
      captureSource: "video_metadata",
    },
  },
  ...["1", "Sep 13", "not a date", "2026-09-14", "2026-09-14T04:41:32"].map(
    (loose): LadderCase => {
      return {
        name: `rung 2: "${loose}" is no instant, so it falls through`,
        evidence: {
          videoCreationTime: loose,
          lastModifiedAt: "2026-09-20T18:00:00.000Z",
        },
        originalFilename: "clip.mov",
        expected: FILE_MTIME_RESULT,
      };
    },
  ),
  {
    name: "rung 2: an offset without its colon falls through",
    evidence: {
      videoCreationTime: "2026-09-14T06:41:32+0200",
      lastModifiedAt: "2026-09-20T18:00:00.000Z",
    },
    originalFilename: "clip.mov",
    expected: FILE_MTIME_RESULT,
  },
  {
    name: "rung 2: the 30th of February falls through, not into March",
    evidence: {
      videoCreationTime: "2026-02-30T00:00:00.000Z",
      lastModifiedAt: "2026-09-20T18:00:00.000Z",
    },
    originalFilename: "clip.mov",
    expected: FILE_MTIME_RESULT,
  },
  {
    name: "rung 3: derives the capture instant and local day from an Android filename",
    originalFilename: "IMG_20260914_064132.jpg",
    expected: FILENAME_RESULT,
  },
  {
    name: "rung 3: interprets a Pixel filename clock as UTC and drops trailing milliseconds",
    originalFilename: "PXL_20260914_064132123.jpg",
    expected: {
      capturedAt: "2026-09-14T06:41:32.000Z",
      captureDate: "2026-09-14",
      captureOffsetMinutes: undefined,
      captureSource: "filename",
    },
  },
  {
    name: "rung 3: a Pixel name stamped 22:30 UTC is the next day in Madrid",
    originalFilename: "PXL_20260913_223000000.jpg",
    expected: {
      capturedAt: "2026-09-13T22:30:00.000Z",
      captureDate: "2026-09-14",
      captureOffsetMinutes: undefined,
      captureSource: "filename",
    },
  },
  {
    name: "rung 3: derives the capture instant and local day from an unprefixed Samsung filename",
    originalFilename: "20260914_064132.jpg",
    expected: FILENAME_RESULT,
  },
  {
    name: "rung 3: a WhatsApp name says the day, so the clock is noon",
    originalFilename: "IMG-20260914-WA0001.jpg",
    expected: {
      capturedAt: "2026-09-14T10:00:00.000Z",
      captureDate: "2026-09-14",
      captureOffsetMinutes: undefined,
      captureSource: "filename",
    },
  },
  {
    name: "rung 3: converts a Dropbox winter filename to 18:23:33 UTC while preserving its January 17 day",
    originalFilename: "2026-01-17 19.23.33.jpg",
    expected: {
      capturedAt: "2026-01-17T18:23:33.000Z",
      captureDate: "2026-01-17",
      captureOffsetMinutes: undefined,
      captureSource: "filename",
    },
  },
  {
    name: "rung 3: a week past the declaration falls through",
    originalFilename: "IMG_20261004_064132.jpg",
    expected: UPLOAD_TIME_RESULT,
  },
  {
    name: "rung 3: exactly a day past the declaration still counts",
    originalFilename: "IMG_20260928_120000.jpg",
    expected: {
      capturedAt: "2026-09-28T10:00:00.000Z",
      captureDate: "2026-09-28",
      captureOffsetMinutes: undefined,
      captureSource: "filename",
    },
  },
  {
    name: "rung 3: a second past that day falls through",
    originalFilename: "IMG_20260928_120001.jpg",
    expected: UPLOAD_TIME_RESULT,
  },
  ...IMPOSSIBLE_FILENAMES.map(({ breakage, originalFilename }): LadderCase => {
    return {
      name: `rung 3: a name with ${breakage} falls through`,
      evidence: { lastModifiedAt: "2026-09-20T18:00:00.000Z" },
      originalFilename,
      expected: FILE_MTIME_RESULT,
    };
  }),
  {
    name: "rung 4: lastModified's day is the zone's, not UTC's",
    evidence: { lastModifiedAt: "2026-09-20T22:30:00.000Z" },
    expected: {
      capturedAt: "2026-09-20T22:30:00.000Z",
      captureDate: "2026-09-21",
      captureOffsetMinutes: undefined,
      captureSource: "file_mtime",
    },
  },
  {
    name: "rung 4: a week past the declaration falls through",
    evidence: { lastModifiedAt: "2026-10-04T10:00:00.000Z" },
    expected: UPLOAD_TIME_RESULT,
  },
  {
    name: "rung 4: exactly a day past the declaration still counts",
    evidence: { lastModifiedAt: "2026-09-28T10:00:00.000Z" },
    expected: {
      capturedAt: "2026-09-28T10:00:00.000Z",
      captureDate: "2026-09-28",
      captureOffsetMinutes: undefined,
      captureSource: "file_mtime",
    },
  },
  {
    name: "rung 4: a millisecond past that day falls through",
    evidence: { lastModifiedAt: "2026-09-28T10:00:00.001Z" },
    expected: UPLOAD_TIME_RESULT,
  },
  ...["1", "Sep 13", "2026-09-20T18:00:00"].map((loose): LadderCase => {
    return {
      name: `rung 4: "${loose}" is no instant, so it falls through`,
      evidence: { lastModifiedAt: loose },
      expected: UPLOAD_TIME_RESULT,
    };
  }),
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
      captureOffsetMinutes: undefined,
      captureSource: "upload_time",
    },
  },
];
