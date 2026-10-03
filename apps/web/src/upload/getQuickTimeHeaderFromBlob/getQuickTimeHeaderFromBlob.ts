import type { QuickTimeHeader } from "./getQuickTimeHeaderFromBlob.types";

import { getMovieTimesFromMvhdBody } from "./getMovieTimesFromMvhdBody";

import {
  findAtom,
  getAtomEnd,
  readChildBody,
  findVideoTrackSize,
} from "./getQuickTimeHeaderFromBlobSupportHelpers";

import { MVHD_BODY_BYTES } from "./getQuickTimeHeaderFromBlob.constants";

/**
 * Returns a QuickTime or MP4 movie's creation time, duration and first video
 * track's displayed dimensions.
 *
 * Reads bounded header slices without decoding the video or loading all media
 * bytes. The dimensions let an undecodable video complete when no poster is
 * available.
 *
 * The browser reports evidence without judging it: zero creation_time remains
 * the 1904 epoch, for the server capture-date ladder to reject.
 *
 * @param blob The picked video file.
 * @returns Header fields with undefined for information the file does not
 *   supply.
 */
export async function getQuickTimeHeaderFromBlob(
  blob: Blob,
): Promise<QuickTimeHeader> {
  // Find moov among the top-level atoms, then read mvhd and the first sized
  // video
  // trak through small Blob.slice reads.

  const moov = await findAtom({
    blob,
    start: 0,
    end: blob.size,
    type: "moov",
  });
  if (moov === undefined) {
    return {
      creationTime: undefined,
      durationMs: undefined,
      width: undefined,
      height: undefined,
    } satisfies QuickTimeHeader;
  }
  const inside = {
    blob,
    start: moov.start + moov.headerBytes,
    end: getAtomEnd({ blob, atom: moov }),
  };
  const mvhd = await readChildBody({
    ...inside,
    type: "mvhd",
    bytes: MVHD_BODY_BYTES,
  });
  const times =
    mvhd === undefined ? undefined : getMovieTimesFromMvhdBody(mvhd);
  const size = await findVideoTrackSize(inside);
  return {
    creationTime: times?.creationTime ?? undefined,
    durationMs: times?.durationMs ?? undefined,
    width: size?.width ?? undefined,
    height: size?.height ?? undefined,
  };
}
