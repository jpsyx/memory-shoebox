import {
  PhotoReadinessContext,
  ViewerReadinessContext,
  type ViewerReadiness,
} from "@/media/PhotoReadinessContext";
import { clsx } from "clsx";
import { useRef, useState, type ReactNode } from "react";
import { ItemTopBar } from "./ItemTopBar";
import { useTheaterCommentDock } from "../ItemTheater/useTheaterCommentDock";
import classes from "./ItemViewer.module.css";
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
  theater,
  transport,
}: Readonly<Props>): ReactNode {
  const [readiness, setReadiness] = useState<ViewerReadiness>();
  const wayBack = useWayBack(detail.capturedOn);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const dockController = useTheaterCommentDock({
    presentation: theater.presentation,
    itemId: detail.itemId,
    fieldRef,
    isUnavailable: isPlaceholder,
  });
  return (
    <PhotoReadinessContext value={setReadiness}>
      <ViewerReadinessContext value={readiness}>
        <div
          className={clsx(
            classes.itemViewerChrome,
            theater.presentation === "theater" &&
              classes.itemViewerTheaterChrome,
          )}
        >
          <div
            className={classes.itemViewerPageControls}
            hidden={theater.presentation === "theater"}
          >
            <ItemTopBar capturedOn={detail.capturedOn} />
          </div>
          <div
            hidden={
              theater.presentation === "theater" || detail.kind === "video"
            }
          >
            {detail.kind === "photo" ? (
              <button
                className={classes.itemViewerEntry}
                type="button"
                data-theater-entry
                onClick={theater.enter}
                disabled={isPlaceholder}
              >
                Enter theater
              </button>
            ) : null}
          </div>
          <ItemNavigation
            detail={detail}
            isPlaceholder={isPlaceholder}
            memberId={viewer.memberId}
            presentation={theater.presentation}
            fullscreenRoot={theater.hostRef.current}
          />
        </div>
        <ItemViewerConversation
          detail={detail}
          selectedPreview={selectedPreview}
          isPlaceholder={isPlaceholder}
          viewer={viewer}
          timezone={timezone}
          transport={transport}
          onDeleted={wayBack.leave}
          fieldRef={fieldRef}
          theater={theater}
          dockController={dockController}
        />
      </ViewerReadinessContext>
    </PhotoReadinessContext>
  );
}
