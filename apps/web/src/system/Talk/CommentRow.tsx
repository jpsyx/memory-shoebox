import { useEffect, useRef, useState, type ReactNode } from "react";
import type {
  CommentDto,
  MemberRef,
  ReactionKind,
} from "@memory-shoebox/shared";
import { agoLabel } from "@/system/labelHelpers/labelHelpers";
import { Reactions } from "@/system/Reactions/Reactions";
import { CommentEditor } from "@/system/Talk/CommentEditor";
import { CommentOwnActions } from "@/system/Talk/CommentOwnActions";
import { CommentWhen } from "@/system/Talk/CommentWhen";
import { Prose } from "@/system/typography/Prose";
import classes from "@/system/system.module.css";

type Props = {
  /** Who is looking, so a reaction answers before the server hears about it. */
  viewer: MemberRef;
  comment: CommentDto;
  onSeek?: (seconds: number) => void;
  /** Saves an edit. Call `onSaved` once the server has the new words. */
  onSaveEdit?: (body: string, onSaved: () => void) => void;
  isSaving?: boolean;
  onDelete?: () => void;
  onReact?: (kind: ReactionKind | null) => void;
  /** Whatever went wrong with this comment, already in words. */
  error?: string;
};

/**
 * One comment. A pinned one carries a stamp instead of a plain clock time.
 *
 * The body drawn is always the server's (`comment.body`), never a local copy:
 * an edit lands in the item's cache and arrives here as a prop, and so does
 * an edit made in another tab. Editing and deleting are offered exactly when
 * the server's `canEdit` and `canDelete` say so.
 */
export function CommentRow({
  comment,
  viewer,
  onSeek,
  onSaveEdit,
  isSaving = false,
  onDelete,
  onReact,
  error,
}: Readonly<Props>): ReactNode {
  const [isEditing, setIsEditing] = useState(false);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const wasEditorShown = useRef(false);
  const failure =
    error === undefined ? null : <Prose role="alert">{error}</Prose>;

  // `canEdit` is re-read rather than trusted from the moment Edit was
  // pressed: a refetch can take the right away underneath somebody who is
  // mid-sentence, and leaving the form up would offer a save the server is
  // going to refuse.
  const isEditorShown = isEditing && comment.canEdit;

  useEffect(
    function returnFocusToEdit() {
      // The editor unmounting takes focus with it, so it goes back to the
      // button that opened the editor.
      if (wasEditorShown.current && !isEditorShown) {
        editButtonRef.current?.focus();
      }
      wasEditorShown.current = isEditorShown;
    },
    [isEditorShown],
  );

  if (isEditorShown) {
    return (
      <>
        <CommentEditor
          comment={comment}
          isSaving={isSaving}
          onCancel={() => {
            return setIsEditing(false);
          }}
          onSave={(body) => {
            onSaveEdit?.(body, () => {
              setIsEditing(false);
            });
          }}
        />
        {failure}
      </>
    );
  }

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
        onEdit={() => {
          return setIsEditing(true);
        }}
        onDelete={onDelete}
      />
      {failure}
    </div>
  );
}
