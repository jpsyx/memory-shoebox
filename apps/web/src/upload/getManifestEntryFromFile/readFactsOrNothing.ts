import { getImageHeaderFromFile } from "@/upload/getImageHeaderFromFile/getImageHeaderFromFile";

import { getQuickTimeHeaderFromBlob } from "@/upload/getQuickTimeHeaderFromBlob/getQuickTimeHeaderFromBlob";

import type { HeaderFacts } from "./getManifestEntryFromFile.types";

/** A photograph's evidence: its EXIF date, offset and displayed size. */
async function _readImageFacts(options: {
  file: File;
  lastModifiedAt: string | undefined;
}): Promise<HeaderFacts> {
  const header = await getImageHeaderFromFile(options.file);
  return {
    capture: {
      exifCapturedAtLocal: header.exifCapturedAtLocal ?? null,
      exifOffsetMinutes: header.exifOffsetMinutes ?? null,
      lastModifiedAt: options.lastModifiedAt ?? null,
    },
    width: header.width ?? null,
    height: header.height ?? null,
    durationMs: null,
  };
}

/**
 * A video's evidence: its `mvhd` creation time and duration, and the size its
 * first video track displays at, rotation applied.
 */
async function _readVideoFacts(options: {
  file: File;
  lastModifiedAt: string | undefined;
}): Promise<HeaderFacts> {
  const movie = await getQuickTimeHeaderFromBlob(options.file);
  return {
    capture: {
      videoCreationTime: movie.creationTime ?? null,
      lastModifiedAt: options.lastModifiedAt ?? null,
    },
    width: movie.width ?? null,
    height: movie.height ?? null,
    durationMs: movie.durationMs ?? null,
  };
}

/**
 * What the headers of a picked file say, or only its `lastModified` when
 * they cannot be read.
 *
 * Only a file declared as an image or a video is read. A file whose bytes
 * cannot be read (a truncated movie, a file the browser lost access to) is
 * still declared, with no evidence: one bad file must not fail the whole
 * batch's manifest.
 */
export async function readFactsOrNothing(
  options: Readonly<{
    file: File;
    declaredContentType: string;
    lastModifiedAt: string | undefined;
  }>,
): Promise<HeaderFacts> {
  const { file, lastModifiedAt } = options;
  try {
    if (options.declaredContentType.startsWith("video/")) {
      return await _readVideoFacts({ file, lastModifiedAt });
    }
    if (options.declaredContentType.startsWith("image/")) {
      return await _readImageFacts({ file, lastModifiedAt });
    }
  } catch {
    // Falls through to the no-evidence answer below.
  }
  return { capture: { lastModifiedAt } };
}
