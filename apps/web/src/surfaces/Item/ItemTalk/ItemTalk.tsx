import { useRef, type ReactNode } from "react";
import type { ItemDetail, MemberRef } from "@memory-shoebox/shared";
import { Talk } from "@/system/Talk/Talk";
import { Prose } from "@/system/typography/Prose";
import {
  commentsHeading,
  quietThreadProse,
} from "@/surfaces/Item/itemCopyHelpers/itemCopyHelpers";
import { ItemComment } from "@/surfaces/Item/ItemTalk/ItemComment";
import { ItemComposer } from "@/surfaces/Item/ItemTalk/ItemComposer";
import type { VideoTransport } from "@/surfaces/Item/ItemViewer/useVideoTransport";

type Props = {
  detail: ItemDetail;
  viewer: MemberRef;
  /** On a video, where a stamp seeks to and where a new comment is pinned. */
  transport: VideoTransport;
};

/**
 * The thread and its composer.
 *
 * With nothing said, the composer is the surface rather than an afterthought
 * under an empty list: the panel says plainly that anybody who can see it can
 * be the first, and the field is right there.
 *
 * On a video, a stamp seeks the transport and plays from it. A comment whose
 * own delete takes focus away with its row hands it to the composer's field,
 * where the thread goes on.
 */
export function ItemTalk({
  detail,
  viewer,
  transport,
}: Readonly<Props>): ReactNode {
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const isVideo = detail.kind === "video";
  return (
    <Talk heading={commentsHeading(detail)}>
      {detail.comments.length === 0 ? (
        <Prose>{quietThreadProse(detail.kind)}</Prose>
      ) : (
        detail.comments.map((comment) => {
          return (
            <ItemComment
              key={comment.commentId}
              itemId={detail.itemId}
              comment={comment}
              viewer={viewer}
              onSeek={isVideo ? transport.seekAndPlay : undefined}
              onFocusLost={() => {
                fieldRef.current?.focus();
              }}
            />
          );
        })
      )}
      <ItemComposer detail={detail} transport={transport} fieldRef={fieldRef} />
    </Talk>
  );
}
