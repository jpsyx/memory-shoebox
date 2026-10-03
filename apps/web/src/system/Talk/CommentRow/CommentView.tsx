import type { ReactNode, RefObject } from "react";
import type {
  CommentDto,
  MemberRef,
  ReactionKind,
} from "@memory-shoebox/shared";
import { agoLabel } from "@/system/labelHelpers/labelHelpers";
import { Reactions } from "@/system/Reactions/Reactions";
import { CommentOwnActions } from "@/system/Talk/CommentRow/CommentOwnActions/CommentOwnActions";
import { CommentWhen } from "@/system/Talk/CommentRow/CommentWhen";
import { Prose } from "@/system/typography/Prose";
import classes from "@/system/system.module.css";

type Props = {
  comment: CommentDto;
  viewer: MemberRef;
  onSeek?: (seconds: number) => void;
  onReact?: (kind: ReactionKind | null) => void;
  onDelete?: () => void;
  /** On the Edit button, so the row can give it focus back. */
  editButtonRef: RefObject<HTMLButtonElement | null>;
  onEdit: () => void;
  /** Whatever went wrong with this comment, already in words. */
  error?: string;
};

/**
 * One comment as it is read: who said it and when, the server's words, its
 * reactions, and Edit and Delete when the server says this viewer may.
 */
export function CommentView({
  comment,
  viewer,
  onSeek,
  onReact,
  onDelete,
  editButtonRef,
  onEdit,
  error,
}: Readonly<Props>): ReactNode {
  return (
    <div className={classes.comment}>
      <span className={classes.commentWho}>{comment.author.displayName}</span>
      <CommentWhen comment={comment} onSeek={onSeek} />
      <p className={classes.commentBody}>
        {comment.body}
        {comment.editedAt === null ? null : (
          <>
            {" "}
            <span className={classes.commentEdited}>
              {`edited ${agoLabel({ timestamp: comment.editedAt })}`}
            </span>
          </>
        )}
      </p>
      <div className={classes.commentReactions}>
        <Reactions
          reactions={comment.reactions}
          viewer={viewer}
          onReact={onReact}
        />
      </div>
      <CommentOwnActions
        comment={comment}
        editButtonRef={editButtonRef}
        onEdit={onEdit}
        onDelete={onDelete}
      />
      {error === undefined ? null : <Prose role="alert">{error}</Prose>}
    </div>
  );
}
