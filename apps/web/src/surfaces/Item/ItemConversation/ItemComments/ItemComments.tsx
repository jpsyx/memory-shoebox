import type { ReactNode, RefObject } from "react";
import type { ItemDetail, MemberRef } from "@memory-shoebox/shared";
import type { VideoTransport } from "@/surfaces/Item/ItemViewer/useVideoTransport";
import { ItemComposer } from "../ItemComposer/ItemComposer";
import { ItemComment } from "../ItemComment/ItemComment";
import classes from "./ItemComments.module.css";

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
    <section className={classes.itemComments} aria-label="Comments">
      <h2 className={classes.itemCommentsHeading}>
        Comments <span>{detail.comments.length}</span>
      </h2>
      <ItemComposer
        itemId={detail.itemId}
        viewer={viewer}
        transport={transport}
        fieldRef={fieldRef}
      />
      <div className={classes.itemCommentsThreads}>
        {parents.length === 0 || detail.kind !== "video" ? null : (
          <p className={classes.itemCommentsThreadHeading}>In video order</p>
        )}
        {parents.map((comment) => {
          const replies = detail.comments.filter((candidate) => {
            return candidate.parentCommentId === comment.commentId;
          });
          return (
            <div
              className={classes.itemCommentsThreadGroup}
              key={comment.commentId}
            >
              <ItemComment
                itemId={detail.itemId}
                comment={comment}
                viewer={viewer}
                canReply={detail.kind === "video"}
                onSeek={onSeek}
                onFocusLost={onFocusLost}
              />
              {replies.length === 0 ? null : (
                <div className={classes.itemCommentsReplies}>
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
