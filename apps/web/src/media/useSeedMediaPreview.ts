import { useContext, useEffect } from "react";
import type { MediaRef } from "@memory-shoebox/shared";
import { MediaLoadingContext } from "./MediaLoadingContext";

type PreviewMedia = Pick<
  MediaRef,
  "thumb" | "width" | "height" | "altText" | "previewState"
> &
  Partial<MediaRef>;
/** Retains known print pixels without replacing a richer warmed preview. */
export function useSeedMediaPreview(
  options: Readonly<{
    itemId: string | undefined;
    media: PreviewMedia;
    kind?: "photo" | "video";
  }>,
): void {
  const resources = useContext(MediaLoadingContext);
  const { itemId, media, kind } = options;
  useEffect(
    function seedMediaPreview() {
      if (
        resources === undefined ||
        itemId === undefined ||
        resources.leases.isDenied(itemId) ||
        resources.previews.read(itemId) !== undefined
      ) {
        return;
      }
      resources.previews.put({
        previews: [
          {
            itemId,
            kind:
              kind ??
              (media.durationMs !== undefined && media.durationMs !== null
                ? "video"
                : "photo"),
            width: media.width,
            height: media.height,
            media: {
              display: null,
              displayCandidates: [],
              poster: null,
              playback: null,
              durationMs: null,
              ...media,
            },
          },
        ],
      });
    },
    [resources, itemId, media, kind],
  );
}
