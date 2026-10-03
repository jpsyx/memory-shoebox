import type { ReactNode } from "react";
import type {
  CommentDto,
  MemberRef,
  ReactionKind,
} from "@memory-shoebox/shared";
import { CommentEditor } from "@/system/Talk/CommentRow/CommentEditor/CommentEditor";
import { CommentView } from "@/system/Talk/CommentRow/CommentView";
import { useCommentEditing } from "@/system/Talk/CommentRow/useCommentEditing";
import { Prose } from "@/system/typography/Prose";

type Props = {
  /** Who is looking, so a reaction answers before the server hears about it. */
  viewer: MemberRef;
  comment: CommentDto;
  onSeek?: (seconds: number) => void;
  /** Saves an edit. Call `onSaved` once the server has the new words. */
  onSaveEdit?: (
    options: Readonly<{ body: string; onSaved: () => void }>,
  ) => void;
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
  const editing = useCommentEditing(comment.canEdit);
  return editing.isEditorShown ? (
    <>
      <CommentEditor
        comment={comment}
        isSaving={isSaving}
        onCancel={editing.closeEditor}
        onSave={(body) => {
          onSaveEdit?.({ body, onSaved: editing.closeEditor });
        }}
      />
      {error === undefined ? null : <Prose role="alert">{error}</Prose>}
    </>
  ) : (
    <CommentView
      comment={comment}
      viewer={viewer}
      onSeek={onSeek}
      onReact={onReact}
      onDelete={onDelete}
      editButtonRef={editing.editButtonRef}
      onEdit={editing.openEditor}
      error={error}
    />
  );
}
