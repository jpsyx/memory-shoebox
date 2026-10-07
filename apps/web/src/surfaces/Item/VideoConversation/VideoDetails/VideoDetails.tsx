import { Drawer } from "@mantine/core";
import { IconDots } from "@tabler/icons-react";
import { useState, type ComponentProps, type ReactNode } from "react";
import { ItemSheets } from "@/surfaces/Item/ItemViewer/ItemSheets";
import classes from "./VideoDetails.module.css";

type Props = Omit<ComponentProps<typeof ItemSheets>, "includeTalk">;

/** Ancillary item actions stay accessible without competing with playback. */
export function VideoDetails({
  isPlaceholder,
  ...sheetProps
}: Readonly<Props>): ReactNode {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={classes.videoDetailsTrigger}
        aria-label="More video details"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        disabled={isPlaceholder}
        onClick={(event) => {
          event.currentTarget.focus();
          setIsOpen(true);
        }}
      >
        <IconDots size={20} aria-hidden="true" />
        <span>More</span>
      </button>
      <Drawer
        opened={isOpen && !isPlaceholder}
        onClose={() => {
          setIsOpen(false);
        }}
        title="Video details"
        closeOnEscape={false}
        onKeyDown={(event) => {
          // Nested portals own Escape, including a delete dialog while busy.
          if (
            event.key === "Escape" &&
            !event.nativeEvent.isComposing &&
            !event.defaultPrevented &&
            event.target instanceof HTMLElement &&
            event.currentTarget.contains(event.target) &&
            event.target.getAttribute("data-mantine-stop-propagation") !==
              "true"
          ) {
            setIsOpen(false);
          }
        }}
        position="right"
        size="min(34rem, 100vw)"
        closeButtonProps={{ "aria-label": "Close video details" }}
        overlayProps={{ backgroundOpacity: 0.3 }}
        transitionProps={{
          duration: 240,
          timingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
        }}
        classNames={{
          content: classes.videoDetailsContent,
          header: classes.videoDetailsHeader,
          title: classes.videoDetailsTitle,
          body: classes.videoDetailsBody,
          close: classes.videoDetailsClose,
        }}
      >
        <ItemSheets
          {...sheetProps}
          isPlaceholder={isPlaceholder}
          includeTalk={false}
        />
      </Drawer>
    </>
  );
}
