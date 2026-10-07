import type { ReactNode, RefObject } from "react";
import type { CommentDto, MemberRef } from "@memory-shoebox/shared";
import { CommentOwnActions } from "@/system/Talk/CommentRow/CommentOwnActions/CommentOwnActions";
import { Reactions } from "@/system/Reactions/Reactions";
import { useCommentReaction } from "@/surfaces/Item/itemWrites/useCommentReaction";
import { useDeleteComment } from "@/surfaces/Item/itemWrites/useDeleteComment";
import classes from "./VideoConversation.module.css";

type Props = {
  itemId: string;
  comment: CommentDto;
  viewer: MemberRef;
  onEdit: () => void;
  editButtonRef: RefObject<HTMLButtonElement | null>;
  onReply: () => void;
  onFocusLost: () => void;
};

/** Existing edit, removal and comment reactions retain their permissions. */
export function VideoCommentActions({
  itemId,
  comment,
  viewer,
  onEdit,
  editButtonRef,
  onReply,
  onFocusLost,
}: Readonly<Props>): ReactNode {
  const reaction = useCommentReaction({
    itemId,
    commentId: comment.commentId,
    viewer,
  });
  const removal = useDeleteComment({ itemId, commentId: comment.commentId });
  return (
    <>
      <div className={classes.threadActions}>
        {comment.parentCommentId === null ? (
          <button
            type="button"
            aria-label={`Reply to ${comment.author.displayName}`}
            onClick={onReply}
          >
            Reply
          </button>
        ) : null}
        <Reactions
          reactions={comment.reactions}
          viewer={viewer}
          onReact={reaction.react}
        />
        <CommentOwnActions
          comment={comment}
          editButtonRef={editButtonRef}
          onEdit={onEdit}
          onDelete={() => {
            removal.remove(onFocusLost);
          }}
        />
      </div>
      {reaction.error === undefined && removal.error === undefined ? null : (
        <p className={classes.error} role="alert">
          {reaction.error ?? removal.error}
        </p>
      )}
    </>
  );
}
