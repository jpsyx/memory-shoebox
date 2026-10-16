import type { MediaRef } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { MediaLoadingProvider } from "../../MediaLoadingProvider/MediaLoadingProvider";
import { PhotoFrame } from "@/surfaces/Item/ItemViewer/PhotoFrame/PhotoFrame";

type Props = { itemId: string; media: MediaRef };

/** Renders an injected photograph through the real route-lifetime owner. */
export function MediaNavigationOwner({
  itemId,
  media,
}: Readonly<Props>): ReactNode {
  return (
    <MediaLoadingProvider memberId="member" routeKey={`/items/${itemId}`}>
      <PhotoFrame media={media} itemId={itemId} />
    </MediaLoadingProvider>
  );
}
