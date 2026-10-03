import type { ReactNode } from "react";
import type { ItemDetail, MemberRef } from "@memory-shoebox/shared";
import { Composer } from "@/system/Talk/Composer";
import { Talk } from "@/system/Talk/Talk";
import { Prose } from "@/system/typography/Prose";
import {
  COMPOSER_HINT,
  commentsHeading,
  quietThreadProse,
} from "@/surfaces/Item/itemCopy/itemCopy";
import { ItemComment } from "@/surfaces/Item/ItemTalk/ItemComment";
import type { VideoTransport } from "@/surfaces/Item/ItemViewer/useVideoTransport";
import { useCreateComment } from "@/surfaces/Item/itemWrites/useConversation";

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
 * On a video, a stamp seeks the transport and plays from it, and a comment
 * sent while a pin is set stands at that moment. The pin comes off once the
 * comment has landed, never before, so a send that fails keeps it.
 */
export function ItemTalk({
  detail,
  viewer,
  transport,
}: Readonly<Props>): ReactNode {
  const { send, isSending, error } = useCreateComment(detail.itemId);
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
            />
          );
        })
      )}
      <Composer
        goesTo={COMPOSER_HINT}
        isSending={isSending}
        error={error}
        pinnedAt={isVideo ? transport.pendingAt : undefined}
        onClearPin={() => {
          transport.setPendingAt(undefined);
        }}
        onSend={(body, onSent) => {
          const atSeconds = isVideo ? (transport.pendingAt ?? null) : null;
          send({ body, atSeconds }, () => {
            onSent();
            transport.setPendingAt(undefined);
          });
        }}
      />
    </Talk>
  );
}
