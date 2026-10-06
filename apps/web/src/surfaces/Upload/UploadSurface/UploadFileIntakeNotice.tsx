import { Prose } from "@/system/typography/Prose";
import { useUploadSessionResources } from "@/upload/UploadSessionProvider/useUploadSessionResources";
import type { UploadSnapshot } from "@/upload/createUploadSessionController/createUploadSessionController.types";
import type { ReactNode } from "react";
type Props = { snapshot: UploadSnapshot };

/** Explains why a timeline drop is waiting for the active upload to finish. */
export function UploadFileIntakeNotice({
  snapshot,
}: Readonly<Props>): ReactNode {
  const { fileIntake } = useUploadSessionResources();
  if (
    fileIntake.getPendingFileCount() === 0 ||
    (snapshot.isBusy && !snapshot.isRunning)
  ) {
    return null;
  }
  return (
    <Prose onPanel role="status">
      {snapshot.isRunning
        ? "Your dropped files are kept here. When this upload finishes, choose Upload more to add them."
        : snapshot.recoveryMatches.ambiguous.length > 0
          ? "Your dropped files are kept here. Match or skip the chosen files below to add them."
          : snapshot.error?.operation === "declare"
            ? "Your dropped files are kept here. Continue saving chosen files to add them."
            : snapshot.detail?.state === "settled"
              ? "Your dropped files are kept here. Choose Upload more to start a new batch with them."
              : "Your dropped files are kept here for the next batch."}
    </Prose>
  );
}
