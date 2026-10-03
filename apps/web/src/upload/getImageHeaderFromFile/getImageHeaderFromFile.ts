import { parse as parseExif } from "exifr";
import { z } from "zod";

/** What an image's header says, read without decoding a pixel. */
export type ImageHeader = {
  /** EXIF `DateTimeOriginal` with no zone applied: "2026-09-14T06:41:32". */
  exifCapturedAtLocal: string | null;
  /** EXIF `OffsetTimeOriginal`, in minutes east of UTC. */
  exifOffsetMinutes: number | null;
  /** Post-orientation, so a portrait photograph reads as portrait. */
  width: number | null;
  height: number | null;
};

/**
 * Exactly the tags the ladder and the derivatives need, block by block.
 *
 * Per block rather than one top-level `pick`, because a top-level `pick`
 * stops exifr reading a PNG's `IHDR`, which is the only place a screenshot
 * keeps its size. `gps: false` is not decoration: without it exifr parses
 * every location tag a phone wrote, and nothing here may hold one.
 * `reviveValues: false` keeps `DateTimeOriginal` the string the file carried:
 * revived, exifr reads it as a wall clock in the browser's own zone, which is
 * exactly the guess `upload.md` § The capture-date ladder forbids.
 */
const EXIF_READ_OPTIONS = {
  ifd0: { pick: ["Orientation"] },
  exif: {
    pick: [
      "DateTimeOriginal",
      "OffsetTimeOriginal",
      "ExifImageWidth",
      "ExifImageHeight",
    ],
  },
  gps: false,
  ihdr: { pick: ["ImageWidth", "ImageHeight"] },
  translateValues: false,
  reviveValues: false,
};

/** A pixel count: a number, or the one-element array some writers use. */
const pixelCountSchema = z
  .union([z.number(), z.array(z.number()).min(1)])
  .transform((value) => {
    return Array.isArray(value) ? value[0] : value;
  })
  .pipe(z.number().int().positive());

/**
 * What exifr hands back, checked field by field: one malformed tag costs that
 * tag, never the whole header.
 */
const exifOutputSchema = z.object({
  DateTimeOriginal: z.string().optional().catch(undefined),
  OffsetTimeOriginal: z.string().optional().catch(undefined),
  Orientation: z.number().int().optional().catch(undefined),
  ExifImageWidth: pixelCountSchema.optional().catch(undefined),
  ExifImageHeight: pixelCountSchema.optional().catch(undefined),
  ImageWidth: pixelCountSchema.optional().catch(undefined),
  ImageHeight: pixelCountSchema.optional().catch(undefined),
});

/**
 * exifr 7.1.3 refuses an HEIC whose `ftyp` box is over 50 bytes
 * (`src/file-parsers/heif.mjs`), and the newest iPhones write a 52-byte one
 * (`mif1 MiHB MiHA heix` after `heic`). That was 8 of the spike's 105.
 */
const EXIFR_MAX_FTYP_BYTES = 50;

/** No real `ftyp` is anywhere near this; past it, the file is not HEIF. */
const MAX_PLAUSIBLE_FTYP_BYTES = 1024;

/** Header, major brand, minor version and one compatible brand. */
const SHORT_FTYP_BYTES = 20;

/** The ASCII bytes of a four-character code. */
function _fourCc(code: string): Uint8Array {
  return new TextEncoder().encode(code);
}

/**
 * The same file, with a short `ftyp` exifr accepts, when it needs one.
 *
 * Rewritten to the same length: a 20-byte `ftyp` (the original major brand,
 * and `heic` as its one compatible brand) followed by a `free` box filling the
 * rest. Every later byte keeps its offset, which matters because the `iloc`
 * table that locates the EXIF block counts from the start of the file. The
 * result is a `Blob` of two parts, so nothing is copied but the header.
 *
 * @param file A picked image. Anything that is not HEIF comes back untouched.
 * @returns A blob exifr can read the same tags out of.
 */
export async function makeExifReadableBlobFromFile(file: Blob): Promise<Blob> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (head.byteLength < 12) {
    return file;
  }
  const ftypBytes = new DataView(head.buffer).getUint32(0);
  const isFtyp =
    new TextDecoder("latin1").decode(head.subarray(4, 8)) === "ftyp";
  if (
    !isFtyp ||
    ftypBytes <= EXIFR_MAX_FTYP_BYTES ||
    ftypBytes > MAX_PLAUSIBLE_FTYP_BYTES
  ) {
    return file;
  }
  const replacement = new Uint8Array(ftypBytes);
  const view = new DataView(replacement.buffer);
  view.setUint32(0, SHORT_FTYP_BYTES);
  replacement.set(_fourCc("ftyp"), 4);
  replacement.set(head.subarray(8, 12), 8);
  replacement.set(_fourCc("heic"), 16);
  view.setUint32(SHORT_FTYP_BYTES, ftypBytes - SHORT_FTYP_BYTES);
  replacement.set(_fourCc("free"), SHORT_FTYP_BYTES + 4);
  return new Blob([replacement, file.slice(ftypBytes)]);
}

/**
 * EXIF's "2026:09:14 06:41:32" as "2026-09-14T06:41:32", or null.
 *
 * The all-zero date some cameras write for "not set" is not a date, and
 * neither is anything else that does not have this exact shape.
 */
export function getLocalDateTimeFromExifDate(exifDate: string): string | null {
  const match = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(
    exifDate.trim(),
  );
  if (match === null) {
    return null;
  }
  const [, year, month, day, hour, minute, second] = match;
  const isPlausible =
    year !== "0000" &&
    Number(month) >= 1 &&
    Number(month) <= 12 &&
    Number(day) >= 1 &&
    Number(day) <= 31 &&
    Number(hour) <= 23 &&
    Number(minute) <= 59 &&
    Number(second) <= 59;
  return isPlausible
    ? `${year}-${month}-${day}T${hour}:${minute}:${second}`
    : null;
}

/** EXIF's "+02:00" as 120 and "-05:30" as -330, or null if it is not one. */
export function getOffsetMinutesFromExifOffset(
  exifOffset: string,
): number | null {
  const match = /^([+-])(\d{2}):(\d{2})$/.exec(exifOffset.trim());
  if (match === null) {
    return null;
  }
  const [, sign, hours, minutes] = match;
  const total = Number(hours) * 60 + Number(minutes);
  if (Number(minutes) > 59 || total > 14 * 60) {
    return null;
  }
  return sign === "-" ? -total : total;
}

/**
 * The size an image displays at, from the size it was stored at.
 *
 * EXIF orientations 5 to 8 are the four that turn the picture a quarter, so
 * they swap the stored width and height. 1 to 4 flip or turn it a half, which
 * leaves the box alone, and so does a missing or unknown orientation.
 */
export function getPostOrientationSizeFromHeader(
  options: Readonly<{ width: number; height: number; orientation?: number }>,
): { width: number; height: number } {
  const isQuarterTurn =
    options.orientation !== undefined &&
    options.orientation >= 5 &&
    options.orientation <= 8;
  return isQuarterTurn
    ? { width: options.height, height: options.width }
    : { width: options.width, height: options.height };
}

/** The header of an image exifr could make nothing of. */
const EMPTY_HEADER: ImageHeader = {
  exifCapturedAtLocal: null,
  exifOffsetMinutes: null,
  width: null,
  height: null,
};

/** What exifr's output says, as an `ImageHeader`. */
function _makeImageHeaderFromExifOutput(
  output: z.infer<typeof exifOutputSchema>,
): ImageHeader {
  const storedWidth = output.ExifImageWidth ?? output.ImageWidth;
  const storedHeight = output.ExifImageHeight ?? output.ImageHeight;
  const size =
    storedWidth === undefined || storedHeight === undefined
      ? { width: null, height: null }
      : getPostOrientationSizeFromHeader({
          width: storedWidth,
          height: storedHeight,
          orientation: output.Orientation,
        });
  return {
    exifCapturedAtLocal:
      output.DateTimeOriginal === undefined
        ? null
        : getLocalDateTimeFromExifDate(output.DateTimeOriginal),
    exifOffsetMinutes:
      output.OffsetTimeOriginal === undefined
        ? null
        : getOffsetMinutesFromExifOffset(output.OffsetTimeOriginal),
    ...size,
  };
}

/**
 * An image's capture date, offset and displayed size, from its header alone.
 *
 * exifr reads in chunks through `Blob.slice`, so a 30 MB JPEG costs the few
 * kilobytes its EXIF block occupies. Nothing is decoded. A file exifr cannot
 * parse at all (a format it does not know, or a corrupted one) yields an
 * empty header rather than an error, because a header is evidence and the
 * server has four more rungs to fall back on. One known case: exifr reads the
 * EXIF Apple writes into a HEIC and reports libheif's (`heif-enc`,
 * ImageMagick) as malformed, so a HEIC from a non-Apple encoder falls past
 * rung 1 to its filename or `lastModified`.
 *
 * @param file A picked image: JPEG, HEIC, HEIF, PNG, WebP or GIF.
 * @returns What the header says, with nulls for whatever it does not.
 */
export async function getImageHeaderFromFile(file: Blob): Promise<ImageHeader> {
  try {
    const readable = await makeExifReadableBlobFromFile(file);
    const output: unknown = await parseExif(readable, EXIF_READ_OPTIONS);
    const parsed = exifOutputSchema.safeParse(output ?? {});
    return parsed.success
      ? _makeImageHeaderFromExifOutput(parsed.data)
      : EMPTY_HEADER;
  } catch {
    return EMPTY_HEADER;
  }
}
