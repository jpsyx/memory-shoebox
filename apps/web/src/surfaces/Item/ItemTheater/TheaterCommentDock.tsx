import { MantineThemeProvider, Portal } from "@mantine/core";
import { IconMessageCircle, IconX } from "@tabler/icons-react";
import { useId, useMemo, type ReactNode } from "react";
import { clsx } from "clsx";
import type { ItemPresentation } from "../ItemViewer/ItemViewer.types";
import type { TheaterCommentDockController } from "./useTheaterCommentDock";
import classes from "./TheaterCommentDock.module.css";

type Props = {
  presentation: ItemPresentation;
  controller: TheaterCommentDockController;
  commentCount: number;
  isUnavailable: boolean;
  children: ReactNode;
};

/** Keeps the shared conversation and its scoped portals mounted in both views. */
export function TheaterCommentDock({
  presentation,
  controller,
  commentCount,
  isUnavailable,
  children,
}: Readonly<Props>): ReactNode {
  const panelId = useId();
  const portalId = `${panelId.replaceAll(":", "")}-comment-portals`;
  const portalTheme = useMemo(() => {
    return {
      components: {
        Portal: Portal.extend({ defaultProps: { target: `#${portalId}` } }),
      },
    };
  }, [portalId]);
  const isTheater = presentation === "theater";
  const isCollapsed = isTheater && !controller.isOpen;
  return (
    <MantineThemeProvider theme={portalTheme}>
      <div
        data-theater-comment-dock
        className={clsx(classes.dock, isTheater && classes.theater)}
        data-open={controller.isOpen || undefined}
        inert={isUnavailable || undefined}
        aria-hidden={isUnavailable || undefined}
        onPointerEnter={controller.onPointerEnter}
        onPointerLeave={controller.onPointerLeave}
        onFocusCapture={controller.onFocusCapture}
        onBlurCapture={controller.onBlurCapture}
        onKeyDown={controller.onKeyDown}
      >
        <div
          id={portalId}
          data-theater-comment-portals
          className={classes.portals}
        />
        <div
          id={panelId}
          data-theater-comment-panel
          className={classes.panel}
          inert={isCollapsed || isUnavailable || undefined}
          aria-hidden={isCollapsed || isUnavailable || undefined}
        >
          {isTheater ? (
            <button
              className={classes.close}
              type="button"
              aria-label="Close comments"
              onClick={controller.close}
            >
              <IconX size={18} />
            </button>
          ) : null}
          {children}
        </div>
        {isTheater ? (
          <button
            data-theater-comment-trigger
            className={classes.bubble}
            type="button"
            aria-label={`Open comments, ${commentCount} ${commentCount === 1 ? "comment" : "comments"}`}
            aria-controls={panelId}
            aria-expanded={controller.isOpen}
            aria-hidden={controller.isOpen || undefined}
            tabIndex={controller.isOpen ? -1 : 0}
            disabled={isUnavailable}
            onClick={controller.open}
          >
            <IconMessageCircle size={22} />
            <span>{commentCount}</span>
          </button>
        ) : null}
      </div>
    </MantineThemeProvider>
  );
}
