import type { ReactNode, RefObject } from "react";
import type { ItemDetail, MemberRef } from "@memory-shoebox/shared";
import type { VideoTransport } from "@/surfaces/Item/ItemViewer/useVideoTransport";
import { ItemComposer } from "./ItemComposer";
import { ItemComment } from "./ItemComment";
import classes from "./ItemConversation.module.css";

type Props = {
  detail: ItemDetail;
  viewer: MemberRef;
  transport?: VideoTransport;
  fieldRef: RefObject<HTMLTextAreaElement | null>;
  onSeek?: (seconds: number) => void;
};

/** Comments beside playback on desktop, with one level of inherited replies. */
export function ItemComments({
  detail,
  viewer,
  transport,
  fieldRef,
  onSeek,
}: Readonly<Props>): ReactNode {
  const parents = detail.comments
    .filter((comment) => {
      return comment.parentCommentId === null;
    })
    .sort((left, right) => {
      return detail.kind === "video"
        ? (left.atSeconds ?? Infinity) - (right.atSeconds ?? Infinity)
        : 0;
    });
  const onFocusLost = () => {
    fieldRef.current?.focus();
  };
  return (
    <section className={classes.conversation} aria-label="Comments">
      <h2 className={classes.panelHeading}>
        Comments <span>{detail.comments.length}</span>
      </h2>
      <ItemComposer
        itemId={detail.itemId}
        viewer={viewer}
        transport={transport}
        fieldRef={fieldRef}
      />
      <div className={classes.threads}>
        {parents.length === 0 || detail.kind !== "video" ? null : (
          <p className={classes.threadHeading}>In video order</p>
        )}
        {parents.map((comment) => {
          const replies = detail.comments.filter((candidate) => {
            return candidate.parentCommentId === comment.commentId;
          });
          return (
            <div className={classes.threadGroup} key={comment.commentId}>
              <ItemComment
                itemId={detail.itemId}
                comment={comment}
                viewer={viewer}
                canReply={detail.kind === "video"}
                onSeek={onSeek}
                onFocusLost={onFocusLost}
              />
              {replies.length === 0 ? null : (
                <div className={classes.replies}>
                  {replies.map((reply) => {
                    return (
                      <ItemComment
                        key={reply.commentId}
                        itemId={detail.itemId}
                        comment={reply}
                        viewer={viewer}
                        canReply={false}
                        onSeek={onSeek}
                        onFocusLost={onFocusLost}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
