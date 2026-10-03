import { join } from "node:path";

import type { WriteClipOptions } from "./makeUploadFixtures.types.ts";

import { run } from "./uploadPhotoFixtureHelpers.ts";

import { FIXTURE_DIRECTORY } from "./makeUploadFixtures.constants.ts";

/**
 * Two seconds of FFmpeg's test pattern, with `creation_time` in `mvhd`.
 *
 * `+faststart` puts `moov` before `mdat`, which is where a phone puts it and
 * what lets the browser read `creation_time` from the first few kilobytes.
 */
function _writeClip(
  options: Readonly<Omit<WriteClipOptions, "codecArgs">> &
    Readonly<{ codecArgs: readonly string[] }>,
): void {
  run({
    command: "ffmpeg",
    args: [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      `${options.pattern}=size=320x240:rate=15:duration=2`,
      ...options.codecArgs,
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-metadata",
      `creation_time=${options.creationTime}`,
      "-an",
      options.targetPath,
    ],
  });
}

/** The two clips: H.264 in MP4, and HEVC tagged `hvc1` in QuickTime. */
export function writeVideoFixtures(): void {
  _writeClip({
    pattern: "testsrc",
    codecArgs: ["-c:v", "libx264", "-profile:v", "baseline"],
    creationTime: "2026-05-04T12:00:00.000000Z",
    targetPath: join(FIXTURE_DIRECTORY, "h264-clip.mp4"),
  });
  // `hvc1` rather than FFmpeg's default `hev1`, because Safari plays only
  // `hvc1`, and it is the tag an iPhone writes.
  _writeClip({
    pattern: "testsrc2",
    codecArgs: [
      "-c:v",
      "libx265",
      "-x265-params",
      "log-level=error",
      "-tag:v",
      "hvc1",
      "-f",
      "mov",
    ],
    creationTime: "2026-05-05T12:00:00.000000Z",
    targetPath: join(FIXTURE_DIRECTORY, "hevc-clip.mov"),
  });
}
