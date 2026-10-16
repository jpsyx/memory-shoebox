import type { MediaPreview } from "@memory-shoebox/shared";
import { useRef, useState, type ReactNode } from "react";
import {
  ViewerReadinessContext,
  type ViewerReadiness,
} from "../../PhotoReadinessContext";
import { useVideoReadiness } from "../../useVideoReadiness/useVideoReadiness";
import { MediaNavigationVideoNeighbors } from "./MediaNavigationVideoNeighbors";

type Props = { preview: MediaPreview };

/**
 * Publishes video readiness before rendering the neighboring-photo consumer.
 */
export function MediaNavigationVideoOrigin({
  preview,
}: Readonly<Props>): ReactNode {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [readiness, setReadiness] = useState<ViewerReadiness>();
  useVideoReadiness({
    itemId: "video",
    enabled: true,
    videoRef,
    onReady: setReadiness,
  });
  return (
    <ViewerReadinessContext value={readiness}>
      <div>
        <video ref={videoRef} />
      </div>
      <MediaNavigationVideoNeighbors preview={preview} />
    </ViewerReadinessContext>
  );
}
