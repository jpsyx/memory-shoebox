import { useEffect, useRef, useState, type RefObject } from "react";

/** An editor drawn in place of the button that opens it. */
export type EditorToggle = {
  isEditing: boolean;
  open: () => void;
  close: () => void;
  /** For that button, which focus goes back to as the editor closes. */
  openerRef: RefObject<HTMLButtonElement | null>;
};

/**
 * Whether an editor is open in place of the button that opened it, and focus
 * given back to that button as the editor closes, by Done, Cancel or a save.
 *
 * The editor unmounting takes focus with it, and focus dropped on the page
 * behind loses a keyboard user's place. Taking focus as it opens is the
 * editor's own job, because only the editor knows which control comes first.
 */
export function useEditorToggle(): EditorToggle {
  const [isEditing, setIsEditing] = useState(false);
  const openerRef = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);

  useEffect(
    function returnFocusToOpener() {
      if (wasEditing.current && !isEditing) {
        openerRef.current?.focus();
      }
      wasEditing.current = isEditing;
    },
    [isEditing],
  );

  return {
    isEditing,
    open: () => {
      setIsEditing(true);
    },
    close: () => {
      setIsEditing(false);
    },
    openerRef,
  };
}
