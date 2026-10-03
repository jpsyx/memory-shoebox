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
