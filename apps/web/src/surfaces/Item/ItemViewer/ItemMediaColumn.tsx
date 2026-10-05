import type { ReactNode } from "react";
import type { ItemDetail, MemberRef } from "@memory-shoebox/shared";
import { VideoFrame } from "@/system/VideoFrame/VideoFrame";
import classes from "@/system/system.module.css";
import { ItemMeta } from "@/surfaces/Item/ItemViewer/ItemMeta";
import { ItemReactions } from "@/surfaces/Item/ItemViewer/ItemReactions/ItemReactions";
import type { VideoTransport } from "@/surfaces/Item/ItemViewer/useVideoTransport";
import { makeMarksFromComments } from "@/surfaces/Item/ItemViewer/makeMarksFromComments";
import { PhotoFrame } from "@/surfaces/Item/ItemViewer/PhotoFrame";
import { PinningSheet } from "@/surfaces/Item/ItemViewer/PinningSheet/PinningSheet";
import { SiblingStrip } from "@/surfaces/Item/SiblingStrip/SiblingStrip";

type Props = {
  detail: ItemDetail;
  /** The item being left: its reaction is inert, and its strip is not. */
  isPlaceholder: boolean;
  viewer: MemberRef;
  timezone: string;
  transport: VideoTransport;
};

/**
 * The left column: the frame (a still, or a video on its transport), the line
 * under it, the reaction, and then the run it came from or the pinning sheet.
 *
 * While a pin is set, a press on the bar or an arrow key moves it: that is
 * the whole of the pinning interaction.
 */
export function ItemMediaColumn({
  detail,
  isPlaceholder,
  viewer,
  timezone,
  transport,
}: Readonly<Props>): ReactNode {
  const isVideo = detail.kind === "video";
  return (
    <div>
      {isVideo ? (
        <VideoFrame
          // Keyed by item: swapping a loaded video's <source> children does
          // not make it load the new clip, and its duration and playing
          // state belong to one item.
          key={detail.itemId}
          media={detail.media}
          marks={makeMarksFromComments(detail.comments)}
          pendingAt={transport.pendingAt}
          videoRef={transport.videoRef}
          position={transport.position}
          onPositionChange={transport.setPosition}
          onScrub={
            transport.pendingAt === undefined
              ? undefined
              : transport.setPendingAt
          }
        />
      ) : (
        <PhotoFrame media={detail.media} />
      )}
      <ItemMeta detail={detail} timezone={timezone} />
      <div className={classes.frameReactions} inert={isPlaceholder}>
        {/* Keyed by item: this column is not remounted on a sibling move,
            and a reaction belongs to one item. */}
        <ItemReactions key={detail.itemId} detail={detail} viewer={viewer} />
      </div>
      {isVideo ? (
        <PinningSheet transport={transport} />
      ) : (
        <SiblingStrip detail={detail} />
      )}
    </div>
  );
}
