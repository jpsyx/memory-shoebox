import type { DecodedPhotoSnapshot } from "@/media/createMediaNavigation";
import type { MediaRef } from "@memory-shoebox/shared";
import { useLayoutEffect, useRef, type ReactNode } from "react";

type Props = {
  snapshot: DecodedPhotoSnapshot;
  media: MediaRef;
  onUnavailable: () => void;
};

/**
 * Temporarily hosts the owned native image without assigning another source.
 */
export function DecodedPhotoHandoff({
  snapshot,
  media,
  onUnavailable,
}: Readonly<Props>): ReactNode {
  const host = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const container = host.current;
    const image = snapshot.getImage();
    if (container === null || image === undefined) {
      onUnavailable();
      return;
    }
    image.alt = media.altText;
    image.width = media.width;
    image.height = media.height;
    container.append(image);
    return () => {
      if (image.parentElement === container) {
        image.remove();
      }
    };
  }, [snapshot, media.altText, media.width, media.height, onUnavailable]);
  return <div ref={host} data-decoded-photo-handoff />;
}
