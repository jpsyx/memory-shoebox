import type { QuickTimeHeader } from "./getQuickTimeHeaderFromBlob.types";

/** Seconds from the QuickTime epoch (1904-01-01 UTC) to the Unix epoch. */
const QUICKTIME_EPOCH_OFFSET_SECONDS = 2_082_844_800;

/**
 * Reads an `mvhd` body: the bytes after its atom header, version byte first.
 *
 * Version 0 stores both times and the duration in 32 bits, version 1 in 64. The
 * all-ones duration is the format's own "unknown", and reads as undefined.
 *
 * @param body At least 20 bytes for version 0, 32 for version 1.
 * @returns The times, or undefined when the body is too short to be a header.
 */
export function getMovieTimesFromMvhdBody(
  body: Uint8Array,
): Pick<QuickTimeHeader, "creationTime" | "durationMs"> | undefined {
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  if (body.byteLength < 1) {
    return undefined;
  }
  const isVersion1 = view.getUint8(0) === 1;
  if (body.byteLength < (isVersion1 ? 32 : 20)) {
    return undefined;
  }
  const creationSeconds = isVersion1
    ? Number(view.getBigUint64(4))
    : view.getUint32(4);
  const timescale = view.getUint32(isVersion1 ? 20 : 12);
  const duration = isVersion1
    ? Number(view.getBigUint64(24))
    : view.getUint32(16);
  const creationInstant = new Date(
    (creationSeconds - QUICKTIME_EPOCH_OFFSET_SECONDS) * 1000,
  );
  const unknownDuration = isVersion1 ? Number(0xffffffffffffffffn) : 0xffffffff;
  const durationMs = Math.round((duration / timescale) * 1000);
  return {
    creationTime: Number.isNaN(creationInstant.getTime())
      ? undefined
      : creationInstant.toISOString(),
    durationMs:
      timescale === 0 ||
      duration === unknownDuration ||
      !Number.isSafeInteger(durationMs)
        ? undefined
        : durationMs,
  };
}
