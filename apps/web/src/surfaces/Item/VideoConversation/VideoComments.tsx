import type { ReactNode, RefObject } from "react";
import type { ItemDetail, MemberRef } from "@memory-shoebox/shared";
import type { VideoTransport } from "@/surfaces/Item/ItemViewer/useVideoTransport";
import { VideoComposer } from "./VideoComposer";
import { VideoComment } from "./VideoComment";
import classes from "./VideoConversation.module.css";

type Props = {
  detail: ItemDetail;
  viewer: MemberRef;
  transport: VideoTransport;
  fieldRef: RefObject<HTMLTextAreaElement | null>;
  onSeek: (seconds: number) => void;
};

/** Comments beside playback on desktop, with one level of inherited replies. */
export function VideoComments({
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
      return (left.atSeconds ?? Infinity) - (right.atSeconds ?? Infinity);
    });
  const onFocusLost = () => {
    fieldRef.current?.focus();
  };
  return (
    <section className={classes.conversation} aria-label="Comments">
      <h2 className={classes.panelHeading}>
        Comments <span>{detail.comments.length}</span>
      </h2>
      <VideoComposer
        itemId={detail.itemId}
        viewer={viewer}
        transport={transport}
        fieldRef={fieldRef}
      />
      <div className={classes.threads}>
        {parents.length === 0 ? null : (
          <p className={classes.threadHeading}>In video order</p>
        )}
        {parents.map((comment) => {
          const replies = detail.comments.filter((candidate) => {
            return candidate.parentCommentId === comment.commentId;
          });
          return (
            <div className={classes.threadGroup} key={comment.commentId}>
              <VideoComment
                itemId={detail.itemId}
                comment={comment}
                viewer={viewer}
                onSeek={onSeek}
                onFocusLost={onFocusLost}
              />
              {replies.length === 0 ? null : (
                <div className={classes.replies}>
                  {replies.map((reply) => {
                    return (
                      <VideoComment
                        key={reply.commentId}
                        itemId={detail.itemId}
                        comment={reply}
                        viewer={viewer}
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
