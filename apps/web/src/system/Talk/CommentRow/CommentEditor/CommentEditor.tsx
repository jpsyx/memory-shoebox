import { Textarea } from "@mantine/core";
import { useState, type ReactNode } from "react";
import type { CommentDto } from "@memory-shoebox/shared";
import { agoLabel } from "@/system/labelHelpers/labelHelpers";
import { CommentEditorActions } from "@/system/Talk/CommentRow/CommentEditor/CommentEditorActions/CommentEditorActions";
import classes from "@/system/system.module.css";
import editorClasses from "@/system/Talk/CommentRow/CommentEditor/CommentEditor.module.css";

type Props = {
  comment: CommentDto;
  isSaving: boolean;
  onSave: (body: string) => void;
  onCancel: () => void;
};

/**
 * Your own comment, open for editing.
 *
 * It says before saving that it will say it was edited, because a comment
 * that changes under a reader with no sign of it is worse than one that
 * could not change at all.
 */
export function CommentEditor({
  comment,
  isSaving,
  onSave,
  onCancel,
}: Readonly<Props>): ReactNode {
  const [draft, setDraft] = useState(comment.body);
  const isUnchanged = draft.trim() === comment.body.trim();

  return (
    <div className={classes.comment}>
      <span className={classes.commentWho}>{comment.author.displayName}</span>
      <span className={classes.commentWhen}>
        {agoLabel({ timestamp: comment.createdAt })}
      </span>
      <Textarea
        aria-label="What you wrote"
        // Pressing Edit unmounts the button that had focus, so the field it
        // opens takes focus instead of leaving it on the page behind.
        autoFocus
        value={draft}
        autosize
        minRows={2}
        onChange={(event) => {
          return setDraft(event.currentTarget.value);
        }}
        className={editorClasses.commentEditorField}
      />
      <CommentEditorActions
        canSave={draft.trim().length > 0 && !isUnchanged}
        isSaving={isSaving}
        onSave={() => {
          onSave(draft);
        }}
        onCancel={onCancel}
      />
    </div>
  );
}
