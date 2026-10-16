import type { MouseEvent } from "react";
import { useRouter } from "@tanstack/react-router";
import { useMediaLoading } from "./MediaLoadingContext";
import { getSelectedSourceFromPreview } from "./getSelectedSourceFromPreview";

/**
 * Ordinary same-tab links transfer ownership before the router can clean up.
 */
export function useMediaLink({
  itemId,
  direction,
}: {
  itemId: string;
  direction: "previous" | "next";
}): (event: MouseEvent<HTMLAnchorElement>) => void {
  const resources = useMediaLoading();
  const router = useRouter();
  return (event) => {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.defaultPrevented
    ) {
      return;
    }
    event.preventDefault();
    const release = resources.navigation.prepare({
      itemId,
      direction,
      source: getSelectedSourceFromPreview({
        preview: resources.previews.read(itemId),
        viewport: resources.navigation.viewport,
      }),
    });
    void router
      .navigate({
        to: "/items/$itemId",
        params: { itemId },
        replace: true,
        resetScroll: false,
        state: (state) => {
          return state;
        },
      })
      .catch(release)
      .finally(() => {
        resources.navigation.complete(release);
      });
  };
}
