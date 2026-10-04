import { useEffect, useRef, useState } from "react";
import type { SetUploadVisibilityRequest } from "@memory-shoebox/shared";
import type { UploadSnapshot } from "@/upload/uploadSessionController/uploadSessionController.types";
/** Restores saved rules while retaining a choice made before the first pick. */
export function useUploadVisibilityChoice(snapshot: Readonly<UploadSnapshot>): {
  visibility: SetUploadVisibilityRequest;
  setVisibility: import("react").Dispatch<
    import("react").SetStateAction<SetUploadVisibilityRequest>
  >;
} {
  const session = useRef<string | undefined>(undefined);
  const [visibility, setVisibility] = useState<SetUploadVisibilityRequest>({
    mode: "everyone",
    subjects: [],
  });
  useEffect(
    function restoreSavedVisibility() {
      if (snapshot.detail && session.current !== snapshot.detail.sessionId) {
        session.current = snapshot.detail.sessionId;
        if (snapshot.declarationTotal === 0) {
          setVisibility({
            mode: snapshot.detail.visibility.mode,
            subjects: snapshot.detail.visibility.subjects.map(
              ({ kind, id }) => {
                return { kind, id };
              },
            ),
          });
        }
      }
      if (!snapshot.detail && snapshot.phase === "idle" && session.current) {
        session.current = undefined;
        setVisibility({ mode: "everyone", subjects: [] });
      }
    },
    [snapshot.detail, snapshot.phase, snapshot.declarationTotal],
  );
  return { visibility, setVisibility };
}
