import { z } from "zod";

import type { ImageHeader } from "./getImageHeaderFromFile.types";

import { getPostOrientationSizeFromHeader } from "./getPostOrientationSizeFromHeader";

import { getLocalDateTimeFromExifDate } from "./getLocalDateTimeFromExifDate";

import { getOffsetMinutesFromExifOffset } from "./getOffsetMinutesFromExifOffset";

import { exifOutputSchema } from "./getImageHeaderFromFile.constants";

/** What exifr's output says, as an `ImageHeader`. */
export function makeImageHeaderFromExifOutput(
  output: z.infer<typeof exifOutputSchema>,
): ImageHeader {
  const storedWidth = output.ExifImageWidth ?? output.ImageWidth;
  const storedHeight = output.ExifImageHeight ?? output.ImageHeight;
  const size =
    storedWidth === undefined || storedHeight === undefined
      ? { width: undefined, height: undefined }
      : getPostOrientationSizeFromHeader({
          width: storedWidth,
          height: storedHeight,
          orientation: output.Orientation,
        });
  return {
    exifCapturedAtLocal:
      output.DateTimeOriginal === undefined
        ? undefined
        : getLocalDateTimeFromExifDate(output.DateTimeOriginal),
    exifOffsetMinutes:
      output.OffsetTimeOriginal === undefined
        ? undefined
        : getOffsetMinutesFromExifOffset(output.OffsetTimeOriginal),
    ...size,
  };
}
