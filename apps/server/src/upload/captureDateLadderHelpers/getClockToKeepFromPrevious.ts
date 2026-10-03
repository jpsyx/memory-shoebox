import type { CaptureSource } from "@memory-shoebox/shared";

import { getLocalWallClockFromInstant } from "../../time/wallClockHelpers.ts";

import type { CaptureDateResult } from "./captureDateLadderHelpers.types.ts";

import { DATE_ONLY_CLOCK_TIME } from "./captureDateLadderHelpers.constants.ts";

/**
 * The clock and offset an amendment keeps from what the ladder had decided.
 *
 * **A clock the ladder invented is not kept**: `file_mtime` and `upload_time`
 * record when the file was saved or declared, so keeping one invents a capture
 * time. Those, and a row the ladder never ran on, get noon, as a date-only
 * filename does, and such files never join a burst (design decision 16).
 * Every other source's clock was read from the file or picked by the
 * uploader, and is kept together with its offset.
 */
export function getClockToKeepFromPrevious(
  options: Readonly<{
    previous: CaptureDateResult | undefined;
    timezone: string;
  }>,
): { localTime: string; offsetMinutes: number | undefined } {
  const { previous } = options;
  return previous === undefined ||
    (
      ["file_mtime", "upload_time"] as const satisfies readonly CaptureSource[]
    ).some((source) => {
      return source === previous.captureSource;
    })
    ? { localTime: DATE_ONLY_CLOCK_TIME, offsetMinutes: undefined }
    : {
        localTime: getLocalWallClockFromInstant({
          instant: previous.capturedAt,
          offsetMinutes: previous.captureOffsetMinutes ?? null,
          timezone: options.timezone,
        }),
        offsetMinutes: previous.captureOffsetMinutes,
      };
}
