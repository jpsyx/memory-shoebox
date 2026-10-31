import {
  makeCommentDraftFromSavedTagIds,
  recordSavedCommentTagIdsInPlace,
} from "@/system/commentDraftHelpers/commentTagProvenance";
import type { CommentDto, CommentTagInput } from "@memory-shoebox/shared";
import {
  getFailedCommentTagsFromDraft,
  type CommentTagFailure,
} from "@/api/comments/comments";
import type { CommentDraft } from "@/system/commentDraftHelpers/commentDraftHelpers";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

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

type EditorOptions = {
  comment: CommentDto;
  isSaving: boolean;
  tagFailure?: CommentTagFailure[];
  onSave: (draft: CommentDraft, onSaved: (comment: CommentDto) => void) => void;
  onCancel: () => void;
};
type EditorDraft = {
  draft: CommentDraft;
  setDraft: (draft: CommentDraft) => void;
  fieldRef: RefObject<HTMLTextAreaElement | null>;
  save: () => void;
  canSave: boolean;
};
/** Keeps edit text and references local, closing only the submitted revision. */
export function useCommentEditorDraft(
  options: Readonly<EditorOptions>,
): EditorDraft {
  const { comment } = options;
  const local = useLocalCommentDraft(comment);
  const { draft, setDraft } = local;
  const owner = useRef(comment.commentId);
  owner.current = comment.commentId;
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const isMounted = useRef(false);
  useLayoutEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);
  const canSave = _canSaveCommentDraft(draft, options);
  const save = () => {
    if (options.isSaving || !canSave) {
      return;
    }
    const submitted = draft;
    options.onSave(draft, (saved) => {
      _acceptSavedComment(saved, {
        options,
        local,
        owner,
        isMounted,
        submitted,
      });
    });
  };
  return { draft, setDraft, fieldRef, save, canSave };
}

function _canSaveCommentDraft(
  draft: Readonly<CommentDraft>,
  options: Readonly<EditorOptions>,
): boolean {
  const { comment } = options;
  const isUnchanged =
    draft.body.trim() === comment.body.trim() &&
    JSON.stringify(draft.commentTags) === JSON.stringify(comment.commentTags);
  return (
    !isUnchanged &&
    draft.body.trim() !== "" &&
    draft.body.length <= 4000 &&
    getFailedCommentTagsFromDraft({ draft, failures: options.tagFailure ?? [] })
      .length === 0
  );
}

function useLocalCommentDraft(comment: Readonly<CommentDto>): Pick<
  EditorDraft,
  "draft" | "setDraft"
> & {
  currentDraft: RefObject<CommentDraft>;
  savedTagIds: RefObject<WeakMap<CommentTagInput, string>>;
} {
  const savedTagIds = useRef(new WeakMap<CommentTagInput, string>());
  const [draft, setDraftValue] = useState<CommentDraft>({
    body: comment.body,
    commentTags: comment.commentTags,
  });
  const currentDraft = useRef(draft);
  currentDraft.current = draft;
  const setDraft = (updatedDraft: CommentDraft) => {
    setDraftValue(
      makeCommentDraftFromSavedTagIds({
        draft: updatedDraft,
        tagIds: savedTagIds.current,
      }),
    );
  };
  return { draft, setDraft, currentDraft, savedTagIds };
}

type SavedEdit = {
  options: Readonly<EditorOptions>;
  local: ReturnType<typeof useLocalCommentDraft>;
  owner: RefObject<string>;
  isMounted: RefObject<boolean>;
  submitted: CommentDraft;
};
function _acceptSavedComment(
  saved: Readonly<CommentDto>,
  context: Readonly<SavedEdit>,
): void {
  const { options, local, owner, isMounted, submitted } = context;
  if (
    !isMounted.current ||
    saved.commentId !== owner.current ||
    saved.commentId !== options.comment.commentId
  ) {
    return;
  }
  recordSavedCommentTagIdsInPlace({
    submitted,
    savedTags: saved.commentTags,
    tagIds: local.savedTagIds.current,
  });
  if (local.currentDraft.current === submitted) {
    options.onCancel();
  } else {
    local.setDraft(local.currentDraft.current);
  }
}
