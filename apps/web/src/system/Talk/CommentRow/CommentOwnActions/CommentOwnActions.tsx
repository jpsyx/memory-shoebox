import { clsx } from "clsx";
import { useState, type ReactNode, type RefObject } from "react";
import type { CommentDto } from "@memory-shoebox/shared";
import { CommentDeleteDialog } from "@/system/Talk/CommentRow/CommentOwnActions/CommentDeleteDialog";
import classes from "@/system/system.module.css";
import ownActionsClasses from "@/system/Talk/CommentRow/CommentOwnActions/CommentOwnActions.module.css";

type Props = {
  comment: CommentDto;
  /** On the Edit button, so the row can give it focus back. */
  editButtonRef: RefObject<HTMLButtonElement | null>;
  onEdit: () => void;
  onDelete?: () => void;
};

/**
 * Edit and Delete under a comment, when the server says this viewer may.
 *
 * Editing is the author's alone. Deleting is the author's or an admin's, and
 * the dialog says which, because "Delete what you wrote?" is a false sentence
 * to an admin taking down somebody else's words.
 */
export function CommentOwnActions({
  comment,
  editButtonRef,
  onEdit,
  onDelete,
}: Readonly<Props>): ReactNode {
  const [isDeleting, setIsDeleting] = useState(false);
  if (!comment.canEdit && !comment.canDelete) {
    return null;
  }
  return (
    <div
      className={clsx(
        classes.commentOwnActions,
        ownActionsClasses.commentOwnActionsRow,
      )}
    >
      {comment.canEdit ? (
        <button
          ref={editButtonRef}
          type="button"
          className={classes.commentOwnAction}
          onClick={onEdit}
        >
          Edit
        </button>
      ) : null}
      {comment.canDelete ? (
        <button
          type="button"
          className={classes.commentOwnAction}
          onClick={() => {
            return setIsDeleting(true);
          }}
        >
          Delete
        </button>
      ) : null}
      <CommentDeleteDialog
        opened={isDeleting}
        isOwn={comment.canEdit}
        onDelete={onDelete}
        onClose={() => {
          return setIsDeleting(false);
        }}
      />
    </div>
  );
}
