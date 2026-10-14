import type { MediaPreview, MediaSource } from "@memory-shoebox/shared";
import { getPhotoCandidateFromViewport } from "./getPhotoCandidateFromViewport";
import {
  getPhotoCandidatesFromMedia,
  getPhotoViewportFromElement,
} from "./photoViewport";

/** Shares exact source choice between navigation ownership and rendering. */
export function getSelectedSourceFromPreview(
  preview: Readonly<MediaPreview> | undefined,
  viewport = getPhotoViewportFromElement(),
): MediaSource | undefined {
  if (preview === undefined) {
    return undefined;
  }
  return preview.kind === "video"
    ? (preview.media.poster ?? preview.media.thumb ?? undefined)
    : getPhotoCandidateFromViewport({
        ...viewport,
        candidates: getPhotoCandidatesFromMedia(preview.media),
      });
}
