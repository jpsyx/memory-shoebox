import type { MediaPreview } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { useNeighborPrefetch } from "../../useNeighborPrefetch";
import { MediaNavigationMove } from "./MediaNavigationMove";

type Props = { preview: MediaPreview };

/** Warms the photo boundary while the test viewer still owns a video. */
export function MediaNavigationVideoNeighbors({
  preview,
}: Readonly<Props>): ReactNode {
  useNeighborPrefetch({
    itemId: "video",
    enabled: true,
    neighbors: { ahead: [preview], behind: [] },
  });
  return <MediaNavigationMove />;
}
