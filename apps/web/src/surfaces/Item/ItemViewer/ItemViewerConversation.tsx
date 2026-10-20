import { useMemo, type ReactNode, type RefObject } from "react";
import { MantineThemeProvider, Portal } from "@mantine/core";
import { VideoConversation } from "../VideoConversation/VideoConversation";
import { ItemConversation } from "../ItemConversation/ItemConversation";
import { ItemComments } from "../ItemConversation/ItemComments/ItemComments";
import { ItemMediaColumn } from "./ItemMediaColumn/ItemMediaColumn";
import type { Props as ViewerProps } from "./ItemViewer.types";
import type { TheaterCommentDockController } from "../ItemTheater/useTheaterCommentDock";
import type { VideoTransport } from "./useVideoTransport";

type Props = ViewerProps & {
  transport: VideoTransport;
  onDeleted: () => void;
  fieldRef: RefObject<HTMLTextAreaElement | null>;
  dockController: TheaterCommentDockController;
};

/**
 * Selects the authorized conversation while retaining each video's item key.
 */
export function ItemViewerConversation({
  detail,
  selectedPreview,
  isPlaceholder,
  viewer,
  timezone,
  transport,
  onDeleted,
  fieldRef,
  theater,
  dockController,
}: Readonly<Props>): ReactNode {
  const portalTheme = useMemo(() => {
    return {
      components: {
        Portal: Portal.extend({
          defaultProps: { target: "[data-item-theater-host]" },
        }),
      },
    };
  }, []);
  const props = { detail, selectedPreview, isPlaceholder, viewer, timezone };
  const presentation = theater.presentation;
  const onComment = () => {
    if (presentation === "theater") {
      dockController.open();
    } else {
      fieldRef.current?.focus();
    }
  };
  return (
    <MantineThemeProvider theme={portalTheme}>
      {detail.kind === "video" && !isPlaceholder ? (
        <VideoConversation
          key={detail.itemId}
          {...props}
          transport={transport}
          onDeleted={onDeleted}
          fieldRef={fieldRef}
          presentation={presentation}
          dockController={dockController}
          onComment={onComment}
          onEnterTheater={theater.enter}
          playbackPreferences={theater.playbackPreferences}
        />
      ) : (
        <ItemConversation
          {...props}
          onDeleted={onDeleted}
          presentation={presentation}
          dockController={dockController}
          media={
            <ItemMediaColumn
              {...props}
              onComment={onComment}
              presentation={presentation}
            />
          }
          conversation={
            <ItemComments
              detail={detail}
              viewer={viewer}
              fieldRef={fieldRef}
              presentation={presentation}
            />
          }
        />
      )}
    </MantineThemeProvider>
  );
}
