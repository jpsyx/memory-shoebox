import { useMediaIntent } from "@/media/useMediaIntent";
import { useMediaLink } from "@/media/useMediaLink";
import { useVisibleThumbnail } from "@/media/useVisibleThumbnail/useVisibleThumbnail";
import { useReSigning } from "@/surfaces/Timeline/useReSigning/useReSigning";
import { MediaPlaceholder } from "@/system/MediaPlaceholder/MediaPlaceholder";
import { framePositionLabel } from "@/system/labelHelpers/labelHelpers";
import classes from "./SiblingLink.module.css";
import type { BurstFrameRef } from "@memory-shoebox/shared";
import { Link } from "@tanstack/react-router";
import { useRef, type ReactNode } from "react";

type Props = {
  frame: BurstFrameRef;
  tabStopId: string | undefined;
  frameCount: number;
  direction: "previous" | "next";
};
/**
 * A focusable burst frame warms safe metadata and transfers exact ownership.
 */
export function SiblingLink({
  frame,
  tabStopId,
  frameCount,
  direction,
}: Readonly<Props>): ReactNode {
  const intent = useMediaIntent(frame.itemId);
  const onClick = useMediaLink({ itemId: frame.itemId, direction });
  const element = useRef<HTMLAnchorElement>(null);
  const media = useReSigning({ itemId: frame.itemId, media: frame, element });
  const thumb = media?.thumb;
  const thumbnail = useVisibleThumbnail({
    itemId: frame.itemId,
    source: thumb ?? undefined,
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
      className={classes.siblingLink}
      tabIndex={frame.itemId === tabStopId ? 0 : -1}
      aria-label={framePositionLabel({ position: frame.position, frameCount })}
    >
      {thumb == null ? (
        <MediaPlaceholder
          className={classes.siblingLinkPlaceholder}
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
