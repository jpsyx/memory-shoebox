import type { MediaRef, MediaSource } from "@memory-shoebox/shared";

/** The measured frame bounds shared by display and neighbor selection. */
export type PhotoViewport = {
  cssWidth: number;
  cssHeight: number;
  devicePixelRatio: number;
  supportsWebp: boolean;
  supportsAvif?: boolean;
};

/** Fits real frame bounds and checks local WebP support without a request. */
export function getPhotoViewportFromElement(
  element?: HTMLElement | null,
): PhotoViewport {
  const width = element?.getBoundingClientRect().width ?? 0;
  return {
    cssWidth: width > 20 ? width - 20 : Math.min(window.innerWidth - 40, 960),
    cssHeight: window.innerHeight * 0.7,
    devicePixelRatio: window.devicePixelRatio || 1,
    supportsWebp: _supportsWebp(),
  };
}

/** Includes the thumbnail as a real candidate and supports older detail DTOs. */
export function getPhotoCandidatesFromMedia(
  media: Readonly<MediaRef>,
): MediaSource[] {
  const sources = [
    ...(media.displayCandidates.length > 0
      ? media.displayCandidates
      : [media.display]),
    media.thumb,
  ].filter((source) => {
    return source !== null;
  });
  return sources.filter((source, index) => {
    return (
      sources.findIndex((other) => {
        return (
          other.renditionId === source.renditionId && other.url === source.url
        );
      }) === index
    );
  });
}

let hasWebpSupport: boolean | undefined;
function _supportsWebp(): boolean {
  if (hasWebpSupport === undefined) {
    if (typeof CanvasRenderingContext2D === "undefined") {
      return false;
    }
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    hasWebpSupport = canvas
      .toDataURL("image/webp")
      .startsWith("data:image/webp");
  }
  return hasWebpSupport;
}
