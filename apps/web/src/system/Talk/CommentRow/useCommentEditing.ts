import { useEffect, useRef, useState, type RefObject } from "react";

/** Whether a comment's editor is open, and how focus gets back to Edit. */
export type CommentEditing = {
  isEditorShown: boolean;
  /** On the Edit button, which takes focus back as the editor closes. */
  editButtonRef: RefObject<HTMLButtonElement | null>;
  openEditor: () => void;
  closeEditor: () => void;
};

/**
 * A comment's editor, open only while the server still lets the viewer edit,
 * and handing focus back to Edit once it closes.
 *
 * @param canEdit The server's `canEdit` for the comment, as it stands now.
 */
export function useCommentEditing(canEdit: boolean): CommentEditing {
  const [isEditing, setIsEditing] = useState(false);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const wasEditorShown = useRef(false);

  // `canEdit` is re-read rather than trusted from the moment Edit was
  // pressed: a refetch can take the right away underneath somebody who is
  // mid-sentence, and leaving the form up would offer a save the server is
  // going to refuse.
  const isEditorShown = isEditing && canEdit;

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

  return {
    isEditorShown,
    editButtonRef,
    openEditor: () => {
      setIsEditing(true);
    },
    closeEditor: () => {
      setIsEditing(false);
    },
  };
}
