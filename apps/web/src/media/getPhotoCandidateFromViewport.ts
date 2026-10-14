import type { MediaSource } from "@memory-shoebox/shared";

type Options = {
  candidates: readonly MediaSource[];
  cssWidth: number;
  cssHeight: number;
  devicePixelRatio: number;
  supportsWebp: boolean;
};

/** Chooses the smallest usable source that fills the uncropped viewport. */
export function getPhotoCandidateFromViewport(
  options: Readonly<Options>,
): MediaSource | undefined {
  const candidates = options.candidates
    .filter((source) => {
      return (
        source.width > 0 &&
        source.height > 0 &&
        source.byteSize > 0 &&
        (source.contentType === "image/jpeg" ||
          (options.supportsWebp && source.contentType === "image/webp"))
      );
    })
    .toSorted((left, right) => {
      return left.width - right.width || left.byteSize - right.byteSize;
    });
  const largest = candidates.at(-1);
  if (largest === undefined) {
    return undefined;
  }
  const cssWidth = Math.min(
    Math.max(1, options.cssWidth),
    (Math.max(1, options.cssHeight) * largest.width) / largest.height,
  );
  const targetWidth = cssWidth * Math.max(1, options.devicePixelRatio);
  return (
    candidates.find((source) => {
      return source.width >= targetWidth;
    }) ??
    candidates.find((source) => {
      return source.width === largest.width;
    })
  );
}
