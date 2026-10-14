import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { BurstFrameRef } from "@memory-shoebox/shared";
import { useMediaIntent } from "@/media/useMediaIntent";
import { useMediaLink } from "@/media/useMediaLink";
import { useSeedMediaPreview } from "@/media/useSeedMediaPreview";
import { MediaPlaceholder } from "@/system/MediaPlaceholder/MediaPlaceholder";
import { framePositionLabel } from "@/system/labelHelpers/labelHelpers";
import classes from "@/system/system.module.css";

type Props = {
  frame: BurstFrameRef;
  tabStopId: string | undefined;
  frameCount: number;
  direction: "previous" | "next";
};
/** A focusable burst frame warms safe metadata and transfers exact ownership. */
export function SiblingLink({
  frame,
  tabStopId,
  frameCount,
  direction,
}: Readonly<Props>): ReactNode {
  const intent = useMediaIntent({ itemId: frame.itemId });
  const onClick = useMediaLink(frame.itemId, direction);
  useSeedMediaPreview({ itemId: frame.itemId, media: frame });
  return (
    <Link
      {...intent}
      onClick={onClick}
      to="/items/$itemId"
      params={{ itemId: frame.itemId }}
      state={(state) => {
        return state;
      }}
      replace
      resetScroll={false}
      className={classes.sibling}
      tabIndex={frame.itemId === tabStopId ? 0 : -1}
      aria-label={framePositionLabel({ position: frame.position, frameCount })}
    >
      {frame.thumb === null ? (
        <MediaPlaceholder
          className={classes.siblingPlaceholder}
          isCompact
          altText={frame.altText}
          width={frame.width}
          height={frame.height}
          state={frame.previewState}
        />
      ) : (
        <img
          src={frame.thumb.url}
          alt=""
          width={frame.thumb.width}
          height={frame.thumb.height}
          loading="lazy"
        />
      )}
    </Link>
  );
}
