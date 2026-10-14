import type { RefObject } from "react";
import type { MediaRef } from "@memory-shoebox/shared";
import { useMediaLease } from "@/media/useMediaLease";
import { useMediaVisibility } from "@/media/useMediaVisibility";

type PrintMedia = Pick<
  MediaRef,
  "thumb" | "width" | "height" | "previewState" | "altText"
> &
  Partial<MediaRef>;
/** Registers actual visible prints, fan frames and siblings for media-only renewal. */
export function useReSigning(
  options: Readonly<{
    itemId: string | undefined;
    media: PrintMedia;
    element: RefObject<Element | null>;
  }>,
): MediaRef | undefined {
  const isVisible = useMediaVisibility(options.element);
  return useMediaLease({
    itemId: options.itemId ?? "",
    initialMedia: {
      display: null,
      displayCandidates: [],
      poster: null,
      playback: null,
      durationMs: null,
      ...options.media,
    },
    purpose: "speculative-preview",
    isVisible: options.itemId !== undefined && isVisible,
  }).media;
}
