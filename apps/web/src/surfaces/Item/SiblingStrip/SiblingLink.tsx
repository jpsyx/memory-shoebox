import { useVisibleThumbnail } from "@/media/useVisibleThumbnail";
import { useRef, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { BurstFrameRef } from "@memory-shoebox/shared";
import { useMediaIntent } from "@/media/useMediaIntent";
import { useMediaLink } from "@/media/useMediaLink";
import { useReSigning } from "@/surfaces/Timeline/useReSigning/useReSigning";
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
  const element = useRef<HTMLAnchorElement>(null);
  const media = useReSigning({ itemId: frame.itemId, media: frame, element });
  const thumb = media?.thumb;
  const thumbnail = useVisibleThumbnail({
    itemId: frame.itemId,
    source: thumb ?? null,
  });
  return (
    <Link
      ref={(node) => {
        element.current = node;
        return thumbnail.ref(node);
      }}
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
      {thumb == null ? (
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
          src={thumbnail.source?.url}
          alt=""
          width={thumb.width}
          height={thumb.height}
          loading={thumbnail.loading}
        />
      )}
    </Link>
  );
}
