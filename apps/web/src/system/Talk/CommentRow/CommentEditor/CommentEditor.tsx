import type { CommentTagFailure } from "@/api/comments/comments";
import { CommentTagInputField } from "@/system/CommentTagInputField/CommentTagInputField";
import type { CommentDraft } from "@/system/commentDraftHelpers/commentDraftHelpers";
import { agoLabel } from "@/system/labelHelpers/labelHelpers";
import classes from "@/system/system.module.css";
import type { CommentDto } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { useCommentEditorDraft } from "../useCommentEditing";
import editorClasses from "./CommentEditor.module.css";
import { CommentEditorActions } from "./CommentEditorActions/CommentEditorActions";
type Props = {
  comment: CommentDto;
  itemId: string;
  tagFailure?: CommentTagFailure[];
  isSaving: boolean;
  onSave: (draft: CommentDraft, onSaved: (comment: CommentDto) => void) => void;
  onCancel: () => void;
};
/**
 * Edits the author's words and references, keeping newer edits after a save.
 */
export function CommentEditor(props: Readonly<Props>): ReactNode {
  const { comment, itemId, tagFailure, isSaving, onCancel } = props;
  const { draft, setDraft, fieldRef, save, canSave } =
    useCommentEditorDraft(props);
  return (
    <div className={classes.comment}>
      <span className={classes.commentWho}>{comment.author.displayName}</span>
      <span className={classes.commentWhen}>
        {agoLabel({ timestamp: comment.createdAt })}
      </span>
      <div className={editorClasses.commentEditorField}>
        <CommentTagInputField
          itemId={itemId}
          value={draft}
          onChange={setDraft}
          onSubmit={save}
          fieldRef={fieldRef}
          isSending={isSaving}
          tagFailure={tagFailure}
          label="What you wrote"
          autoFocus
        />
      </div>
      <CommentEditorActions
        canSave={canSave}
        isSaving={isSaving}
        onSave={save}
        onCancel={onCancel}
      />
    </div>
  );
}
