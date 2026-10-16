import {
  PhotoReadinessContext,
  ViewerReadinessContext,
  type ViewerReadiness,
} from "@/media/PhotoReadinessContext";
import { useRef, useState, type ReactNode } from "react";
import { ItemTopBar } from "./ItemTopBar";
import { useVideoTransport } from "./useVideoTransport";
import { ItemViewerConversation } from "./ItemViewerConversation";
import type { Props } from "./ItemViewer.types";
import { useWayBack } from "./useWayBack";
import { ItemNavigation } from "./ItemNavigation/ItemNavigation";
/** Both media kinds use the same surface; photo siblings retain their focus. */
export function ItemViewer({
  detail,
  selectedPreview,
  isPlaceholder,
  viewer,
  timezone,
}: Readonly<Props>): ReactNode {
  const [readiness, setReadiness] = useState<ViewerReadiness>();
  const wayBack = useWayBack(detail.capturedOn);
  const transport = useVideoTransport(detail.itemId);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  return (
    <PhotoReadinessContext value={setReadiness}>
      <ViewerReadinessContext value={readiness}>
        <ItemTopBar capturedOn={detail.capturedOn}>
          <ItemNavigation
            detail={detail}
            isPlaceholder={isPlaceholder}
            memberId={viewer.memberId}
          />
        </ItemTopBar>
        <ItemViewerConversation
          detail={detail}
          selectedPreview={selectedPreview}
          isPlaceholder={isPlaceholder}
          viewer={viewer}
          timezone={timezone}
          transport={transport}
          onDeleted={wayBack.leave}
          fieldRef={fieldRef}
        />
      </ViewerReadinessContext>
    </PhotoReadinessContext>
  );
}
