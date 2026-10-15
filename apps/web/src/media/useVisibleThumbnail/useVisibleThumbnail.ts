import type { MediaSource } from "@memory-shoebox/shared";
import { useCallback, useContext, useState, type RefCallback } from "react";
import { MediaLoadingContext } from "../MediaLoadingContext";

/** Withholds network sources until positive intersection; eager work shares one surface budget. */
export function useVisibleThumbnail(
  options: Readonly<{
    itemId: string;
    source: MediaSource | null;
  }>,
): {
  ref: RefCallback<HTMLElement>;
  loading: "eager" | "lazy";
  source: MediaSource | null;
} {
  const resources = useContext(MediaLoadingContext);
  const [entry, setEntry] = useState<{ itemId: string; eager: boolean }>();
  const ref = useCallback<RefCallback<HTMLElement>>(
    (element) => {
      if (element === null) {
        return;
      }
      const observer = new IntersectionObserver(
        (entries) => {
          if (
            !entries.some((candidate) => {
              return (
                candidate.target === element &&
                candidate.isIntersecting &&
                candidate.intersectionRatio > 0
              );
            })
          ) {
            return;
          }
          setEntry((previous) => {
            return previous?.itemId === options.itemId
              ? previous
              : {
                  itemId: options.itemId,
                  eager: resources?.thumbnails.claim(options.itemId) ?? false,
                };
          });
          observer.disconnect();
        },
        { rootMargin: "0px", threshold: 0 },
      );
      observer.observe(element);
      return () => {
        return observer.disconnect();
      };
    },
    [options.itemId, resources],
  );
  const entered = entry?.itemId === options.itemId;
  return {
    ref,
    loading: entered && entry.eager ? "eager" : "lazy",
    source: entered ? options.source : null,
  };
}
