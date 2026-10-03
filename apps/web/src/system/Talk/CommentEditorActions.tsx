import { Button } from "@mantine/core";
import { clsx } from "clsx";
import type { ReactNode } from "react";
import { FocusKeepingButton } from "@/system/FocusKeepingButton/FocusKeepingButton";
import classes from "@/system/system.module.css";

type Props = {
  /** There are words, and they are not the ones already there. */
  canSave: boolean;
  isSaving: boolean;
  onSave: () => void;
  onCancel: () => void;
};

/**
 * Under the comment editor's field: Save, a way to leave it as it was, and
 * the note that it will say it was edited. Save keeps focus while it saves,
 * so focus is still in the comment when the editor closes and hands it on.
 */
export function CommentEditorActions({
  canSave,
  isSaving,
  onSave,
  onCancel,
}: Readonly<Props>): ReactNode {
  return (
    <div
      className={clsx(
        classes.commentOwnActions,
        classes.commentSpan,
        classes.commentEditorActions,
      )}
    >
      <FocusKeepingButton
        size="sm"
        isUnavailable={!canSave || isSaving}
        onClick={onSave}
      >
        {isSaving ? "Saving" : "Save the change"}
      </FocusKeepingButton>
      <Button size="sm" variant="default" onClick={onCancel}>
        Leave it as it was
      </Button>
      <span className={classes.commentEdited}>It will say it was edited.</span>
    </div>
  );
}
