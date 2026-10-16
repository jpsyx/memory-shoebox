import { APP_CONFIG } from "../../../../../app.config.ts";
import type { MediaProbe } from "./mediaRuntime.types.ts";

const LIMITS = APP_CONFIG.mediaProcessing;

function _isPositiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function _getPhotoFailure({
  probe,
  sourceBytes,
}: {
  probe: Readonly<MediaProbe>;
  sourceBytes: number;
}): string | undefined {
  if (
    sourceBytes > LIMITS.photoInputBytes ||
    probe.width * probe.height > LIMITS.photoPixels
  ) {
    return "processing_photo_limit";
  }
  if (
    probe.primaryImageCount !== 1 ||
    probe.frameRate !== undefined ||
    probe.durationMs !== undefined ||
    probe.hasAudio
  ) {
    return "processing_photo_not_still";
  }
  return probe.bitDepth > 16 || probe.transfer !== "sdr"
    ? "processing_photo_unsupported"
    : undefined;
}

function _getVideoFailure(probe: Readonly<MediaProbe>): string | undefined {
  if (
    Math.max(probe.width, probe.height) > LIMITS.videoLongEdge ||
    Math.min(probe.width, probe.height) > LIMITS.videoShortEdge
  ) {
    return "processing_video_dimensions";
  }
  if (
    probe.frameRate === undefined ||
    !Number.isFinite(probe.frameRate) ||
    probe.frameRate <= 0 ||
    probe.frameRate > LIMITS.videoFrameRate
  ) {
    return "processing_video_frame_rate";
  }
  if (
    probe.durationMs === undefined ||
    !Number.isFinite(probe.durationMs) ||
    probe.durationMs <= 0 ||
    probe.durationMs > LIMITS.videoDurationMs
  ) {
    return "processing_video_duration";
  }
  return probe.bitDepth > LIMITS.videoBitDepth
    ? "processing_video_bit_depth"
    : undefined;
}

/** Refuses unsupported inputs before their full decode. */
export function getMediaAdmissionFromProbe(
  options: Readonly<{ probe: MediaProbe; sourceBytes: number }>,
): { admitted: boolean; reason: string | undefined } {
  const { probe, sourceBytes } = options;
  if (
    ![
      _isPositiveInteger(sourceBytes),
      _isPositiveInteger(probe.width),
      _isPositiveInteger(probe.height),
      _isPositiveInteger(probe.bitDepth),
    ].every(Boolean) ||
    ![0, 90, 180, 270].includes(probe.rotationDegrees) ||
    probe.transfer === "unsupported"
  ) {
    return { admitted: false, reason: "processing_probe_invalid" };
  }
  const reason =
    probe.kind === "photo"
      ? _getPhotoFailure({ probe, sourceBytes })
      : _getVideoFailure(probe);
  return { admitted: reason === undefined, reason };
}
