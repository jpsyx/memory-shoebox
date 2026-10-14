import { useContext, useLayoutEffect } from "react";
import type { MediaSource } from "@memory-shoebox/shared";
import { MediaLoadingContext } from "./MediaLoadingContext";

/** Adopts the existing navigation lease and releases only this view's claim. */
export function useMediaSourceOwnership(
  options: Readonly<{
    itemId: string;
    source: Pick<MediaSource, "url" | "renditionId"> | undefined;
  }>,
): void {
  const resources = useContext(MediaLoadingContext);
  const { itemId } = options;
  const url = options.source?.url;
  const renditionId = options.source?.renditionId;
  useLayoutEffect(() => {
    return resources?.navigation.adopt({
      itemId,
      source:
        url === undefined || renditionId === undefined
          ? undefined
          : { url, renditionId },
    });
  }, [resources, itemId, url, renditionId]);
}
