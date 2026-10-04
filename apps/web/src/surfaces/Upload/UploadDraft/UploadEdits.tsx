import type {
  UploadSessionController,
  UploadSnapshot,
} from "@/upload/createUploadSessionController/createUploadSessionController.types";
import { useState, type ReactNode } from "react";
import { UploadSavedPlan } from "./UploadSavedPlan";
type Props = { snapshot: UploadSnapshot; controller: UploadSessionController };

/** Server-owned saved plan; unknown print targets never hide an edit row. */
export function UploadEdits({
  snapshot,
  controller,
}: Readonly<Props>): ReactNode {
  const [error, setError] = useState<string>();
  const [isPending, setIsPending] = useState(false);
  const onUndo = (editId: string) => {
    if (isPending) {
      return;
    }
    setIsPending(true);
    setError(undefined);
    void controller
      .undoEdit(editId)
      .catch((failure: unknown) => {
        setError(failure instanceof Error ? failure.message : String(failure));
      })
      .finally(() => {
        setIsPending(false);
      });
  };
  return <UploadSavedPlan options={{ snapshot, onUndo, isPending, error }} />;
}
