import { useState, type ReactNode } from "react";
import type { CommentDto, MemberRef } from "@memory-shoebox/shared";
import { agoLabel, clockLabel } from "@/system/labelHelpers/labelHelpers";
import { useCommentEditing } from "@/system/Talk/CommentRow/useCommentEditing";
import { CommentEditor } from "@/system/Talk/CommentRow/CommentEditor/CommentEditor";
import { useEditComment } from "@/surfaces/Item/itemWrites/useEditComment";
import { VideoCommentActions } from "./VideoCommentActions";
import { VideoReply } from "./VideoReply";
import { getInitialsFromDisplayName } from "./videoMomentHelpers/videoMomentHelpers";
import classes from "./VideoConversation.module.css";

type Props = {
  itemId: string;
  comment: CommentDto;
  viewer: MemberRef;
  onSeek: (seconds: number) => void;
  onFocusLost: () => void;
};

/** Real member words, timestamp links and permission-aware conversation actions. */
export function VideoComment({
  itemId,
  comment,
  viewer,
  onSeek,
  onFocusLost,
}: Readonly<Props>): ReactNode {
  const editing = useCommentEditing(comment.canEdit);
  const write = useEditComment({ itemId, commentId: comment.commentId });
  const [isReplying, setIsReplying] = useState(false);
  return (
    <article className={classes.thread}>
      <span className={classes.avatar} aria-hidden="true">
        {getInitialsFromDisplayName(comment.author.displayName)}
      </span>
      <div className={classes.threadBody}>
        {editing.isEditorShown ? (
          <CommentEditor
            comment={comment}
            isSaving={write.isSaving}
            onCancel={editing.closeEditor}
            onSave={(body) => {
              write.save({ body, onSaved: editing.closeEditor });
            }}
          />
        ) : (
          <>
            <div className={classes.byline}>
              <strong>{comment.author.displayName}</strong>
              {comment.atSeconds === null ? null : (
                <button
                  type="button"
                  className={classes.timestamp}
                  aria-label={`${clockLabel(comment.atSeconds)} Play the video from here`}
                  onClick={() => {
                    if (comment.atSeconds !== null) {
                      onSeek(comment.atSeconds);
                    }
                  }}
                >
                  {clockLabel(comment.atSeconds)}
                </button>
              )}
              <span>{agoLabel({ timestamp: comment.createdAt })}</span>
            </div>
            <p className={classes.commentBody}>
              {comment.body}
              {comment.editedAt === null ? null : (
                <span className={classes.edited}> (edited)</span>
              )}
            </p>
            <VideoCommentActions
              itemId={itemId}
              comment={comment}
              viewer={viewer}
              onEdit={editing.openEditor}
              editButtonRef={editing.editButtonRef}
              onReply={() => {
                setIsReplying(true);
              }}
              onFocusLost={onFocusLost}
            />
          </>
        )}
        {write.error === undefined ? null : (
          <p className={classes.error} role="alert">
            {write.error}
          </p>
        )}
        {isReplying ? (
          <VideoReply
            itemId={itemId}
            parent={comment}
            onSent={() => {
              setIsReplying(false);
            }}
            onCancel={() => {
              setIsReplying(false);
            }}
          />
        ) : null}
      </div>
    </article>
  );
}
