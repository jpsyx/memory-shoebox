import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
  type RefObject,
} from "react";
import type { AvatarDraft, AvatarSelection } from "./avatarEditorTypes";
import { getDimensionsFromAvatarUrl } from "./avatarCropHelpers/avatarCropHelpers";

/** Draft state and focused actions owned for one mounted editor. */
export type AvatarDraftState = {
  selection: AvatarSelection | undefined;
  setSelection: Dispatch<SetStateAction<AvatarSelection | undefined>>;
  draft: AvatarDraft | undefined;
  setDraft: Dispatch<SetStateAction<AvatarDraft | undefined>>;
  isOpen: boolean;
  setIsOpen: Dispatch<SetStateAction<boolean>>;
  isRemoving: boolean;
  setIsRemoving: Dispatch<SetStateAction<boolean>>;
  error: string | undefined;
  setError: Dispatch<SetStateAction<string | undefined>>;
  status: string | undefined;
  setStatus: Dispatch<SetStateAction<string | undefined>>;
  input: RefObject<HTMLInputElement | null>;
  opener: RefObject<HTMLButtonElement | null>;
  clear: () => void;
};

/** Owns the selected file, decoded preview, dialogs and independent errors. */
export function useAvatarDraft(): AvatarDraftState {
  const [selection, setSelection] = useState<AvatarSelection>();
  const [draft, setDraft] = useState<AvatarDraft>();
  const [isOpen, setIsOpen] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [error, setError] = useState<string>();
  const [status, setStatus] = useState<string>();
  const input = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  useDecodedAvatar({ selection, setDraft, setError });
  const clear = useCallback(() => {
    setSelection(undefined);
    setDraft(undefined);
    setIsOpen(false);
    setIsRemoving(false);
    setError(undefined);
  }, []);
  return {
    selection,
    setSelection,
    draft,
    setDraft,
    isOpen,
    setIsOpen,
    isRemoving,
    setIsRemoving,
    error,
    setError,
    status,
    setStatus,
    input,
    opener,
    clear,
  };
}

function useDecodedAvatar(
  options: Readonly<{
    selection: AvatarSelection | undefined;
    setDraft: (draft: AvatarDraft | undefined) => void;
    setError: (error: string) => void;
  }>,
): void {
  const { selection, setDraft, setError } = options;
  useEffect(() => {
    if (!selection) {
      return;
    }
    let isCurrent = true;
    setDraft(undefined);
    void getDimensionsFromAvatarUrl(selection.url)
      .then((dimensions) => {
        if (isCurrent) {
          setDraft({
            ...dimensions,
            crop: { centerX: 0.5, centerY: 0.5, zoom: 1 },
            isConfirmed: false,
          });
        }
      })
      .catch((failure: unknown) => {
        if (isCurrent) {
          setError(
            failure instanceof Error && failure.message === "dimensions"
              ? "That photo is too large to process. Choose a smaller copy."
              : "We couldn't open that photo. Choose another.",
          );
        }
      });
    return () => {
      isCurrent = false;
      URL.revokeObjectURL(selection.url);
    };
  }, [selection, setDraft, setError]);
}
