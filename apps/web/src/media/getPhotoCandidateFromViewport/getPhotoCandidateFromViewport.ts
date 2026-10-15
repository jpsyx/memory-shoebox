import {
  getImageCapabilityFromContentType,
  type MediaSource,
} from "@memory-shoebox/shared";

type Options = {
  candidates: readonly MediaSource[];
  cssWidth: number;
  cssHeight: number;
  devicePixelRatio: number;
  supportsWebp: boolean;
  supportsAvif?: boolean;
};

/** Chooses the smallest usable source that fills the uncropped viewport. */
export function getPhotoCandidateFromViewport(
  options: Readonly<Options>,
): MediaSource | undefined {
  const candidates = options.candidates
    .filter((source) => {
      const capability = getImageCapabilityFromContentType(source.contentType);
      return (
        source.width > 0 &&
        source.height > 0 &&
        source.byteSize > 0 &&
        (capability === "baseline" ||
          (options.supportsWebp && capability === "webp") ||
          (options.supportsAvif === true && capability === "avif"))
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
