import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { SetUploadVisibilityRequest } from "@memory-shoebox/shared";
import type { UploadSnapshot } from "@/upload/uploadSessionController/uploadSessionController.types";
type VisibilityChoiceState = {
  visibility: SetUploadVisibilityRequest;
  setVisibility: Dispatch<SetStateAction<SetUploadVisibilityRequest>>;
};
function _getVisibilityChoiceFromSnapshot(
  snapshot: Readonly<UploadSnapshot>,
): SetUploadVisibilityRequest {
  return {
    mode: snapshot.detail?.visibility.mode ?? "everyone",
    subjects: (snapshot.detail?.visibility.subjects ?? []).map(
      ({ kind, id }) => {
        return { kind, id };
      },
    ),
  };
}
/** Restores saved rules while retaining this form's choice before its first pick. */
export function useUploadVisibilityChoice(
  snapshot: Readonly<UploadSnapshot>,
): VisibilityChoiceState {
  const session = useRef<string | undefined>(undefined);
  const hasPrePickChoice = useRef(false);
  const [visibility, setChoice] = useState<SetUploadVisibilityRequest>(() => {
    return _getVisibilityChoiceFromSnapshot(snapshot);
  });
  useEffect(
    function restoreSavedVisibility() {
      if (snapshot.detail && session.current !== snapshot.detail.sessionId) {
        if (!hasPrePickChoice.current || session.current) {
          setChoice(_getVisibilityChoiceFromSnapshot(snapshot));
        }
        session.current = snapshot.detail.sessionId;
        hasPrePickChoice.current = false;
      }
      if (!snapshot.detail && snapshot.phase === "idle" && session.current) {
        session.current = undefined;
        hasPrePickChoice.current = false;
        setChoice({ mode: "everyone", subjects: [] });
      }
    },
    [snapshot],
  );
  return {
    visibility,
    setVisibility: (choice) => {
      if (!snapshot.detail) {
        hasPrePickChoice.current = true;
      }
      setChoice(choice);
    },
  };
}
