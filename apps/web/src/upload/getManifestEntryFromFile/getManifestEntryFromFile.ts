import type { ManifestEntry } from "@memory-shoebox/shared";

import { getDeclaredContentTypeFromFile } from "./getDeclaredContentTypeFromFile";

import { readFactsOrNothing } from "./readFactsOrNothing";

/**
 * One manifest entry for one picked file, from its headers alone.
 *
 * This lets the upload interface show the days list before a byte moves: the
 * EXIF date and offset, the post-orientation size, a video's `mvhd` creation
 * time, duration and track size, and `lastModified`. **It reads headers and
 * decodes nothing**, so a batch of 264 is declared in the time it takes to read
 * 264 small slices. It never throws on a malformed or unreadable file: that
 * file is declared with its `lastModified` alone.
 *
 * It reads the headers of any file declared as `image/*` or `video/*`, and only
 * of those: every other file is declared as it is. Whether a type is accepted
 * is the server's call, so an `image/bmp` is read here and refused there. The
 * browser supplies evidence, and the server picks the rung and does the
 * refusing.
 *
 * `contentHash` is left out, deliberately: it is optional here and required at
 * presign, and hashing 5 GB before the days list can appear would defeat the
 * point.
 *
 * @param options.file The picked file.
 * @param options.clientRef The caller's handle for it, echoed in the outcome.
 * @returns The entry to send in `PATCH .../manifest`.
 */
export async function getManifestEntryFromFile(
  options: Readonly<{
    file: File;
    clientRef: string;
  }>,
): Promise<ManifestEntry> {
  const { file } = options;
  const declaredContentType = getDeclaredContentTypeFromFile(file);
  const facts = await readFactsOrNothing({
    file,
    declaredContentType,
    lastModifiedAt: ((sourceFile: Readonly<File>): string | undefined => {
      const instant = new Date(sourceFile.lastModified);
      return Number.isNaN(instant.getTime())
        ? undefined
        : instant.toISOString();
    })(file),
  });
  return {
    clientRef: options.clientRef,
    originalFilename: file.name,
    declaredContentType,
    declaredBytes: file.size,
    ...facts,
  };
}
