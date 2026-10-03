import { z } from "zod";

import type { ImageHeader } from "./getImageHeaderFromFile.types";

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
export const EXIF_READ_OPTIONS = {
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
export const exifOutputSchema = z.object({
  DateTimeOriginal: z.string().optional().catch(undefined),
  OffsetTimeOriginal: z.string().optional().catch(undefined),
  Orientation: z.number().int().optional().catch(undefined),
  ExifImageWidth: pixelCountSchema.optional().catch(undefined),
  ExifImageHeight: pixelCountSchema.optional().catch(undefined),
  ImageWidth: pixelCountSchema.optional().catch(undefined),
  ImageHeight: pixelCountSchema.optional().catch(undefined),
});

/** The header of an image exifr could make nothing of. */
export const EMPTY_HEADER: ImageHeader = {
  exifCapturedAtLocal: undefined,
  exifOffsetMinutes: undefined,
  width: undefined,
  height: undefined,
};
