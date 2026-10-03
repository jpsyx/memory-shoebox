import type {
  ManifestCaptureEvidence,
  ManifestEntry,
} from "@memory-shoebox/shared";
import { getImageHeaderFromFile } from "@/upload/getImageHeaderFromFile/getImageHeaderFromFile";
import { getQuickTimeHeaderFromBlob } from "@/upload/getQuickTimeHeaderFromBlob/getQuickTimeHeaderFromBlob";

/**
 * The type each accepted extension implies, for a `File` whose browser left
 * `type` empty. Chrome does that for HEIC on some platforms, and the server
 * refuses an empty type, so without this an iPhone's own photograph would be
 * refused as `unsupported_type`. It widens nothing: the server still checks
 * the declared type against `appConfig.upload.acceptedContentTypes`.
 */
const CONTENT_TYPE_BY_EXTENSION: ReadonlyMap<string, string> = new Map([
  ["heic", "image/heic"],
  ["heif", "image/heif"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["png", "image/png"],
  ["webp", "image/webp"],
  ["gif", "image/gif"],
  ["mov", "video/quicktime"],
  ["mp4", "video/mp4"],
]);

/** What a file with no type and no extension we know is declared as. */
const UNKNOWN_CONTENT_TYPE = "application/octet-stream";

/**
 * The content type a picked file is declared with.
 *
 * The browser's own `File.type`, lowercased, and only when it is empty the
 * type its extension implies. The engine routes a file to the image or the
 * video path by this same value, so the two can never disagree.
 */
export function getDeclaredContentTypeFromFile(
  file: Readonly<Pick<File, "name" | "type">>,
): string {
  if (file.type !== "") {
    return file.type.toLowerCase();
  }
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return CONTENT_TYPE_BY_EXTENSION.get(extension) ?? UNKNOWN_CONTENT_TYPE;
}

/** The fields of an entry that depend on what kind of file this is. */
type HeaderFacts = {
  capture: ManifestCaptureEvidence;
  width: number | null;
  height: number | null;
  durationMs: number | null;
};

/** A photograph's evidence: its EXIF date, offset and displayed size. */
async function _readImageFacts(options: {
  file: File;
  lastModifiedAt: string | null;
}): Promise<HeaderFacts> {
  const header = await getImageHeaderFromFile(options.file);
  return {
    capture: {
      exifCapturedAtLocal: header.exifCapturedAtLocal,
      exifOffsetMinutes: header.exifOffsetMinutes,
      lastModifiedAt: options.lastModifiedAt,
    },
    width: header.width,
    height: header.height,
    durationMs: null,
  };
}

/**
 * A video's evidence: its `mvhd` creation time and duration, and the size its
 * first video track displays at, rotation applied.
 */
async function _readVideoFacts(options: {
  file: File;
  lastModifiedAt: string | null;
}): Promise<HeaderFacts> {
  const movie = await getQuickTimeHeaderFromBlob(options.file);
  return {
    capture: {
      videoCreationTime: movie.creationTime,
      lastModifiedAt: options.lastModifiedAt,
    },
    width: movie.width,
    height: movie.height,
    durationMs: movie.durationMs,
  };
}

/** The ISO instant of `File.lastModified`, or null if it is not a real one. */
function _getLastModifiedAtFromFile(file: Readonly<File>): string | null {
  const instant = new Date(file.lastModified);
  return Number.isNaN(instant.getTime()) ? null : instant.toISOString();
}

/**
 * One manifest entry for one picked file, from its headers alone.
 *
 * This is what lets step 7b draw the days list before a byte moves: the EXIF
 * date and offset, the post-orientation size, a video's `mvhd` creation time,
 * duration and track size, and `lastModified`. **It reads headers and decodes
 * nothing**, so a batch of 264 is declared in the time it takes to read 264
 * small slices. It never throws on a malformed file, and it does not read a
 * file of a type the server will refuse: the browser supplies evidence, and
 * the server picks the rung and does the refusing.
 *
 * `contentHash` is left out, deliberately: it is optional here and required
 * at presign, and hashing 5 GB before the days list can appear would defeat
 * the point.
 *
 * @param options.file The picked file.
 * @param options.clientRef The caller's handle for it, echoed in the outcome.
 * @returns The entry to send in `PATCH .../manifest`.
 */
export async function getManifestEntryFromFile(options: {
  file: File;
  clientRef: string;
}): Promise<ManifestEntry> {
  const { file } = options;
  const declaredContentType = getDeclaredContentTypeFromFile(file);
  const lastModifiedAt = _getLastModifiedAtFromFile(file);
  const base = {
    clientRef: options.clientRef,
    originalFilename: file.name,
    declaredContentType,
    declaredBytes: file.size,
  };
  if (declaredContentType.startsWith("video/")) {
    return { ...base, ...(await _readVideoFacts({ file, lastModifiedAt })) };
  }
  if (declaredContentType.startsWith("image/")) {
    return { ...base, ...(await _readImageFacts({ file, lastModifiedAt })) };
  }
  return { ...base, capture: { lastModifiedAt } };
}
