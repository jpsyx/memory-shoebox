import { Button, Modal, Stack } from "@mantine/core";
import { clsx } from "clsx";
import { useState, type ReactNode, type RefObject } from "react";
import type { CommentDto } from "@memory-shoebox/shared";
import { ChipRow } from "@/system/Chip/ChipRow";
import { Prose } from "@/system/typography/Prose";
import classes from "@/system/system.module.css";

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
    <div className={clsx(classes.commentOwnActions, classes.commentSpan)}>
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
      <Modal
        opened={isDeleting}
        onClose={() => {
          return setIsDeleting(false);
        }}
        title={
          comment.canEdit ? "Delete what you wrote?" : "Delete this comment?"
        }
      >
        <Stack gap="md">
          <Prose>
            It goes, and so does every reaction anybody left on it. What it was
            said about stays. Anybody who was emailed it still has that email,
            which is not something deleting can reach.
          </Prose>
          <ChipRow>
            <Button
              variant="danger"
              onClick={() => {
                setIsDeleting(false);
                onDelete?.();
              }}
            >
              Delete it
            </Button>
            <Button
              variant="default"
              onClick={() => {
                return setIsDeleting(false);
              }}
            >
              Keep it
            </Button>
          </ChipRow>
        </Stack>
      </Modal>
    </div>
  );
}
