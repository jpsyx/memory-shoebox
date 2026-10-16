import { useVisibleThumbnail } from "@/media/useVisibleThumbnail/useVisibleThumbnail";
import { useReSigning } from "@/surfaces/Timeline/useReSigning/useReSigning";
import { usePhotoArrival } from "@/system/motion/usePhotoArrival";
import type { RefCallback } from "react";
import type { Props } from "./Print.types";

type MediaState = {
  media: Props["media"];
  thumbnail: ReturnType<typeof useVisibleThumbnail>;
  reference: RefCallback<HTMLButtonElement>;
};

/**
 * Keeps renewal, thumbnail visibility and arrival attached to the print button.
 */
export function usePrintMedia({
  media: initialMedia,
  itemId,
  mediaItemId = itemId,
}: Readonly<Pick<Props, "media" | "itemId" | "mediaItemId">>): MediaState {
  const photoRef = usePhotoArrival<HTMLButtonElement>(
    itemId,
    initialMedia.thumb?.url ?? "",
  );
  const media = useReSigning({
    itemId: mediaItemId,
    media: initialMedia,
    element: photoRef,
  }) ?? { ...initialMedia, thumb: null };
  const thumbnail = useVisibleThumbnail({
    itemId: mediaItemId ?? initialMedia.thumb?.renditionId ?? "",
    source: media.thumb ?? undefined,
  });
  return {
    media,
    thumbnail,
    reference: (element) => {
      photoRef.current = element;
      return thumbnail.ref(element);
    },
  };
}
