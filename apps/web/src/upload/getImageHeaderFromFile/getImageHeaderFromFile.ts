import { parse as parseExif } from "exifr";

import type { ImageHeader } from "./getImageHeaderFromFile.types";

import { makeExifReadableBlobFromFile } from "./makeExifReadableBlobFromFile";

import {
  EXIF_READ_OPTIONS,
  exifOutputSchema,
} from "./getImageHeaderFromFile.constants";

import { makeImageHeaderFromExifOutput } from "./makeImageHeaderFromExifOutput";
import { getJpegSizeFromBlob } from "./getJpegSizeFromBlob/getJpegSizeFromBlob";

async function _getExifOutputFromFile(
  file: Blob,
): Promise<ReturnType<typeof exifOutputSchema.parse>> {
  try {
    const readable = await makeExifReadableBlobFromFile(file);
    const output: unknown = await parseExif(readable, EXIF_READ_OPTIONS);
    const parsed = exifOutputSchema.safeParse(output ?? {});
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

/**
 * An image's capture date, offset and displayed size, from its header alone.
 *
 * exifr reads in chunks through `Blob.slice`, so a 30 MB JPEG costs the few
 * kilobytes its EXIF block occupies. Nothing is decoded. A file exifr cannot
 * parse at all (a format it does not know, or a corrupted one) yields an empty
 * header rather than an error, because a header is evidence and the server has
 * four more rungs to fall back on. JPEG frame dimensions take precedence over
 * stale EXIF dimensions, including when EXIF itself is unreadable. One known
 * case: exifr reads the EXIF Apple
 * writes into a HEIC and reports libheif's (`heif-enc`, ImageMagick) as
 * malformed, so a HEIC from a non-Apple encoder falls past rung 1 to its
 * filename or `lastModified`.
 *
 * @param file A picked image: JPEG, HEIC, HEIF, PNG, WebP or GIF.
 * @returns What the header says, with undefined for whatever it does not.
 */
export async function getImageHeaderFromFile(file: Blob): Promise<ImageHeader> {
  const [output, jpegSize] = await Promise.all([
    _getExifOutputFromFile(file),
    getJpegSizeFromBlob(file),
  ]);
  return makeImageHeaderFromExifOutput({
    ...output,
    ...(jpegSize === undefined
      ? {}
      : {
          ExifImageWidth: jpegSize.width,
          ExifImageHeight: jpegSize.height,
        }),
  });
}
