import { makeInstantFromLocalWallClock } from "../../time/wallClockHelpers.ts";

import type {
  GetCaptureDateFromEvidenceOptions,
  CaptureDateResult,
} from "./captureDateLadderHelpers.types.ts";

import {
  getCaptureDateResultFromExif,
  getCaptureDateResultFromVideoMetadata,
  getCaptureDateResultFromFilename,
  getCaptureDateResultFromLastModified,
} from "./captureEvidenceHelpers.ts";

import {
  makeCaptureDateResultFromInstant,
  getCaptureDateFromInstant,
} from "./captureDateHelpers.ts";

import { getClockToKeepFromPrevious } from "./getClockToKeepFromPrevious.ts";

/**
 * Rungs 1 to 4 then 6, over what the browser read from one file's headers.
 *
 * Each rung either answers or falls through, and an implausible value falls
 * through rather than winning: a 1904-epoch video date reaches the filename.
 * Rung 6 is `declaredAt`, the time the file was declared, not the commit
 * time: the ladder runs at the manifest, before commit, and
 * `original_captured_at` freezes the moment it first runs (decision 12).
 *
 * @param options.evidence What the browser read, or nothing.
 * @param options.originalFilename The name the file was picked under.
 * @param options.timezone The `shoebox.timezone` setting.
 * @param options.declaredAt When the manifest declared the file, ISO-8601.
 */
export function getCaptureDateFromEvidence(
  options: Readonly<GetCaptureDateFromEvidenceOptions>,
): CaptureDateResult {
  const { evidence = {} } = options;
  const context = { ...options, evidence: evidence };
  return (
    getCaptureDateResultFromExif(context) ??
    getCaptureDateResultFromVideoMetadata(context) ??
    getCaptureDateResultFromFilename(context) ??
    getCaptureDateResultFromLastModified(context) ??
    makeCaptureDateResultFromInstant({
      instantMs: Date.parse(options.declaredAt),
      offsetMinutes: undefined,
      timezone: options.timezone,
      captureSource: "upload_time",
    })
  );
}

/**
 * Rung 5: the uploader moving a file to another day, before ingest.
 *
 * **The clock time and the offset are kept and only the date changes**, so a
 * 06:41 photograph becomes 06:41 on the new day and no fact is invented
 * (`upload.md` § the `milestone-fix` amendment), and a photograph taken at
 * -04:00 stays at -04:00 in a Shoebox set to another zone: moving the day does
 * not move the camera to another country, as it does not for an item's date
 * correction. A previous result without an offset resolves the kept clock in
 * `shoebox.timezone`. The one clock that is not kept is one the ladder
 * invented (see {@link _getClockToKeepFromPrevious}), which becomes noon.
 *
 * The date is read exactly as the amendment wrote it, its first ten
 * characters, because the uploader picked a day on the Shoebox's calendar and
 * converting it through any zone could move it.
 *
 * @param options.capturedAt The amendment as sent.
 * @param options.previous What the ladder had decided, whose clock and offset
 *   are kept. Null only for a row the ladder has not run on.
 * @param options.timezone The `shoebox.timezone` setting.
 */
export function getCaptureDateFromUploaderDate(
  options: Readonly<{
    capturedAt: string;
    previous: CaptureDateResult | undefined;
    timezone: string;
  }>,
): CaptureDateResult {
  const { localTime, offsetMinutes } = getClockToKeepFromPrevious(options);
  const capturedAt = makeInstantFromLocalWallClock({
    localDate: options.capturedAt.slice(0, 10),
    localTime,
    offsetMinutes: offsetMinutes ?? null,
    timezone: options.timezone,
  });
  return {
    capturedAt,
    captureDate: getCaptureDateFromInstant({
      instant: capturedAt,
      offsetMinutes,
      timezone: options.timezone,
    }),
    captureOffsetMinutes: offsetMinutes,
    captureSource: "uploader_set",
  };
}
