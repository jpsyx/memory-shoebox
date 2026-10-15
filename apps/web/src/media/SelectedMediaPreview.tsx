import { PhotoFrame } from "@/surfaces/Item/ItemViewer/PhotoFrame/PhotoFrame";
import type { MediaPreview } from "@memory-shoebox/shared";
import type { ReactNode } from "react";

type Props = { preview: MediaPreview | undefined };
/** Pending detail grants pixels only; videos remain posters until authorized. */
export function SelectedMediaPreview({ preview }: Readonly<Props>): ReactNode {
  if (preview === undefined) {
    return null;
  }
  const media =
    preview.kind === "photo"
      ? preview.media
      : {
          ...preview.media,
          display: preview.media.poster,
          displayCandidates:
            preview.media.poster === null ? [] : [preview.media.poster],
        };
  return (
    <PhotoFrame
      key={preview.itemId}
      itemId={preview.itemId}
      media={media}
      presentation="preview"
    />
  );
}
