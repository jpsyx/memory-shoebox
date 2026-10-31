import { useCallback, useRef, useState } from "react";
import type { ProfileCompletionOptions } from "./useProfileCompletion/useProfileCompletion";

type PhotoFlow = {
  isNameSaved: boolean;
  hasPhotoFailed: boolean;
  onContinue: (href: string) => void;
  completion: {
    onStagedChange: (save: (() => void) | undefined) => void;
    onFailure: () => void;
  };
  onSaved: () => void;
  retry: () => void;
  continueWithout: () => void;
};

/** Coordinates the name claim with an optional, independently owned photo. */
export function useProfilePhotoCompletion(
  options: Readonly<ProfileCompletionOptions>,
): PhotoFlow {
  const stagedSave = useRef<(() => void) | undefined>(undefined);
  const destination = useRef<string | undefined>(undefined);
  const [isNameSaved, setIsNameSaved] = useState(false);
  const [hasPhotoFailed, setHasPhotoFailed] = useState(false);
  const onStagedChange = useCallback((save: (() => void) | undefined) => {
    stagedSave.current = save;
  }, []);
  const onFailure = useCallback(() => {
    setHasPhotoFailed(true);
  }, []);
  const onContinue = (href: string) => {
    if (href.startsWith("/sign-in") || !stagedSave.current) {
      options.onContinue(href);
      return;
    }
    destination.current = href;
    setIsNameSaved(true);
    setHasPhotoFailed(false);
    stagedSave.current();
  };
  const continueWithout = () => {
    if (destination.current) {
      options.onContinue(destination.current);
    }
  };
  return {
    isNameSaved,
    hasPhotoFailed,
    onContinue,
    completion: { onStagedChange, onFailure },
    onSaved: continueWithout,
    retry: () => {
      if (stagedSave.current) {
        setHasPhotoFailed(false);
        stagedSave.current();
      } else {
        continueWithout();
      }
    },
    continueWithout,
  };
}
